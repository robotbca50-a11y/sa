import type { Msg, User } from '../types';

const SESSION_KEY = 'nexus:user';
const START_KEY = 'nexus:session:start';
const ACTIVE_KEY = 'nexus:last-active';
const MSG_CACHE_TTL = 5 * 60 * 1000;

const SESSION_MAX_MS = 24 * 60 * 60 * 1000;
const IDLE_MAX_MS = 7 * 60 * 60 * 1000;

export function saveSession(user: User) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (!localStorage.getItem(START_KEY)) localStorage.setItem(START_KEY, String(Date.now()));
    localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {
    /* storage penuh */
  }
}

export function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as User;
    const now = Date.now();
    const start = Number(localStorage.getItem(START_KEY)) || now;
    const last = Number(localStorage.getItem(ACTIVE_KEY)) || now;
    if (now - start > SESSION_MAX_MS) {
      clearSession();
      return null;
    }
    if (now - last > IDLE_MAX_MS) {
      clearSession();
      return null;
    }
    localStorage.setItem(START_KEY, String(start));
    localStorage.setItem(ACTIVE_KEY, String(now));
    return user;
  } catch {
    clearSession();
    return null;
  }
}

export function touchSession() {
  try {
    if (localStorage.getItem(SESSION_KEY)) localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  } catch {
    /* noop */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(START_KEY);
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* noop */
  }
}

const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart', 'click', 'mousemove'];

export function attachIdleWatcher(onLogout: () => void): () => void {
  const bump = () => touchSession();
  ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
  const iv = window.setInterval(() => {
    try {
      if (!localStorage.getItem(SESSION_KEY)) return;
      const last = Number(localStorage.getItem(ACTIVE_KEY)) || Date.now();
      if (Date.now() - last > IDLE_MAX_MS) {
        clearSession();
        onLogout();
      }
    } catch {
      /* noop */
    }
  }, 60 * 1000);
  return () => {
    ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
    window.clearInterval(iv);
  };
}

export function readMsgCache(key: string): Msg[] | null {
  try {
    const raw = localStorage.getItem(`nexus:cache:msgs:${key}`);
    if (!raw) return null;
    const { t, msgs } = JSON.parse(raw) as { t: number; msgs: Msg[] };
    if (Date.now() - t > MSG_CACHE_TTL) {
      localStorage.removeItem(`nexus:cache:msgs:${key}`);
      return null;
    }
    return msgs;
  } catch {
    return null;
  }
}

export function writeMsgCache(key: string, msgs: Msg[]) {
  try {
    localStorage.setItem(`nexus:cache:msgs:${key}`, JSON.stringify({ t: Date.now(), msgs }));
  } catch {
    /* storage penuh */
  }
}
