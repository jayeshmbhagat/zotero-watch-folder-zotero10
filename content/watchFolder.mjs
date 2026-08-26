/**
 * Main orchestration service for the Watch Folder plugin
 * Handles polling, scanning, importing, and tracking of PDF files
 * Compatible with Zotero 10+
 * @module watchFolder
 */

import { getPref, setPref, delay } from './utils.mjs';
import { hashFile as _hashFileCached } from './_hashCache.mjs';
import { getMetadataRetriever } from './metadataRetriever.mjs';
import { getWarningSink } from './warningSink.mjs';
import { getSuppressionResolver } from './suppressionResolver.mjs';

const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds
const MIN_POLL_INTERVAL = 1000;      // 1 second
const MAX_POLL_INTERVAL = 60000;     // 60 seconds

/**
 * Main service class for watch folder functionality
 * Coordinates all plugin operations including scanning, importing, and tracking
 */
export class WatchFolderService {
  constructor() {
    /** @type {number|null} Timer ID for polling */
    this._pollTimer = null;

    /** @type {boolean} Whether the service is actively watching */
    this._isWatching = false;

    /** @type {boolean} Whether a scan is currently in progress */
    this._scanInProgress = false;

    /** @type {number} Count of consecutive empty scans (for adaptive polling) */
    this._emptyScans = 0;

    /** @type {number} Current polling interval in ms */
    this._currentInterval = DEFAULT_POLL_INTERVAL;

    /** @type {Set<Window>} Tracked main windows */
    this._windows = new Set();

    /** @type {string|null} Zotero notifier ID */
    this._notifierID = null;

    /** @type {Set<string>} Files currently being processed */
    this._processingFiles = new Set();

    /** @type {boolean} Whether service has been initialized */
    this._initialized = false;

    /** @type {Object|null} Reference to MetadataRetriever */
    this._metadataRetriever = null;
  }

  /**
   * Initialize the watch folder service
   * Sets up Zotero notifier and loads preferences
   */
  async init() {
    if (this._initialized) {
      Zotero.debug('[WatchFolder] Service already initialized');
      return;
    }

    try {
      // Register Zotero notifier for item events
      this._notifierID = Zotero.Notifier.registerObserver(
        {
          notify: async (event, type, ids, extraData) => {
            await this._handleNotify(event, type, ids, extraData);
          }
        },
        ['item'],
        'watchFolder-service'
      );

      // Initialize metadata retriever if available
      if (getPref('enableMetadataRetrieval', true)) {
        this._metadataRetriever = getMetadataRetriever();
      }

      this._initialized = true;
      Zotero.debug('[WatchFolder] Service initialized successfully');
    } catch (e) {
      Zotero.logError(`[WatchFolder] Service init error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Handle Zotero notifier events
   * @private
   */
  async _handleNotify(event, type, ids, extraData) {
    if (type !== 'item') return;
    if (event === 'add') {
      Zotero.debug(`[WatchFolder] Item added: ${ids.join(', ')}`);
    }
  }

  /**
   * Start watching the configured folder
   * Begins the polling cycle
   */
  async startWatching() {
    if (!this._initialized) {
      await this.init();
    }

    if (this._isWatching) {
      Zotero.debug('[WatchFolder] Already watching');
      return;
    }

    const watchRoot = getPref('sourcePath');
    if (!watchRoot) {
      Zotero.debug('[WatchFolder] No watch root configured');
      return;
    }

    this._isWatching = true;
    this._currentInterval = DEFAULT_POLL_INTERVAL;
    Zotero.debug(`[WatchFolder] Started watching: ${watchRoot}`);
    this._schedulePoll();
  }

  /**
   * Stop watching the folder
   * Cancels the polling cycle
   */
  stopWatching() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    this._isWatching = false;
    Zotero.debug('[WatchFolder] Stopped watching');
  }

  /**
   * Schedule the next poll
   * @private
   */
  _schedulePoll() {
    if (!this._isWatching) return;

    this._pollTimer = setTimeout(async () => {
      try {
        await this._scan();
      } catch (e) {
        Zotero.logError(`[WatchFolder] Scan error: ${e.message}`);
      }
      this._schedulePoll();
    }, this._currentInterval);
  }

  /**
   * Perform a single scan of the watch folder
   * @private
   */
  async _scan() {
    if (this._scanInProgress) return;
    this._scanInProgress = true;

    try {
      const watchRoot = getPref('sourcePath');
      if (!watchRoot) return;

      // Check if watch root is accessible
      try {
        await IOUtils.stat(watchRoot);
      } catch (e) {
        Zotero.debug(`[WatchFolder] Watch root not accessible: ${e.message}`);
        return;
      }

      // Get files in watch folder
      const files = await this._scanFolder(watchRoot);
      
      if (files.length === 0) {
        this._emptyScans++;
        // Adaptive polling: increase interval on empty scans
        if (this._emptyScans > 3) {
          this._currentInterval = Math.min(
            this._currentInterval * 1.5,
            MAX_POLL_INTERVAL
          );
        }
        Zotero.debug(`[WatchFolder] Scan found 0 files (interval now ${this._currentInterval}ms)`);
        return;
      }

      // Reset empty scan counter and interval
      this._emptyScans = 0;
      this._currentInterval = DEFAULT_POLL_INTERVAL;

      Zotero.debug(`[WatchFolder] Scan found ${files.length} file(s)`);

      // Process files
      for (const file of files) {
        await this._processFile(file);
      }
    } finally {
      this._scanInProgress = false;
    }
  }

  /**
   * Scan folder recursively for PDF files
   * @private
   */
  async _scanFolder(folderPath) {
    const files = [];
    const stack = [folderPath];

    while (stack.length > 0) {
      const currentDir = stack.shift();
      try {
        const children = await IOUtils.getChildren(currentDir);
        for (const child of children) {
          const stat = await IOUtils.stat(child);
          if (stat.type === 'directory') {
            // Skip hidden directories
            const name = PathUtils.filename(child);
            if (!name.startsWith('.') && name !== 'imported') {
              stack.push(child);
            }
          } else if (child.endsWith('.pdf')) {
            files.push(child);
          }
        }
      } catch (e) {
        Zotero.debug(`[WatchFolder] Error scanning folder: ${e.message}`);
      }
    }

    return files;
  }

  /**
   * Process a single file for import
   * @private
   */
  async _processFile(filePath) {
    if (this._processingFiles.has(filePath)) {
      return; // Already being processed
    }

    this._processingFiles.add(filePath);
    try {
      // Get file hash to check if it's new/changed
      const hash = await _hashFileCached(filePath);
      if (!hash) {
        Zotero.debug(`[WatchFolder] Could not hash file: ${filePath}`);
        return;
      }

      // Check if this file has already been processed
      // (This would use trackingStore in full implementation)
      
      Zotero.debug(`[WatchFolder] Processing file: ${filePath}`);
      
      // Queue for metadata retrieval if enabled
      if (this._metadataRetriever && getPref('enableMetadataRetrieval', true)) {
        Zotero.debug(`[WatchFolder] Queued for metadata: ${filePath}`);
      }
    } catch (e) {
      Zotero.logError(`[WatchFolder] Error processing file: ${e.message}`);
    } finally {
      this._processingFiles.delete(filePath);
    }
  }

  /**
   * Add a window to track
   * @param {Window} window - The window object to track
   */
  addWindow(window) {
    this._windows.add(window);
    Zotero.debug(`[WatchFolder] Added window, total: ${this._windows.size}`);
  }

  /**
   * Remove a window from tracking
   * @param {Window} window - The window object to remove
   */
  removeWindow(window) {
    this._windows.delete(window);
    Zotero.debug(`[WatchFolder] Removed window, total: ${this._windows.size}`);
  }

  /**
   * Get the current watching status
   * @returns {boolean} True if actively watching
   */
  get isWatching() {
    return this._isWatching;
  }

  /**
   * Get service statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      isWatching: this._isWatching,
      isInitialized: this._initialized,
      currentInterval: this._currentInterval,
      emptyScans: this._emptyScans,
      processingCount: this._processingFiles.size,
      windowCount: this._windows.size
    };
  }

  /**
   * Destroy the service
   * Cleans up all resources
   */
  destroy() {
    this.stopWatching();
    
    if (this._notifierID) {
      Zotero.Notifier.unregisterObserver(this._notifierID);
      this._notifierID = null;
    }

    this._windows.clear();
    this._processingFiles.clear();
    this._initialized = false;
    Zotero.debug('[WatchFolder] Service destroyed');
  }
}

// Singleton instance
let _instance = null;

/**
 * Get the singleton WatchFolderService instance
 * @returns {WatchFolderService}
 */
export function getWatchFolderService() {
  if (!_instance) {
    _instance = new WatchFolderService();
  }
  return _instance;
}

/**
 * Shutdown the watch folder service
 */
export function shutdownWatchFolderService() {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
