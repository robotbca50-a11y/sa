// Pin percakapan: disimpan lokal (per perangkat).
const KEY = 'nexus:pins';

export function getPinnedKeys(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function isPinned(key: string): boolean {
  return getPinnedKeys().includes(key);
}

export function togglePin(key: string): boolean {
  const arr = getPinnedKeys();
  const pinned = arr.includes(key);
  const next = pinned ? arr.filter((x) => x !== key) : [...arr, key];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
  return !pinned;
}
