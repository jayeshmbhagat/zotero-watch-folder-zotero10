/**
 * Metadata extraction queue. Recognition is delegated to Zotero's built-in
 * PDF recognizer, with a deterministic filename fallback when recognition is
 * unavailable or cannot identify the document.
 */
import { getPref, delay, getFilename } from './utils.mjs';

export const NEEDS_REVIEW_TAG = '_needs-review';

export class MetadataRetriever {
  constructor() {
    this._queue = [];
    this._queued = new Set();
    this._running = false;
    this._processing = 0;
    this._maxConcurrent = Math.max(1, Number(getPref('maxConcurrentMetadata', 2)) || 2);
  }

  async init() { this._running = true; this._drain(); }
  start() { this._running = true; this._drain(); }
  stop() { this._running = false; }
  queueItem(itemID, onComplete = null) {
    if (!itemID || this._queued.has(itemID)) return;
    this._queued.add(itemID);
    this._queue.push({ itemID, onComplete });
    this._drain();
  }
  queueItems(ids, callback = null) { for (const id of ids) this.queueItem(id, callback); }
  getQueueLength() { return this._queue.length; }
  getActiveCount() { return this._processing; }
  isRunning() { return this._running; }
  updateConfig() { this._maxConcurrent = Math.max(1, Number(getPref('maxConcurrentMetadata', 2)) || 2); }

  async _drain() {
    while (this._running && this._processing < this._maxConcurrent && this._queue.length) {
      const job = this._queue.shift();
      this._queued.delete(job.itemID);
      this._processing++;
      this._retrieve(job.itemID).then(async success => {
        try { await job.onComplete?.(success, job.itemID); }
        catch (error) { Zotero.logError(`[WatchFolder] Metadata callback failed: ${error?.message ?? error}`); }
      }).catch(error => Zotero.logError(`[WatchFolder] Metadata retrieval failed: ${error?.message ?? error}`))
        .finally(() => { this._processing--; void delay(250).then(() => this._drain()); });
    }
  }

  async _retrieve(itemID) {
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return false;
    if (this._hasMetadata(item)) return true;
    if (!item.isAttachment?.() || item.attachmentContentType !== 'application/pdf') return true;

    try {
      if (!Zotero.RecognizeDocument?.recognizeItems) throw new Error('PDF recognizer unavailable');
      await Zotero.RecognizeDocument.recognizeItems([item]);
      // Recognition updates the item asynchronously. Give Zotero a short
      // opportunity to flush its transaction before checking the parent.
      await delay(1000);
      const refreshed = await Zotero.Items.getAsync(itemID);
      if (refreshed && this._hasMetadata(refreshed)) return true;
    } catch (error) {
      Zotero.debug(`[WatchFolder] Recognition failed: ${error?.message ?? error}`);
    }
    await this._addNeedsReviewTag(item);
    return false;
  }

  _hasMetadata(item) {
    try {
      if (item.isAttachment?.()) {
        const parent = item.parentID ? Zotero.Items.get(item.parentID) : null;
        return !!parent && !parent.deleted && !!parent.getField('title');
      }
      const title = item.getField('title');
      return !!title && !/\.(pdf|epub|djvu)$/i.test(title);
    } catch (_e) { return false; }
  }

  async _addNeedsReviewTag(item) {
    try {
      const target = item.parentID ? (Zotero.Items.get(item.parentID) || item) : item;
      if (!target.getTags().some(tag => tag.tag === NEEDS_REVIEW_TAG)) {
        target.addTag(NEEDS_REVIEW_TAG);
        await target.saveTx();
      }
    } catch (error) { Zotero.debug(`[WatchFolder] Could not add review tag: ${error?.message ?? error}`); }
  }

  destroy() { this.stop(); this._queue = []; this._queued.clear(); }
}

let instance;
export function getMetadataRetriever() { return instance ||= new MetadataRetriever(); }
export async function initMetadataRetriever() { const retriever = getMetadataRetriever(); await retriever.init(); return retriever; }
export function shutdownMetadataRetriever() { instance?.destroy(); instance = null; }
