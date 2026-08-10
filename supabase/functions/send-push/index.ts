// NEXUS — Edge Function untuk push notification beneran (Web Push).
// Deploy: supabase functions deploy send-push
// WAJIB set secrets dulu (kalau belum):
//   supabase secrets set VAPID_SUBJECT=mailto:admin@nexus.app
//   supabase secrets set VAPID_PUBLIC_KEY=<base64 public>
//   supabase secrets set VAPID_PRIVATE_KEY=<base64 private>
// Public key harus SAMA dengan yang dipakai client (src/lib/notify.ts).
// Tanpa VAPID_PRIVATE_KEY edge function menolak kirim (tidak ada fallback),
// supaya kunci private tidak pernah bocor ke repo.
// Dipanggil client: POST { user_ids: string[], title, body, url }
//   header wajib: x-nexus-token = token login si pengirim
/// <reference path="./deno.d.ts" />

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@nexus.app';
const PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';

const MAX_TARGETS = 50;

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

function fail(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, err: msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  try {
    // Wajib login: edge function dipanggil client dengan x-nexus-token.
    const token = req.headers.get('x-nexus-token') ?? '';
    if (!token) return fail('Unauthorized', 401);

    const authHeaders = { 'x-nexus-token': token };

    const { data: uid, error: authErr } = await supabase.rpc(
      'auth_user_id',
      {},
      { headers: authHeaders },
    );
    if (authErr || !uid) return fail('Unauthorized', 401);

    if (!PRIVATE_KEY) {
      return fail('VAPID_PRIVATE_KEY belum di-set di Edge Function secrets. Push nonaktif.', 500);
    }

    const body = await req.json();
    const user_ids: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids.map(String)
      : body?.user_id
        ? [String(body.user_id)]
        : [];
    if (!user_ids.length) return fail('Butuh user_id / user_ids.');

    // Hanya kirim ke user yang benar-benar berhubungan dengan pengirim
    // (satu DM / satu grup). User asing tidak bisa di-push.
    const { data: allowed, error: filterErr } = await supabase.rpc(
      'filter_notify_targets',
      { p_from: uid, p_ids: user_ids },
      { headers: authHeaders },
    );
    if (filterErr) return fail(String(filterErr.message), 502);
    const targets_ids: string[] = (allowed ?? [])
      .map((r) => String(r.user_id))
      .slice(0, MAX_TARGETS);
    if (!targets_ids.length) return fail('Tidak ada penerima yang valid.', 400);

    // Akses via RPC security-definer, bukan query langsung — tabel di-lock RLS.
    const { data: rows, error: subErr } = await supabase.rpc(
      'get_push_subscriptions_for_users',
      { p_user_ids: targets_ids },
      { headers: authHeaders },
    );
    if (subErr) return fail(String(subErr.message), 502);

    const targets: Array<{ endpoint: string; keys?: { p256dh?: string; auth?: string } | null }> = [];
    for (const row of rows ?? []) {
      if (row?.subscription?.endpoint) targets.push(row.subscription);
    }
    if (!targets.length) return fail('Tidak ada subscription push aktif.', 404);

    const payload = JSON.stringify({ title: body?.title ?? 'NEXUS', body: body?.body ?? '', url: body?.url ?? '' });
    const results = [];
    for (const sub of targets) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ ok: true, endpoint: sub.endpoint.slice(0, 40) });
      } catch (e) {
        results.push({ ok: false, endpoint: sub.endpoint.slice(0, 40), err: String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: results.filter((r) => r.ok).length, results }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return fail(String(e));
  }
});
