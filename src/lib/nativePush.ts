import { Capacitor } from '@capacitor/core';
import { nxRpc } from './api';
import { loadToken } from './session';

// Lapisan notifikasi NATIVE (APK). Di web semua ini tidak dipakai:
// browser pakai Web Push via sw.js. Di APK (Capacitor) Web Push tidak
// tersedia — penggantinya Firebase Cloud Messaging (FCM) via plugin
// @capacitor/push-notifications. Token FCM disimpan di tabel
// `device_tokens` dan edge function `send-push` mengirim ke perangkat native.
//
// SYARAT build APK dengan notif:
//   1. taruh google-services.json dari Firebase console di android/app/
//   2. jalankan  npx cap sync android
// Tanpa itu app tetap build & jalan, tapi notif native tidak terkirim.

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let lastToken: string | null = null;

export async function requestNativeNotifPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const st = await PushNotifications.checkPermissions();
    if (st.receive === 'granted') return true;
    if (st.receive === 'denied') return false;
    const req = await PushNotifications.requestPermissions();
    return req.receive === 'granted';
  } catch {
    return false;
  }
}

// Daftarkan token FCM perangkat ke DB (caller = pemilik token).
async function saveNativeToken(token: string, platform: string): Promise<boolean> {
  try {
    const { error } = await nxRpc('save_device_token', { p_token: token, p_platform: platform });
    return !error;
  } catch {
    return false;
  }
}

export async function removeNativeToken(token: string) {
  try {
    await nxRpc('delete_device_token', { p_token: token });
  } catch {
    /* noop */
  }
}

type NativePushMsg = { title: string; body: string; convId?: string };

// Pasang listener FCM + daftarkan token perangkat. `onForeground` dipanggil
// saat app DI FRONT (penerimaan via pushNotificationReceived), `onAction`
// dipanggil saat user mengetuk notif / tombol balas.
export async function initNativePush(
  onForeground: (m: NativePushMsg) => void,
  onAction: (m: NativePushMsg) => void,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    PushNotifications.addListener('registration', (r) => {
      lastToken = r.value;
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      saveNativeToken(r.value, platform);
    });

    PushNotifications.addListener('registrationError', () => {
      /* Firebase belum dikonfigurasi (google-services.json belum ada) */
    });

    PushNotifications.addListener('pushNotificationReceived', (n) => {
      const data = n.data ?? {};
      onForeground({
        title: n.title ?? 'NEXUS',
        body: n.body ?? '',
        convId: typeof data.convId === 'string' ? data.convId : undefined,
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (res) => {
      const n = res.notification;
      const data = n.data ?? {};
      onAction({
        title: n.title ?? 'NEXUS',
        body: n.body ?? '',
        convId: typeof data.convId === 'string' ? data.convId : undefined,
      });
    });

    if (!loadToken()) return;
    const ok = await requestNativeNotifPermission();
    if (ok) {
      await PushNotifications.register();
    }
  } catch {
    /* noop */
  }
}

// Saat logout: berhenti menerima push native + hapus token dari DB.
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (lastToken) await removeNativeToken(lastToken);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister();
  } catch {
    /* noop */
  }
}
