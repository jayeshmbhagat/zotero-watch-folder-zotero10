import { getPref, isAllowedFileType } from './utils.mjs';
import { hashFile } from './_hashCache.mjs';
import { importFile } from './fileImporter.mjs';
import { getMetadataRetriever } from './metadataRetriever.mjs';
import { getTrackingStore, initTrackingStore } from './trackingStore.mjs';

function relativeToRoot(filePath, root) {
  const normalizedFile = String(filePath).replaceAll('\\', '/');
  const normalizedRoot = String(root).replaceAll('\\', '/').replace(/\/$/, '');
  return normalizedFile.startsWith(`${normalizedRoot}/`) ? normalizedFile.slice(normalizedRoot.length + 1) : normalizedFile;
}

export class WatchFolderService {
  constructor() { this._pollTimer = null; this._isWatching = false; this._scanInProgress = false; this._processingFiles = new Set(); this._initialized = false; this._metadataRetriever = null; this._trackingStore = null; }

  async init() {
    if (this._initialized) return;
    this._trackingStore = await initTrackingStore();
    this._metadataRetriever = getPref('enableMetadataRetrieval', true) ? getMetadataRetriever() : null;
    if (this._metadataRetriever) await this._metadataRetriever.init();
    this._initialized = true;
  }
  async startWatching() { await this.init(); if (this._isWatching || !getPref('sourcePath')) return; this._isWatching = true; this._schedulePoll(5000); }
  stopWatching() { if (this._pollTimer) clearTimeout(this._pollTimer); this._pollTimer = null; this._isWatching = false; }
  _schedulePoll(ms) { if (!this._isWatching) return; this._pollTimer = setTimeout(async () => { try { await this._scan(); } catch (e) { Zotero.logError(`[WatchFolder] Scan failed: ${e?.message ?? e}`); } this._schedulePoll(5000); }, ms); }

  async _scan() {
    if (this._scanInProgress) return;
    this._scanInProgress = true;
    try { const root = getPref('sourcePath'); if (root && await IOUtils.exists(root)) for (const file of await this._scanFolder(root)) await this._processFile(file); }
    finally { this._scanInProgress = false; }
  }
  async _scanFolder(root) {
    const files = [], pending = [root];
    while (pending.length) for (const child of await IOUtils.getChildren(pending.shift())) {
      const stat = await IOUtils.stat(child);
      if (stat.type === 'directory') { const name = PathUtils.filename(child); if (!name.startsWith('.') && name !== 'imported') pending.push(child); }
      else if (isAllowedFileType(child)) files.push(child);
    }
    return files;
  }

  async _processFile(filePath) {
    if (this._processingFiles.has(filePath)) return;
    this._processingFiles.add(filePath);
    try {
      const root = getPref('sourcePath');
      const statBefore = await IOUtils.stat(filePath);
      await new Promise(resolve => setTimeout(resolve, 100));
      const statAfter = await IOUtils.stat(filePath);
      if (statBefore.size !== statAfter.size || statBefore.lastModified !== statAfter.lastModified) return;
      const hash = await hashFile(filePath, statAfter);
      if (!hash) return;
      const relativePath = relativeToRoot(filePath, root);
      const tracked = this._trackingStore.getFile(relativePath);
      if (tracked?.lastSyncedHash === hash) return;
      const duplicate = this._trackingStore.getFilesByHash(hash).find(record => record.localPath !== relativePath);
      if (duplicate) { this._trackingStore.addOrUpdateFile(relativePath, duplicate.zoteroAttachmentKey, hash, { lastSyncedSize: statAfter.size, lastSyncedMtime: statAfter.lastModified }); await this._trackingStore.save(); return; }
      const attachment = await importFile(filePath);
      this._trackingStore.addOrUpdateFile(relativePath, attachment.key || String(attachment.id), hash, { lastSyncedSize: statAfter.size, lastSyncedMtime: statAfter.lastModified, zoteroParentItemID: attachment.parentID || null });
      await this._trackingStore.save();
      if (this._metadataRetriever && attachment.id) this._metadataRetriever.queueItem(attachment.id);
    } catch (error) { Zotero.logError(`[WatchFolder] Could not process ${filePath}: ${error?.message ?? error}`); }
    finally { this._processingFiles.delete(filePath); }
  }

  get isWatching() { return this._isWatching; }
  getStats() { return { isWatching: this._isWatching, isInitialized: this._initialized, processingCount: this._processingFiles.size, trackedFiles: this._trackingStore?.getAllFiles().length || 0 }; }
  async scanNow() { await this.init(); return this._scan(); }
  destroy() { this.stopWatching(); this._metadataRetriever?.destroy(); this._metadataRetriever = null; this._trackingStore = null; this._initialized = false; }
}
let instance;
export function getWatchFolderService() { return instance ||= new WatchFolderService(); }
export function shutdownWatchFolderService() { instance?.destroy(); instance = null; }
