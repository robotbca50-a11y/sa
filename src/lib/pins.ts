/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

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
  }
  return !pinned;
}
