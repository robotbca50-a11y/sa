import { useStore } from './store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { loadToken } from './session';
import { nxRpc } from './api';

// VAPID public key dari pasangan key yang di-generate untuk NEXUS.
// Private key-nya dipakai edge function `send-push` (env / bawaan).
export const VAPID_PUBLIC_KEY =
  'BFwdxTFwDJGB__zI658UFftiEqtxVNcd_0pzo740H0Cr5hwSK0IAZdHOkT35Qwci-PawfRndPpL6UWIiPi9oGBU';

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
  return 'Notification' in window && 'PushManager' in window;
}

export async function requestNotifPermission(): Promise<boolean> {
  if (!notifSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function getSubscription(): Promise<PushSubscription | null> {
  if (!swReady || !notifSupported() || Notification.permission !== 'granted') return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    return sub;
  } catch {
    return null;
  }
}

export async function savePushSub(sub: PushSubscription | null): Promise<boolean> {
  if (!sub) return false;
  try {
    const { error } = await nxRpc('save_push_subscription', { p_subscription: sub.toJSON() });
    return !error;
  } catch {
    return false;
  }
}

// Dipanggil otomatis saat login + dari tombol bel: minta izin (kalau belum)
// lalu subscribe + simpan ke database supaya edge function bisa kirim push.
export async function ensurePush(): Promise<boolean> {
  if (!notifSupported()) return false;
  if (!swReady) await initNotifications();
  if (Notification.permission === 'default') {
    const ok = await requestNotifPermission();
    if (!ok) return false;
  }
  if (Notification.permission !== 'granted') return false;
  const sub = await getSubscription();
  return savePushSub(sub);
}

// Saat logout: hapus subscription dari DB + matikan push perangkat ini.
export async function unsubscribePush(): Promise<void> {
  try {
    if (!swReady) await initNotifications();
    const sub = await getSubscription();
    if (sub) {
      await nxRpc('delete_push_subscription', { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch {
    /* noop */
  }
}

// Kirim push ke perangkat penerima lewat edge function `send-push`.
// Dipanggil SETELAH pesan berhasil terkirim. Gagal tidak mempengaruhi chat.
export async function triggerPush(recipientIds: string[], title: string, body: string, url = '/') {
  const token = loadToken();
  if (!token || !recipientIds.length) return;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-nexus-token': token,
      },
      body: JSON.stringify({ user_ids: recipientIds.slice(0, 50), title, body, url }),
    });
  } catch {
    /* noop */
  }
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
