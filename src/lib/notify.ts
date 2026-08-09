import { useStore } from './store';

let swReady = false;

export async function initNotifications() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    swReady = true;
    return reg;
  } catch {
    swReady = false;
  }
}

export function notifSupported() {
  return 'Notification' in window;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!notifSupported()) return false;
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

export async function subscribePush(): Promise<PushSubscription | null> {
  if (!swReady || !notifSupported() || Notification.permission !== 'granted') return null;
  try {
    return await navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          localStorage.getItem('nexus:vapid') ||
            'BK4f7mdwW6tnrKc2uHgPKp8QZQJ8nN2Qk9yKpZb6V9r3T0sX7dW4yL1gO5mF8eHf2k5iDmN3tGzV9aC0bW7Q',
        ),
      }),
    );
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

// Notifikasi saat halaman open / background tab
export function nativeNotify(title: string, body?: string) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/nexus.svg' });
  } catch {
    /* noop */
  }
}

export function appNotify(title: string, body: string, opts: { icon?: string; onClick?: () => void } = {}) {
  const st = useStore.getState();
  st.pushToast({
    title,
    body,
    icon: opts.icon,
    kind: 'msg',
    onClick: opts.onClick,
  });
  const hidden = document.hidden;
  if (hidden) {
    document.title = `● ${title} — NEXUS`;
    nativeNotify(title, body);
  }
}

export function updateTitle(unreadTotal: number) {
  document.title = unreadTotal > 0 ? `(${unreadTotal}) NEXUS` : 'NEXUS // Chat Terenkripsi';
}
