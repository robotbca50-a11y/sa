/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useSyncExternalStore } from 'react';

const BG_KEY = 'nexus:chatbg';

export const CHAT_BGS: { id: string; label: string; css: string }[] = [
  { id: 'abyss', label: 'Abyss', css: '' },
  { id: 'neon', label: 'Neon', css: 'linear-gradient(180deg,#031018 0%,#062233 55%,#0a0f1e 100%)' },
  { id: 'virus', label: 'Virus', css: 'linear-gradient(180deg,#160614 0%,#30102a 55%,#0a0f1e 100%)' },
  { id: 'forest', label: 'Forest', css: 'linear-gradient(180deg,#04140d 0%,#0a2a1c 55%,#0a0f1e 100%)' },
  { id: 'amber', label: 'Amber', css: 'linear-gradient(180deg,#1a1204 0%,#33260b 55%,#0a0f1e 100%)' },
];

const subs = new Set<() => void>();
let version = 0;
function emit() {
  version += 1;
  subs.forEach((fn) => fn());
}

export function getChatBg(): string {
  try {
    return localStorage.getItem(BG_KEY) ?? 'abyss';
  } catch {
    return 'abyss';
  }
}

export function setChatBg(id: string) {
  try {
    localStorage.setItem(BG_KEY, id);
  } catch {
  }
  emit();
}

export function chatBgCss(id: string): string {
  return CHAT_BGS.find((b) => b.id === id)?.css ?? '';
}

export function useChatBgVersion(): number {
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
