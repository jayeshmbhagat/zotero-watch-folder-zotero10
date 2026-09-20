/**
 * Imports files into Zotero and applies the selected storage strategy.
 * Zotero 10 uses the public Attachments APIs used below.
 */
import { getPref, getFilename } from './utils.mjs';

export const STRATEGY = Object.freeze({
  STORED: 'stored',
  LINKED_WATCH_FOLDER: 'linked_watch_folder',
  STORED_PLUS_MIRROR: 'stored_plus_mirror',
});

export function getStorageStrategy() {
  return getPref('pdfStorageStrategy', getPref('storageStrategy', STRATEGY.STORED));
}

async function resolveCollection(collection, libraryID) {
  if (collection && typeof collection === 'object') return collection;
  const key = collection || getPref('syncRootCollectionKey');
  if (!key || !Zotero.Collections?.getByLibraryAndKeyAsync) return null;
  return Zotero.Collections.getByLibraryAndKeyAsync(libraryID, key);
}

export async function importFile(filePath, options = {}) {
  if (!filePath || !(await IOUtils.exists(filePath))) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const strategy = options.storageStrategy || getStorageStrategy();
  const libraryID = options.libraryID || Zotero.Libraries.userLibraryID;
  const collection = await resolveCollection(options.collection, libraryID);
  const collections = collection?.id ? [collection.id] : (options.collections || []);
  const filename = getFilename(filePath);
  let item;

  try {
    if (strategy === STRATEGY.LINKED_WATCH_FOLDER) {
      item = await Zotero.Attachments.linkFromFile({ file: filePath, collections });
    } else {
      item = await Zotero.Attachments.importFromFile({
        file: filePath,
        libraryID,
        collections,
        ...(options.parentItemID ? { parentItemID: options.parentItemID } : {}),
      });
    }
  } catch (error) {
    Zotero.logError(`[WatchFolder] Import failed for ${filename}: ${error?.message ?? error}`);
    throw new Error(`Failed to import ${filename}: ${error?.message ?? error}`);
  }

  if (!item) throw new Error(`Zotero returned no item for ${filename}`);
  Zotero.debug(`[WatchFolder] Imported ${filename} (${strategy})`);
  return item;
}

export async function handlePostImportAction(filePath, action = null) {
  const selected = action || getPref('postImportAction', 'leave');
  if (selected === 'leave') return { action: 'leave', finalPath: filePath };
  if (selected === 'delete') {
    await IOUtils.remove(filePath);
    return { action: 'delete', finalPath: null };
  }
  if (selected === 'move') {
    const root = getPref('sourcePath');
    const relative = root && filePath.startsWith(root)
      ? filePath.slice(root.length).replace(/^[/\\]/, '')
      : getFilename(filePath);
    const destination = PathUtils.join(root || PathUtils.parent(filePath), 'imported', relative);
    await IOUtils.makeDirectory(PathUtils.parent(destination), { createAncestors: true });
    await IOUtils.move(filePath, destination);
    return { action: 'move', finalPath: destination };
  }
  return { action: 'leave', finalPath: filePath };
}

export function isSupportedFileType(filePath) {
  return isAllowedExtension(getFilename(filePath));
}

function isAllowedExtension(filename) {
  return /\.pdf$/i.test(filename);
}

export function filterSupportedFiles(paths) {
  return paths.filter(isSupportedFileType);
}
