/**
 * Shared utilities for the Watch Folder plugin.
 */
export const PREF_PREFIX = 'extensions.zotero.watchFolder.';

export function getPref(key, fallback = undefined) {
  try {
    const value = Zotero.Prefs.get(PREF_PREFIX + key, true);
    return value === undefined || value === null ? fallback : value;
  } catch (_e) {
    return fallback;
  }
}

export function setPref(key, value) {
  Zotero.Prefs.set(PREF_PREFIX + key, value, true);
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getFilename(filePath) {
  return PathUtils.filename(filePath);
}

export function isAllowedFileType(filename) {
  const configured = getPref('fileTypes', 'pdf');
  const types = String(configured || 'pdf')
    .split(',').map(type => type.trim().toLowerCase()).filter(Boolean);
  const extension = getFilename(filename).split('.').pop()?.toLowerCase() || '';
  return types.includes(extension);
}

export async function getFileHash(filePath) {
  try {
    const data = await IOUtils.read(filePath);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    Zotero.debug(`[WatchFolder] Hash error: ${error?.message ?? error}`);
    return null;
  }
}
