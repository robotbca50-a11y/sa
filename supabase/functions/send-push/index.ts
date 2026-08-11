// NEXUS — Edge Function untuk push notification beneran (Web Push).
// Deploy: supabase functions deploy send-push
// WAJIB set secrets dulu (kalau belum):
//   supabase secrets set VAPID_SUBJECT=mailto:admin@nexus.app
//   supabase secrets set VAPID_PUBLIC_KEY=<base64 public>
//   supabase secrets set VAPID_PRIVATE_KEY=<base64 private>
//   supabase secrets set FCM_SERVICE_ACCOUNT=<JSON service account Firebase>
// Public key harus SAMA dengan yang dipakai client (src/lib/notify.ts).
// Tanpa VAPID_PRIVATE_KEY edge function menolak kirim (tidak ada fallback),
// supaya kunci private tidak pernah bocor ke repo.
// FCM_SERVICE_ACCOUNT (opsional): kalau di-set, pesan juga dikirim ke
// perangkat NATIVE (APK) via Firebase Cloud Messaging HTTP v1.
// Dipanggil client: POST { user_ids: string[], title, body, url }
//   header wajib: x-nexus-token = token login si pengirim
//
// CATATAN: panggilan DB memakai fetch polos (bukan supabase-js) karena
// postgrest-js versi tertentu TIDAK meneruskan header custom di opsi .rpc(),
// jadi header x-nexus-token tidak pernah sampai ke fungsi DB. Dengan fetch
// polos header dijamin ikut terkirim (persis pola nxRpc di client).
/// <reference path="./deno.d.ts" />

import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';

const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@nexus.app';
const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

// Service account FCM (JSON dari Firebase console). Kalau ada, edge function
// juga mengirim ke perangkat NATIVE (APK) via FCM HTTP v1. Tanpa ini hanya
// web push (browser/PWA) yang jalan.
const FCM_SERVICE_ACCOUNT = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '';

const MAX_TARGETS = 50;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

// FCM v1 butuh OAuth2 access token yang dibuat dari service account (JWT
// RS256 ditandatangani dengan kunci privat service account). Token berlaku 1
// jam, di-cache di sini.
let fcmAccessToken: { value: string; expiresAt: number } | null = null;

function parseServiceAccount(raw: string) {
  try {
    const o = JSON.parse(raw);
    if (!o.client_email || !o.private_key || !o.project_id) return null;
    return o as { client_email: string; private_key: string; project_id: string };
  } catch {
    return null;
  }
}

function b64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function signJwt(header: string, payload: string, pemKey: string): Promise<string> {
  const der = pemKey
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const raw = Uint8Array.from(atob(der), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    raw as BufferSource,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${b64url(sig)}`;
}

async function getFcmAccessToken(): Promise<string | null> {
  const acc = parseServiceAccount(FCM_SERVICE_ACCOUNT);
  if (!acc) return null;
  if (fcmAccessToken && fcmAccessToken.expiresAt > Date.now() + 60_000) {
    return fcmAccessToken.value;
  }
  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = b64url(
      JSON.stringify({
        iss: acc.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      }),
    );
    const assertion = await signJwt(header, payload, acc.private_key);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const j = await res.json();
    if (!res.ok || !j.access_token) return null;
    fcmAccessToken = { value: j.access_token, expiresAt: now * 1000 + (j.expires_in ?? 3600) * 1000 };
    return fcmAccessToken.value;
  } catch {
    return null;
  }
}

async function sendFcm(token: string, title: string, body: string, data: Record<string, string>): Promise<void> {
  const acc = parseServiceAccount(FCM_SERVICE_ACCOUNT);
  if (!acc) return;
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return;
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data,
        android: { priority: 'high' },
      },
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    const err = (j && (j as { error?: { message?: string } }).error?.message) || `HTTP ${res.status}`;
    throw new Error(err);
  }
}

// Browser butuh CORS: fetch dari domain web ke edge function memicu preflight
// OPTIONS (custom header x-nexus-token + application/json). Tanpa header ini
// browser menolak request = "TypeError: Failed to fetch".
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-nexus-token',
  'Access-Control-Max-Age': '86400',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

function fail(msg: string, status = 400): Response {
  return json({ ok: false, err: msg }, status);
}

async function rpc<T>(name: string, body: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'x-nexus-token': token,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data as { message?: unknown }).message) || text || `HTTP ${res.status}`;
    return { data: null as T | null, error: String(msg) };
  }
  return { data: data as T, error: null };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  try {
    // Wajib login: edge function dipanggil client dengan x-nexus-token.
    const token = req.headers.get('x-nexus-token') ?? '';
    if (!token) return fail('Unauthorized', 401);

    const { data: uid, error: authErr } = await rpc<string | null>('require_auth', {}, token);
    if (authErr || !uid) return fail('Unauthorized', 401);

    if (!PRIVATE_KEY) {
      return fail('VAPID_PRIVATE_KEY belum di-set di Edge Function secrets. Push nonaktif.', 500);
    }

    const body = await req.json();

    // Keep-warm: panggilan ringan dari app (mount + tiap 5 menit) supaya
    // function tidak cold-start saat pesan asli dikirim — cold start inilah
    // yang bikin notif telat beberapa detik.
    if (body?.warm === true) return json({ ok: true, warm: true });

    const selfTest = body?.self_test === true;
    const user_ids: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids.map(String)
      : body?.user_id
        ? [String(body.user_id)]
        : [];
    if (!user_ids.length) return fail('Butuh user_id / user_ids.');

    // Mode uji diri sendiri (tombol "UJI NOTIF"): kirim ke akun sendiri,
    // SKIP filter target. Hanya boleh ke uid sendiri — user lain tetap difilter.
    let targets_ids: string[];
    if (selfTest) {
      const onlySelf = user_ids.filter((id) => id === uid).slice(0, 1);
      if (!onlySelf.length) return fail('self_test hanya bisa ke akun sendiri.', 400);
      targets_ids = onlySelf;
    } else {
      // Hanya kirim ke user yang benar-benar berhubungan dengan pengirim
      // (satu DM / satu grup). User asing tidak bisa di-push.
      const { data: allowed, error: filterErr } = await rpc<Array<{ user_id: string }>>(
        'filter_notify_targets',
        { p_from: uid, p_ids: user_ids },
        token,
      );
      if (filterErr) return fail(filterErr, 502);
      targets_ids = (allowed ?? [])
        .map((r) => String(r.user_id))
        .slice(0, MAX_TARGETS);
      if (!targets_ids.length) return fail('Tidak ada penerima yang valid.', 400);
    }

    // Akses via RPC security-definer, bukan query langsung — tabel di-lock RLS.
    // Saat self-test, target = diri sendiri, jadi pakai RPC "milik saya" karena
    // get_push_subscriptions_for_users sengaja MEMBUANG target diri sendiri
    // (x.id <> v_uid) demi anti-panen.
    const { data: rows, error: subErr } = selfTest
      ? await rpc<Array<{ subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } | null } }>>(
          'get_my_push_subscriptions',
          {},
          token,
        )
      : await rpc<Array<{ subscription: { endpoint: string; keys?: { p256dh?: string; auth?: string } | null } }>>(
          'get_push_subscriptions_for_users',
          { p_user_ids: targets_ids },
          token,
        );
    if (subErr) return fail(subErr, 502);

    const targets: Array<{ endpoint: string; keys?: { p256dh?: string; auth?: string } | null }> = [];
    for (const row of rows ?? []) {
      if (row?.subscription?.endpoint) targets.push(row.subscription);
    }

    // Perangkat NATIVE (APK/iOS): token FCM. Jalan kalau FCM_SERVICE_ACCOUNT di-set.
    const devRows: Array<{ token: string; platform: string }> = [];
    if (parseServiceAccount(FCM_SERVICE_ACCOUNT)) {
      const { data: dev, error: devErr } = selfTest
        ? await rpc<Array<{ token: string; platform: string }>>('get_my_device_tokens', {}, token)
        : await rpc<Array<{ token: string; platform: string }>>(
            'get_device_tokens_for_users',
            { p_user_ids: targets_ids },
            token,
          );
      if (devErr) return fail(devErr, 502);
      devRows.push(...(dev ?? []));
    }

    if (!targets.length && !devRows.length) return fail('Tidak ada subscription push aktif.', 404);

    const payload = JSON.stringify({ title: body?.title ?? 'NEXUS', body: body?.body ?? '', url: body?.url ?? '' });
    const results: Array<{ ok: boolean; endpoint: string; err?: string }> = [];
    for (const sub of targets) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ ok: true, endpoint: sub.endpoint.slice(0, 40) });
      } catch (e) {
        const err = e as { statusCode?: number; message?: string };
        const msg = String(err?.message ?? e);
        // Subscription sudah mati (FCM 404/410) — hapus dari DB biar tidak
        // menumpuk dan tidak bikin send berikutnya selalu melaporkan gagal.
        if (err?.statusCode === 404 || err?.statusCode === 410 || /not found|gone/i.test(msg)) {
          await rpc('cleanup_push_subscription', { p_endpoint: sub.endpoint }, token).catch(() => {});
        }
        results.push({ ok: false, endpoint: sub.endpoint.slice(0, 40), err: msg });
      }
    }

    const fcmTitle = String(body?.title ?? 'NEXUS');
    const fcmBody = String(body?.body ?? '');
    const data = { url: String(body?.url ?? ''), convId: String(body?.convId ?? '') };
    for (const row of devRows) {
      try {
        await sendFcm(row.token, fcmTitle, fcmBody, data);
        results.push({ ok: true, endpoint: `fcm:${row.platform}:${row.token.slice(0, 20)}` });
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        if (/registration-token-not-registered|UNREGISTERED|invalid.*token|not-found|SENDER_ID_MISMATCH/i.test(msg)) {
          await rpc('cleanup_device_token', { p_token: row.token }, token).catch(() => {});
        }
        results.push({ ok: false, endpoint: `fcm:${row.platform}:${row.token.slice(0, 20)}`, err: msg });
      }
    }

    return json({ ok: true, sent: results.filter((r) => r.ok).length, results });
  } catch (e) {
    return fail(String(e));
  }
});
