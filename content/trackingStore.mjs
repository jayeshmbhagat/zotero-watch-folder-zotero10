/**
 * Tracking Store for Zotero Watch Folder Plugin
 * Compatible with Zotero 10+
 *
 * Manages persistent state of synced files, collections, and tombstones.
 * Stores metadata needed to detect changes and reconcile between disk and library.
 */

import { getPref, setPref } from './utils.mjs';

export const STATE = {
  CLEAN: 'clean',
  DIRTY: 'dirty',
  CONFLICT: 'conflict',
  MISSING: 'missing'
};

/**
 * FileRecord: represents a tracked file on disk
 */
export function createFileRecord(localPath, zoteroAttachmentKey, lastSyncedHash) {
  return {
    type: 'file',
    localPath,
    zoteroAttachmentKey,
    zoteroParentItemID: null,
    lastSyncedHash,
    lastSyncedSize: 0,
    lastSyncedMtime: 0,
    canonicalCollectionKey: null,
    state: STATE.CLEAN,
    suppressed: false,
    suppressionReason: null
  };
}

/**
 * CollectionRecord: represents a tracked Zotero collection
 */
export function createCollectionRecord(zoteroCollectionKey, canonicalPath) {
  return {
    type: 'collection',
    zoteroCollectionKey,
    canonicalPath,
    lastSyncedItemCount: 0,
    state: STATE.CLEAN
  };
}

/**
 * TombstoneRecord: represents a deleted item (for Mode 3 two-way sync)
 */
export function createTombstoneRecord(deletedItemKey, deletedItemType, relatedAttachmentKey, reason) {
  return {
    type: 'tombstone',
    deletedItemKey,
    deletedItemType,
    relatedAttachmentKey,
    reason,
    deletedAt: Date.now(),
    recoveryPath: null
  };
}

/**
 * TrackingStore class
 * Manages in-memory state and persistent storage
 */
export class TrackingStore {
  constructor() {
    this._files = new Map();           // localPath -> FileRecord
    this._collections = new Map();     // collectionKey -> CollectionRecord
    this._tombstones = [];              // Array<TombstoneRecord>

    // Secondary indexes for fast lookups
    this._byAttachmentKey = new Map(); // attachmentKey -> FileRecord
    this._byHash = new Map();          // hash -> Array<FileRecord>
    this._byAttachmentKeyAll = new Map(); // All attachment keys (include suppressed)
    this._tombstonesByHash = new Map(); // hash -> Array<TombstoneRecord>
    this._tombstonesByAttachmentKey = new Map(); // attachmentKey -> TombstoneRecord

    this._initialized = false;
    this._dirty = false;
    this._saveTimer = null;
    this._pendingSave = null;
    this._resolvePending = null;
    this._rejectPending = null;
  }

  /**
   * Initialize the tracking store
   */
  async init() {
    if (this._initialized) return;
    
    try {
      await this.load();
      this._initialized = true;
      Zotero.debug('[WatchFolder] TrackingStore initialized');
    } catch (e) {
      Zotero.logError(`[WatchFolder] TrackingStore init error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Add or update a file record
   */
  addOrUpdateFile(localPath, attachmentKey, hash) {
    const record = this._files.get(localPath) || createFileRecord(localPath, attachmentKey, hash);
    record.zoteroAttachmentKey = attachmentKey;
    record.lastSyncedHash = hash;
    record.state = STATE.CLEAN;
    this._files.set(localPath, record);
    this._byAttachmentKey.set(attachmentKey, record);
    this._byAttachmentKeyAll.set(attachmentKey, record);
    this._updateHashIndex(localPath, hash);
    this._markDirty();
    Zotero.debug(`[WatchFolder] Tracked file: ${localPath}`);
  }

  /**
   * Add or update a collection record
   */
  addOrUpdateCollection(collectionKey, canonicalPath) {
    const record = this._collections.get(collectionKey) || createCollectionRecord(collectionKey, canonicalPath);
    record.canonicalPath = canonicalPath;
    record.state = STATE.CLEAN;
    this._collections.set(collectionKey, record);
    this._markDirty();
    Zotero.debug(`[WatchFolder] Tracked collection: ${collectionKey} -> ${canonicalPath}`);
  }

  /**
   * Add a tombstone for a deleted item
   */
  addTombstone(deletedItemKey, deletedItemType, attachmentKey, reason) {
    const record = createTombstoneRecord(deletedItemKey, deletedItemType, attachmentKey, reason);
    this._tombstones.push(record);
    if (attachmentKey) {
      this._tombstonesByAttachmentKey.set(attachmentKey, record);
    }
    this._markDirty();
    Zotero.debug(`[WatchFolder] Added tombstone: ${deletedItemKey}`);
  }

  /**
   * Get file record by local path
   */
  getFile(localPath) {
    return this._files.get(localPath);
  }

  /**
   * Get file record by attachment key
   */
  getFileByAttachmentKey(attachmentKey) {
    return this._byAttachmentKey.get(attachmentKey);
  }

  /**
   * Get collection record
   */
  getCollection(collectionKey) {
    return this._collections.get(collectionKey);
  }

  /**
   * Remove file record
   */
  removeFile(localPath) {
    const record = this._files.get(localPath);
    if (record && record.zoteroAttachmentKey) {
      this._byAttachmentKey.delete(record.zoteroAttachmentKey);
    }
    this._files.delete(localPath);
    this._markDirty();
  }

  /**
   * Remove file by attachment key
   */
  removeByAttachmentKey(attachmentKey) {
    const record = this._byAttachmentKey.get(attachmentKey);
    if (record) {
      this._files.delete(record.localPath);
    }
    this._byAttachmentKey.delete(attachmentKey);
    this._markDirty();
  }

  /**
   * Clear all tracking data
   */
  clear() {
    this._files.clear();
    this._collections.clear();
    this._tombstones = [];
    this._byAttachmentKey.clear();
    this._byHash.clear();
    this._byAttachmentKeyAll.clear();
    this._tombstonesByHash.clear();
    this._tombstonesByAttachmentKey.clear();
    this._markDirty();
  }

  /**
   * Get record count
   */
  get count() {
    return this._files.size + this._collections.size + this._tombstones.length;
  }

  /**
   * Update hash index
   * @private
   */
  _updateHashIndex(localPath, hash) {
    if (!hash) return;
    if (!this._byHash.has(hash)) {
      this._byHash.set(hash, []);
    }
    const records = this._byHash.get(hash);
    if (!records.some(r => r.localPath === localPath)) {
      records.push(this._files.get(localPath));
    }
  }

  /**
   * Rebuild all indexes
   * @private
   */
  _rebuildIndexes() {
    this._byAttachmentKey.clear();
    this._byHash.clear();
    this._byAttachmentKeyAll.clear();
    this._tombstonesByHash.clear();
    this._tombstonesByAttachmentKey.clear();

    for (const record of this._files.values()) {
      if (record.zoteroAttachmentKey) {
        this._byAttachmentKey.set(record.zoteroAttachmentKey, record);
        this._byAttachmentKeyAll.set(record.zoteroAttachmentKey, record);
      }
      if (record.lastSyncedHash) {
        this._updateHashIndex(record.localPath, record.lastSyncedHash);
      }
    }

    for (const record of this._tombstones) {
      if (record.relatedAttachmentKey) {
        this._tombstonesByAttachmentKey.set(record.relatedAttachmentKey, record);
      }
    }
  }

  /**
   * Mark store as dirty (needs save)
   * @private
   */
  _markDirty() {
    if (this._dirty) return;
    this._dirty = true;
    this._debouncedSave();
  }

  /**
   * Debounced save
   * @private
   */
  _debouncedSave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }
    this._saveTimer = setTimeout(async () => {
      await this.save();
    }, 1000);
  }

  /**
   * Save tracking state to disk
   */
  async save() {
    if (!this._dirty || !this._initialized) return;

    try {
      const data = {
        files: Array.from(this._files.values()),
        collections: Array.from(this._collections.values()),
        tombstones: this._tombstones
      };

      const json = JSON.stringify(data, null, 2);
      const storePath = this._getStorePath();
      await IOUtils.writeUTF8(storePath, json);
      this._dirty = false;
      Zotero.debug('[WatchFolder] TrackingStore saved');
    } catch (e) {
      Zotero.logError(`[WatchFolder] TrackingStore save error: ${e.message}`);
    }
  }

  /**
   * Load tracking state from disk
   */
  async load() {
    try {
      const storePath = this._getStorePath();
      let fileContent = '';
      try {
        fileContent = await IOUtils.readUTF8(storePath);
      } catch (e) {
        Zotero.debug(`[WatchFolder] TrackingStore not found: ${e.message}`);
        this._rebuildIndexes();
        this._dirty = false;
        return;
      }

      const data = JSON.parse(fileContent);
      this._files.clear();
      this._collections.clear();
      this._tombstones.length = 0;

      for (const rec of (data.files ?? [])) {
        if (rec?.localPath && rec.type === 'file') {
          this._files.set(rec.localPath, rec);
        }
      }
      for (const rec of (data.collections ?? [])) {
        if (rec?.zoteroCollectionKey && rec.type === 'collection') {
          this._collections.set(rec.zoteroCollectionKey, rec);
        }
      }
      for (const rec of (data.tombstones ?? [])) {
        if (rec?.type === 'tombstone') {
          this._tombstones.push(rec);
        }
      }

      this._rebuildIndexes();
      this._dirty = false;
      Zotero.debug(`[WatchFolder] TrackingStore loaded: ${this._files.size} files, ${this._collections.size} collections, ${this._tombstones.length} tombstones`);
    } catch (e) {
      Zotero.logError(`[WatchFolder] TrackingStore load error: ${e.message}`);
      this._files.clear();
      this._collections.clear();
      this._tombstones.length = 0;
      this._rebuildIndexes();
      this._dirty = false;
    }
  }

  /**
   * Get storage path for tracking data
   * @private
   */
  _getStorePath() {
    const dataDir = Zotero.DataDirectory.dir;
    return PathUtils.join(dataDir, 'watch-folder-tracking.json');
  }

  /**
   * Destroy the store
   */
  destroy() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._files.clear();
    this._collections.clear();
    this._tombstones.length = 0;
    this._byAttachmentKey.clear();
    this._byHash.clear();
    this._byAttachmentKeyAll.clear();
    this._tombstonesByHash.clear();
    this._tombstonesByAttachmentKey.clear();
    this._initialized = false;
    this._dirty = false;
  }
}

// Singleton instance
let _defaultStore = null;

/**
 * Get or create the default tracking store singleton
 * @returns {TrackingStore}
 */
export function getTrackingStore() {
  if (!_defaultStore) {
    _defaultStore = new TrackingStore();
  }
  return _defaultStore;
}

/**
 * Initialize the default tracking store
 * @returns {Promise<TrackingStore>}
 */
export async function initTrackingStore() {
  const store = getTrackingStore();
  await store.init();
  return store;
}

/**
 * Reset the singleton (test only)
 */
export function resetTrackingStore() {
  if (_defaultStore) {
    _defaultStore.destroy();
  }
  _defaultStore = null;
}
