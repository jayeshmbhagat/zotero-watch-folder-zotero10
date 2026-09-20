import { getPref } from './utils.mjs';

export const STATE = Object.freeze({ CLEAN: 'clean', DIRTY: 'dirty', CONFLICT: 'conflict', MISSING: 'missing' });

export function createFileRecord(localPath, zoteroAttachmentKey, lastSyncedHash, extra = {}) {
  return {
    type: 'file', localPath, zoteroAttachmentKey: zoteroAttachmentKey || null,
    zoteroParentItemID: extra.zoteroParentItemID ?? null,
    lastSyncedHash: lastSyncedHash || null,
    lastSyncedSize: extra.lastSyncedSize ?? 0,
    lastSyncedMtime: extra.lastSyncedMtime ?? 0,
    canonicalCollectionKey: extra.canonicalCollectionKey ?? null,
    state: extra.state ?? STATE.CLEAN,
    suppressed: false, suppressionReason: null,
  };
}

export function createCollectionRecord(zoteroCollectionKey, canonicalPath) {
  return { type: 'collection', zoteroCollectionKey, canonicalPath, lastSyncedItemCount: 0, state: STATE.CLEAN };
}

export function createTombstoneRecord(deletedItemKey, deletedItemType, relatedAttachmentKey, reason) {
  return { type: 'tombstone', deletedItemKey, deletedItemType, relatedAttachmentKey, reason, deletedAt: Date.now(), recoveryPath: null };
}

export class TrackingStore {
  constructor() {
    this._files = new Map();
    this._collections = new Map();
    this._tombstones = [];
    this._byAttachmentKey = new Map();
    this._byHash = new Map();
    this._initialized = false;
    this._dirty = false;
    this._saveTimer = null;
  }

  async init() { if (!this._initialized) { await this.load(); this._initialized = true; } }

  addOrUpdateFile(localPath, attachmentKey, hash, extra = {}) {
    const old = this._files.get(localPath);
    if (old?.zoteroAttachmentKey && old.zoteroAttachmentKey !== attachmentKey) this._byAttachmentKey.delete(old.zoteroAttachmentKey);
    const record = old || createFileRecord(localPath, attachmentKey, hash, extra);
    Object.assign(record, { zoteroAttachmentKey: attachmentKey || record.zoteroAttachmentKey, lastSyncedHash: hash || record.lastSyncedHash, ...extra, state: STATE.CLEAN });
    this._files.set(localPath, record);
    this._rebuildIndexes();
    this._markDirty();
    return record;
  }

  getFile(localPath) { return this._files.get(localPath) || null; }
  getFileByAttachmentKey(key) { return this._byAttachmentKey.get(key) || null; }
  getFilesByHash(hash) { return [...(this._byHash.get(hash) || [])]; }
  hasHash(hash) { return this._byHash.has(hash); }
  getAllFiles() { return [...this._files.values()]; }

  addOrUpdateCollection(key, path) {
    const record = this._collections.get(key) || createCollectionRecord(key, path);
    record.canonicalPath = path; record.state = STATE.CLEAN; this._collections.set(key, record); this._markDirty(); return record;
  }
  getCollection(key) { return this._collections.get(key) || null; }
  addTombstone(a, b, c, d) { this._tombstones.push(createTombstoneRecord(a, b, c, d)); this._markDirty(); }
  removeFile(path) { this._files.delete(path); this._rebuildIndexes(); this._markDirty(); }
  removeByAttachmentKey(key) { const record = this.getFileByAttachmentKey(key); if (record) this.removeFile(record.localPath); }
  clear() { this._files.clear(); this._collections.clear(); this._tombstones = []; this._rebuildIndexes(); this._markDirty(); }
  get count() { return this._files.size + this._collections.size + this._tombstones.length; }

  _rebuildIndexes() {
    this._byAttachmentKey.clear(); this._byHash.clear();
    for (const record of this._files.values()) {
      if (record.zoteroAttachmentKey) this._byAttachmentKey.set(record.zoteroAttachmentKey, record);
      if (record.lastSyncedHash) {
        const list = this._byHash.get(record.lastSyncedHash) || [];
        if (!list.includes(record)) list.push(record);
        this._byHash.set(record.lastSyncedHash, list);
      }
    }
  }
  _markDirty() { this._dirty = true; if (this._saveTimer) clearTimeout(this._saveTimer); this._saveTimer = setTimeout(() => this.save(), 1000); }

  async save() {
    if (!this._dirty || !this._initialized) return;
    const data = { version: 1, files: [...this._files.values()], collections: [...this._collections.values()], tombstones: this._tombstones };
    await IOUtils.writeUTF8(this._getStorePath(), JSON.stringify(data, null, 2));
    this._dirty = false;
  }
  async load() {
    this._files.clear(); this._collections.clear(); this._tombstones = [];
    try {
      const data = JSON.parse(await IOUtils.readUTF8(this._getStorePath()));
      for (const record of data.files || []) if (record?.type === 'file' && record.localPath) this._files.set(record.localPath, record);
      for (const record of data.collections || []) if (record?.type === 'collection' && record.zoteroCollectionKey) this._collections.set(record.zoteroCollectionKey, record);
      this._tombstones = (data.tombstones || []).filter(record => record?.type === 'tombstone');
    } catch (_e) { /* First run or corrupt state: start clean. */ }
    this._rebuildIndexes(); this._dirty = false;
  }
  _getStorePath() { return PathUtils.join(Zotero.DataDirectory.dir, 'watch-folder-tracking.json'); }
  destroy() { if (this._saveTimer) clearTimeout(this._saveTimer); this._files.clear(); this._collections.clear(); this._tombstones = []; this._rebuildIndexes(); this._initialized = false; this._dirty = false; }
}

let instance = null;
export function getTrackingStore() { return instance ||= new TrackingStore(); }
export async function initTrackingStore() { const store = getTrackingStore(); await store.init(); return store; }
export function resetTrackingStore() { instance?.destroy(); instance = null; }
