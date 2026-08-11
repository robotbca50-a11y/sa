import { create } from 'zustand';
import type { AppView, User } from '../types';

export type Toast = {
  id: number;
  title: string;
  body?: string;
  icon?: string;
  kind?: 'info' | 'call' | 'story' | 'reel' | 'msg';
  onClick?: () => void;
  duration?: number;
};

type State = {
  view: AppView;
  me: User | null;
  privateKey: CryptoKey | null;
  onlineSet: Record<string, boolean>;
  ghostMode: boolean;
  ghostInterval: number;
  toasts: Toast[];
  unread: Record<string, number>;
  inCall: { with: string } | null;
  incoming: User | null;
  busy: boolean;

  setView: (v: AppView) => void;
  setSession: (u: User | null, key: CryptoKey | null) => void;
  patchMe: (patch: Partial<User>) => void;
  setOnline: (id: string, on: boolean) => void;
  setOnlineAll: (map: Record<string, boolean>) => void;
  toggleGhost: () => void;
  setGhostInterval: (n: number) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  popToast: (id: number) => void;
  addUnread: (key: string, n?: number) => void;
  clearUnread: (key: string) => void;
  setInCall: (c: { with: string } | null) => void;
  setIncoming: (u: User | null) => void;
  setBusy: (b: boolean) => void;
};

let toastId = 0;

export const useStore = create<State>((set, get) => ({
  view: 'landing',
  me: null,
  privateKey: null,
  onlineSet: {},
  ghostMode: false,
  ghostInterval: 30,
  toasts: [],
  unread: {},
  inCall: null,
  incoming: null,
  busy: false,

  setView: (v) => set({ view: v }),
  setSession: (me, privateKey) => set({ me, privateKey }),
  patchMe: (patch) => set((s) => (s.me ? { me: { ...s.me, ...patch } } : {})),
  setOnline: (id, on) =>
    set((s) => ({ onlineSet: { ...s.onlineSet, [id]: on } })),
  setOnlineAll: (map) => set({ onlineSet: map }),
  toggleGhost: () => set((s) => ({ ghostMode: !s.ghostMode })),
  setGhostInterval: (n) => set({ ghostInterval: n }),
  pushToast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    setTimeout(() => get().popToast(id), t.duration ?? 3000);
  },
  popToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  addUnread: (key, n = 1) =>
    set((s) => ({ unread: { ...s.unread, [key]: (s.unread[key] ?? 0) + n } })),
  clearUnread: (key) => set((s) => ({ unread: { ...s.unread, [key]: 0 } })),
  setInCall: (c) => set({ inCall: c }),
  setIncoming: (u) => set({ incoming: u }),
  setBusy: (b) => set({ busy: b }),
}));
