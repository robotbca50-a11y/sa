/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { Capacitor } from '@capacitor/core';
import { nxRpc } from './api';
import { loadToken } from './session';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';


export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let lastToken: string | null = null;
let registered = false;
let registrationError: string | null = null;

export function nativePushStatus() {
  return { isNative: isNativeApp(), registered, token: lastToken, error: registrationError };
}

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
  }
}

type NativePushMsg = { title: string; body: string; convId?: string };

export async function initNativePush(
  onForeground: (m: NativePushMsg) => void,
  onAction: (m: NativePushMsg) => void,
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    PushNotifications.addListener('registration', (r) => {
      lastToken = r.value;
      registered = true;
      registrationError = null;
      const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
      saveNativeToken(r.value, platform);
    });

    PushNotifications.addListener('registrationError', (e) => {
      registrationError = typeof e === 'string' ? e : JSON.stringify(e);
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
  }
}

export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (lastToken) await removeNativeToken(lastToken);
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.unregister();
  } catch {
  }
}

export async function testNativePushSelf(
  uid: string,
): Promise<{ ok: boolean; sent: number; results: any[]; err?: string }> {
  if (!isNativeApp()) return { ok: false, sent: 0, results: [], err: 'Bukan app native.' };
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const granted = await requestNativeNotifPermission();
    if (!granted) {
      return { ok: false, sent: 0, results: [], err: 'Izin notifikasi belum diberikan (cek pengaturan sistem).' };
    }
    if (!registered || !lastToken) {
      await PushNotifications.register();
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!lastToken) {
      return {
        ok: false,
        sent: 0,
        results: [],
        err: registrationError
          ? `Registrasi FCM gagal: ${registrationError}`
          : 'Token FCM belum didapat. Pastikan google-services.json terpasang lalu build ulang APK.',
      };
    }
    const platform = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
    const saved = await saveNativeToken(lastToken, platform);
    if (!saved) return { ok: false, sent: 0, results: [], err: 'Gagal menyimpan token FCM ke server.' };
    const token = loadToken();
    if (!token) return { ok: false, sent: 0, results: [], err: 'Sesi login tidak ditemukan.' };
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
        convId: '',
        self_test: true,
      }),
    });
    const j = await res.json();
    return { ok: !!j.ok, sent: j.sent ?? 0, results: j.results ?? [], err: j.err };
  } catch (e) {
    return { ok: false, sent: 0, results: [], err: String(e) };
  }
}
