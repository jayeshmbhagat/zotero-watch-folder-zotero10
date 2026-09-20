import { describe, expect, it, beforeEach } from 'vitest';
import { TrackingStore } from '../content/trackingStore.mjs';

describe('tracking store', () => {
  beforeEach(() => {
    globalThis.PathUtils = { join: (...parts) => parts.join('/') };
    globalThis.Zotero = { DataDirectory: { dir: '/data' }, debug: () => {} };
    globalThis.IOUtils = { writeUTF8: async () => {}, readUTF8: async () => { throw new Error('missing'); } };
  });
  it('indexes files by path and hash', () => {
    const store = new TrackingStore();
    store.addOrUpdateFile('paper.pdf', 'ATT1', 'HASH1');
    expect(store.getFile('paper.pdf').zoteroAttachmentKey).toBe('ATT1');
    expect(store.getFilesByHash('HASH1')).toHaveLength(1);
  });
});
