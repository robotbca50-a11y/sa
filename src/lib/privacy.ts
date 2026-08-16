/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useSyncExternalStore } from 'react';

const BLOCK_KEY = 'nexus:blocked';
const MUTE_KEY = 'nexus:mute';
const SEEN_KEY = 'nexus:lastseen';
const NOTIF_KEY = 'nexus:notifpriv';
const ARCHIVE_KEY = 'nexus:archived';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
  emit();
}

const subs = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  subs.forEach((fn) => fn());
}
export function subscribePrivacy(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}

export function getBlocked(): string[] {
  return readJSON<string[]>(BLOCK_KEY, []);
}
export function isBlocked(id: string): boolean {
  return getBlocked().includes(id);
}
export function toggleBlocked(id: string): boolean {
  const cur = getBlocked();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  writeJSON(BLOCK_KEY, next);
  return cur.includes(id);
}

export function getMuted(): string[] {
  return readJSON<string[]>(MUTE_KEY, []);
}
export function isMuted(key: string): boolean {
  return getMuted().includes(key);
}
export function toggleMuted(key: string): boolean {
  const cur = getMuted();
  const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
  writeJSON(MUTE_KEY, next);
  return cur.includes(key);
}

export function getLastSeen(): Record<string, string> {
  return readJSON<Record<string, string>>(SEEN_KEY, {});
}
export function noteLastSeen(id: string) {
  const seen = getLastSeen();
  seen[id] = new Date().toISOString();
  writeJSON(SEEN_KEY, seen);
}
export function formatLastSeen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `terakhir online ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  return `terakhir online ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
}

export function getNotifPrivacy(): boolean {
  return readJSON<boolean>(NOTIF_KEY, false);
}
export function setNotifPrivacy(v: boolean) {
  writeJSON(NOTIF_KEY, v);
}

export function getArchived(): string[] {
  return readJSON<string[]>(ARCHIVE_KEY, []);
}
export function isArchived(key: string): boolean {
  return getArchived().includes(key);
}
export function toggleArchived(key: string): boolean {
  const cur = getArchived();
  const next = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key];
  writeJSON(ARCHIVE_KEY, next);
  return cur.includes(key);
}

export function usePrivacyVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      window.addEventListener('storage', cb);
      return () => {
        subs.delete(cb);
        window.removeEventListener('storage', cb);
      };
    },
    () => version,
    () => version,
  );
}
