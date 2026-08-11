import { useStore } from './store';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { loadToken } from './session';
import { nxRpc } from './api';

// VAPID public key dari pasangan key yang di-generate untuk NEXUS.
// Private key-nya dipakai edge function `send-push` (env / bawaan).
export const VAPID_PUBLIC_KEY =
  'BCvqpN_i_rOrbBAPO-daH_qM842sebVxaI7w3OzmUl88X6-V0n-f04crvOXceOr0CzDhIcKb54Hmbtms8kcuK20';

let swReady = false;
let pushActive = false;

export function notifSupported() {
  return 'Notification' in window && 'PushManager' in window;
}

// Daftarkan service worker saja, TANPA meminta izin. Permission di browser
// mobile (Android Chrome & iOS Safari) HANYA bisa diminta dari user gesture,
// jadi izin diminta via ensurePush() yang dipicu klik tombol 🔔.
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

// Dipanggil dari tombol bel (user gesture): minta izin (kalau belum) lalu
// subscribe + simpan ke database supaya edge function bisa kirim push.
export async function ensurePush(): Promise<boolean> {
  if (!notifSupported()) return false;
  if (!swReady) await initNotifications();
  if (Notification.permission === 'default') {
    const ok = await requestNotifPermission();
    if (!ok) return false;
  }
  if (Notification.permission !== 'granted') return false;
  const sub = await getSubscription();
  const ok = await savePushSub(sub);
  pushActive = ok;
  return ok;
}

// Dipanggil saat app dibuka (TANPA meminta izin): kalau izin sudah granted,
// pastikan subscription perangkat ini tetap tersimpan di DB. Menutup lubang
// kalau baris sempat hilang (misal auto-clean versi lama / perangkat logout),
// biar notif tetap nyala tanpa perlu tekan 🔔 ulang.
export async function persistPushSub(): Promise<boolean> {
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  if (!swReady) await initNotifications();
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
// CATATAN: TIDAK bergantung pada pushActive si pengirim — yang penting penerima
// yang sudah aktifkan push. Edge function memvalidasi via token + filter target.
export async function triggerPush(recipientIds: string[], title: string, body: string, url = '/') {
  if (!recipientIds.length) return;
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

// Uji notif ke perangkat SENDIRI (tombol "UJI NOTIF"). Menjamin subscription
// tersimpan lalu mengirim push ke diri sendiri; mengembalikan hasil detail
// (sent berapa, dan alasan kalau gagal) untuk memudahkan debug di perangkat.
export async function testPushSelf(uid: string): Promise<{ ok: boolean; sent: number; results: any[]; err?: string }> {
  if (!notifSupported()) return { ok: false, sent: 0, results: [], err: 'Browser ini tidak mendukung push notification.' };
  if (!swReady) await initNotifications();
  if (Notification.permission !== 'granted') {
    const granted = await requestNotifPermission();
    if (!granted) {
      return { ok: false, sent: 0, results: [], err: 'Izin notifikasi belum diberikan.' };
    }
  }
  const sub = await getSubscription();
  const saved = await savePushSub(sub);
  if (!saved) return { ok: false, sent: 0, results: [], err: 'Gagal menyimpan pendaftaran perangkat ke server.' };
  const token = loadToken();
  if (!token) return { ok: false, sent: 0, results: [], err: 'Sesi login tidak ditemukan.' };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-nexus-token': token,
      },
      body: JSON.stringify({
        user_ids: [uid],
        title: '🔔 UJI NOTIF',
        body: 'Kalau kamu lihat ini, push notification NEXUS jalan!',
        url: '/',
        self_test: true,
      }),
    });
    const j = await res.json();
    return { ok: !!j.ok, sent: j.sent ?? 0, results: j.results ?? [], err: j.err };
  } catch (e) {
    return { ok: false, sent: 0, results: [], err: String(e) };
  }
}

// Notifikasi sistem — hanya muncul saat tab tersembunyi (di background), biar
// tidak dobel dengan toast in-app dan tidak mengganggu user yang sedang buka.
export function nativeNotify(title: string, body?: string) {
  if (!notifSupported() || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    new Notification(title, { body, icon: '/nexus.svg', tag: `nexus:${title}` });
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
  if (document.hidden) {
    document.title = `● ${title} — NEXUS`;
  }
  // Notifikasi sistem muncul saat app di background — tetap muncul walau user
  // sedang di tab lain atau PWA yang dipasang di layar utama.
  nativeNotify(title, body);
}

export function updateTitle(unreadTotal: number) {
  document.title = unreadTotal > 0 ? `(${unreadTotal}) NEXUS` : 'NEXUS // Chat Terenkripsi';
}
