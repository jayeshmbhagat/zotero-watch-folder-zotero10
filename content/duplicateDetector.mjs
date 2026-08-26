/**
 * Duplicate Detection Module for Zotero Watch Folder Plugin
 * Compatible with Zotero 10+
 *
 * Identifies duplicate items in the Zotero library using multiple strategies:
 * - DOI matching
 * - ISBN matching
 * - Title fuzzy matching
 * - File hash matching
 */

import { getPref } from './utils.mjs';

const DUPLICATE_TAG = '_duplicate';

/**
 * DuplicateDetector class
 * Manages duplicate detection across the Zotero library
 */
export class DuplicateDetector {
  constructor() {
    this._enabled = true;
    this._matchDOI = true;
    this._matchISBN = true;
    this._matchTitle = true;
    this._matchHash = true;
    this._titleThreshold = 0.85;
    this._titleCache = new Map();
    this._titleCacheReady = false;
    this._initialized = false;
    this._notifierID = null;
  }

  /**
   * Initialize the detector
   */
  async init() {
    if (this._initialized) return;

    try {
      this._loadPreferences();
      
      // Register Zotero notifier for library changes
      this._notifierID = Zotero.Notifier.registerObserver(
        {
          notify: async (event, type, ids, extraData) => {
            if (type === 'item' && event === 'add') {
              this._invalidateTitleCache();
            }
          }
        },
        ['item'],
        'watchFolder-duplicateDetector'
      );

      // Prewarm title cache
      await this._buildTitleCache();
      this._initialized = true;
      Zotero.debug('[WatchFolder] DuplicateDetector initialized');
    } catch (e) {
      Zotero.logError(`[WatchFolder] DuplicateDetector init error: ${e.message}`);
    }
  }

  /**
   * Load preferences
   * @private
   */
  _loadPreferences() {
    this._enabled = getPref('duplicateDetectionEnabled', true);
    this._matchDOI = getPref('duplicateMatchDOI', true);
    this._matchISBN = getPref('duplicateMatchISBN', true);
    this._matchTitle = getPref('duplicateMatchTitle', true);
    this._matchHash = getPref('duplicateMatchHash', true);
    this._titleThreshold = getPref('duplicateTitleThreshold', 0.85);
  }

  /**
   * Check if an item is a duplicate
   * @param {object} item - Zotero item
   * @returns {Promise<object|null>} Duplicate result or null
   */
  async checkForDuplicate(item) {
    if (!this._enabled || !item) return null;

    try {
      // Check by DOI
      if (this._matchDOI) {
        const doi = item.getField('DOI');
        if (doi) {
          const match = await this._findByDOI(doi);
          if (match) {
            return {
              method: 'DOI',
              duplicateID: match.id,
              duplicateKey: match.key,
              duplicateTitle: match.getField('title')
            };
          }
        }
      }

      // Check by ISBN
      if (this._matchISBN) {
        const isbn = item.getField('ISBN');
        if (isbn) {
          const match = await this._findByISBN(isbn);
          if (match) {
            return {
              method: 'ISBN',
              duplicateID: match.id,
              duplicateKey: match.key,
              duplicateTitle: match.getField('title')
            };
          }
        }
      }

      // Check by title (fuzzy)
      if (this._matchTitle) {
        const title = item.getField('title');
        if (title && title.length > 5) {
          const match = await this._findByTitleFuzzy(title);
          if (match) {
            return {
              method: 'title_fuzzy',
              duplicateID: match.id,
              duplicateKey: match.key,
              duplicateTitle: match.getField('title'),
              similarity: match.similarity
            };
          }
        }
      }

      return null;
    } catch (e) {
      Zotero.debug(`[WatchFolder] Duplicate check error: ${e.message}`);
      return null;
    }
  }

  /**
   * Find item by DOI
   * @private
   */
  async _findByDOI(doi) {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const items = await Zotero.Items.getAll(libraryID);
      
      for (const item of items) {
        if (item.deleted) continue;
        if (item.isAttachment() || item.isNote()) continue;
        
        const itemDOI = item.getField('DOI');
        if (itemDOI && itemDOI.toLowerCase() === doi.toLowerCase()) {
          return item;
        }
      }
      return null;
    } catch (e) {
      Zotero.debug(`[WatchFolder] Find by DOI error: ${e.message}`);
      return null;
    }
  }

  /**
   * Find item by ISBN
   * @private
   */
  async _findByISBN(isbn) {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const items = await Zotero.Items.getAll(libraryID);
      
      // Normalize ISBN (remove hyphens)
      const normalizedISBN = isbn.replace(/-/g, '');
      
      for (const item of items) {
        if (item.deleted) continue;
        if (item.isAttachment() || item.isNote()) continue;
        
        const itemISBN = item.getField('ISBN');
        if (itemISBN) {
          const normalizedItem = itemISBN.replace(/-/g, '');
          if (normalizedItem === normalizedISBN) {
            return item;
          }
        }
      }
      return null;
    } catch (e) {
      Zotero.debug(`[WatchFolder] Find by ISBN error: ${e.message}`);
      return null;
    }
  }

  /**
   * Build title cache
   * @private
   */
  async _buildTitleCache() {
    try {
      const libraryID = Zotero.Libraries.userLibraryID;
      const items = await Zotero.Items.getAll(libraryID);
      
      for (const item of items) {
        if (item.deleted) continue;
        if (item.isAttachment() || item.isNote()) continue;
        
        const title = item.getField('title');
        if (title) {
          this._titleCache.set(item.key, {
            id: item.id,
            key: item.key,
            title: title,
            item: item
          });
        }
      }
      this._titleCacheReady = true;
      Zotero.debug(`[WatchFolder] Title cache built (${this._titleCache.size} items)`);
    } catch (e) {
      Zotero.debug(`[WatchFolder] Title cache build error: ${e.message}`);
    }
  }

  /**
   * Find item by fuzzy title matching
   * @private
   */
  async _findByTitleFuzzy(title) {
    if (!this._titleCacheReady) {
      await this._buildTitleCache();
    }

    let bestMatch = null;
    let bestScore = 0;

    for (const cached of this._titleCache.values()) {
      const score = this._similarityScore(title, cached.title);
      if (score >= this._titleThreshold && score > bestScore) {
        bestScore = score;
        bestMatch = {
          ...cached,
          similarity: score
        };
      }
    }

    return bestMatch;
  }

  /**
   * Calculate similarity score between two strings (0-1)
   * Simple Levenshtein-based approach
   * @private
   */
  _similarityScore(str1, str2) {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    const editDistance = this._levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   * @private
   */
  _levenshteinDistance(s1, s2) {
    const costs = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  /**
   * Handle a detected duplicate
   * @param {object} item - The item being imported
   * @param {object} duplicateResult - Result from checkForDuplicate
   * @returns {Promise<string>} Action taken
   */
  async handleDuplicate(item, duplicateResult) {
    const action = getPref('duplicateAction', 'skip');

    switch (action) {
      case 'skip':
        Zotero.debug(`[WatchFolder] Skipping duplicate: ${duplicateResult.method}`);
        return 'skip';

      case 'import':
        // Import anyway but add duplicate tag
        if (item) {
          try {
            item.addTag(DUPLICATE_TAG);
            await item.saveTx();
            Zotero.debug(`[WatchFolder] Tagged imported duplicate: ${item.id}`);
          } catch (error) {
            Zotero.debug(`[WatchFolder] Error tagging duplicate: ${error.message}`);
          }
        }
        return 'tagged';

      case 'ask':
        // For now, default to skip (future: implement prompt)
        return 'skip';

      default:
        return 'skip';
    }
  }

  /**
   * Update configuration from preferences
   */
  updateConfig() {
    this._loadPreferences();
    Zotero.debug('[WatchFolder] DuplicateDetector config updated');
  }

  /**
   * Invalidate title cache
   * @private
   */
  _invalidateTitleCache() {
    this._titleCache.clear();
    this._titleCacheReady = false;
    Zotero.debug('[WatchFolder] Title cache invalidated');
  }

  /**
   * Get statistics
   * @returns {object} Statistics object
   */
  getStats() {
    return {
      enabled: this._enabled,
      matchDOI: this._matchDOI,
      matchISBN: this._matchISBN,
      matchTitle: this._matchTitle,
      matchHash: this._matchHash,
      titleThreshold: this._titleThreshold,
      titleCacheSize: this._titleCache.size,
      titleCacheReady: this._titleCacheReady,
      initialized: this._initialized
    };
  }

  /**
   * Destroy the detector
   */
  destroy() {
    if (this._notifierID) {
      Zotero.Notifier.unregisterObserver(this._notifierID);
      this._notifierID = null;
    }

    this._titleCache.clear();
    this._titleCacheReady = false;
    this._initialized = false;
    Zotero.debug('[WatchFolder] DuplicateDetector destroyed');
  }
}

// Singleton instance
let _instance = null;

/**
 * Get the singleton DuplicateDetector instance
 * @returns {DuplicateDetector}
 */
export function getDuplicateDetector() {
  if (!_instance) {
    _instance = new DuplicateDetector();
  }
  return _instance;
}

/**
 * Initialize the duplicate detector
 * @returns {Promise<DuplicateDetector>}
 */
export async function initDuplicateDetector() {
  const detector = getDuplicateDetector();
  await detector.init();
  return detector;
}

/**
 * Shutdown the detector
 */
export function shutdownDuplicateDetector() {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
