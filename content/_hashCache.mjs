/** Small SHA-256 cache keyed by path, size, and modification time. */
import { getFileHash } from './utils.mjs';

const cache = new Map();
export async function hashFile(path, statHint = null) {
  if (!path) return null;
  let stat = statHint;
  try { stat ||= await IOUtils.stat(path); } catch (_e) { stat = null; }
  const key = stat ? `${path}|${stat.size}|${stat.lastModified}` : null;
  if (key && cache.has(key)) return cache.get(key);
  const hash = await getFileHash(path);
  if (key && hash) {
    cache.set(key, hash);
    if (cache.size > 2000) cache.delete(cache.keys().next().value);
  }
  return hash;
}
export function clear() { cache.clear(); }
