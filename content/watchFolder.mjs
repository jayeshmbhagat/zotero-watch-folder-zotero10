import { getPref, isAllowedFileType } from './utils.mjs';
import { hashFile } from './_hashCache.mjs';
import { importFile } from './fileImporter.mjs';
import { getMetadataRetriever } from './metadataRetriever.mjs';

export class WatchFolderService {
  constructor() {
    this._pollTimer = null;
    this._isWatching = false;
    this._scanInProgress = false;
    this._processingFiles = new Set();
    this._initialized = false;
    this._metadataRetriever = null;
  }

  async init() {
    if (this._initialized) return;
    this._metadataRetriever = getPref('enableMetadataRetrieval', true) ? getMetadataRetriever() : null;
    if (this._metadataRetriever) await this._metadataRetriever.init();
    this._initialized = true;
  }

  async startWatching() {
    await this.init();
    if (this._isWatching || !getPref('sourcePath')) return;
    this._isWatching = true;
    this._schedulePoll(5000);
  }

  stopWatching() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    this._isWatching = false;
  }

  _schedulePoll(delayMs) {
    if (!this._isWatching) return;
    this._pollTimer = setTimeout(async () => {
      try { await this._scan(); } catch (error) { Zotero.logError(`[WatchFolder] Scan failed: ${error?.message ?? error}`); }
      this._schedulePoll(5000);
    }, delayMs);
  }

  async _scan() {
    if (this._scanInProgress) return;
    this._scanInProgress = true;
    try {
      const root = getPref('sourcePath');
      if (!root || !(await IOUtils.exists(root))) return;
      for (const file of await this._scanFolder(root)) await this._processFile(file);
    } finally { this._scanInProgress = false; }
  }

  async _scanFolder(root) {
    const files = [], pending = [root];
    while (pending.length) {
      const directory = pending.shift();
      for (const child of await IOUtils.getChildren(directory)) {
        const stat = await IOUtils.stat(child);
        if (stat.type === 'directory') {
          const name = PathUtils.filename(child);
          if (!name.startsWith('.') && name !== 'imported') pending.push(child);
        } else if (isAllowedFileType(child)) files.push(child);
      }
    }
    return files;
  }

  async _processFile(filePath) {
    if (this._processingFiles.has(filePath)) return;
    this._processingFiles.add(filePath);
    try {
      const stat = await IOUtils.stat(filePath);
      const hash = await hashFile(filePath, stat);
      if (!hash) return;
      const attachment = await importFile(filePath);
      if (this._metadataRetriever && attachment.id) {
        this._metadataRetriever.queueItem(attachment.id);
      }
      Zotero.debug(`[WatchFolder] Processed ${filePath}`);
    } catch (error) { Zotero.logError(`[WatchFolder] Could not process ${filePath}: ${error?.message ?? error}`); }
    finally { this._processingFiles.delete(filePath); }
  }

  get isWatching() { return this._isWatching; }
  getStats() { return { isWatching: this._isWatching, isInitialized: this._initialized, processingCount: this._processingFiles.size }; }
  destroy() { this.stopWatching(); this._metadataRetriever?.destroy(); this._metadataRetriever = null; this._initialized = false; }
}

let instance;
export function getWatchFolderService() { return instance ||= new WatchFolderService(); }
export function shutdownWatchFolderService() { instance?.destroy(); instance = null; }
