import { describe, expect, it } from 'vitest';

function installGlobals() {
  globalThis.PathUtils = { filename: path => path.split('/').pop(), parent: path => path.split('/').slice(0, -1).join('/'), join: (...parts) => parts.join('/') };
  globalThis.IOUtils = { exists: async () => true };
  globalThis.Zotero = { Libraries: { userLibraryID: 1 }, Prefs: { get: () => undefined }, Attachments: { importFromFile: async args => ({ id: 1, key: 'ATT1', ...args }), linkFromFile: async args => ({ id: 2, key: 'ATT2', ...args }) }, debug: () => {}, logError: () => {} };
}

describe('file importer', () => {
  it('imports a stored PDF into the requested collection', async () => {
    installGlobals();
    const { importFile } = await import('../content/fileImporter.mjs');
    const item = await importFile('/watch/paper.pdf', { collection: { id: 9, libraryID: 1 }, storageStrategy: 'stored' });
    expect(item.id).toBe(1);
    expect(Zotero.Attachments.importFromFile).toBeDefined();
  });

  it('uses linked attachment mode', async () => {
    installGlobals();
    const { importFile } = await import('../content/fileImporter.mjs');
    const item = await importFile('/watch/paper.pdf', { storageStrategy: 'linked_watch_folder' });
    expect(item.id).toBe(2);
  });
});
