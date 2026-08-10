// NEXUS — Edge Function untuk push notification beneran (Web Push).
// Deploy: supabase functions deploy send-push
// VAPID key bawaan sudah di-set di bawah (private key dipakai server).
// Opsional override via env (Supabase Dashboard → Edge Functions → Secrets):
//   VAPID_SUBJECT=mailto:admin@nexus.app
//   VAPID_PUBLIC_KEY=<base64>
//   VAPID_PRIVATE_KEY=<base64>
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
const PUBLIC_KEY =
  Deno.env.get('VAPID_PUBLIC_KEY') ?? 'BFwdxTFwDJGB__zI658UFftiEqtxVNcd_0pzo740H0Cr5hwSK0IAZdHOkT35Qwci-PawfRndPpL6UWIiPi9oGBU';
const PRIVATE_KEY =
  Deno.env.get('VAPID_PRIVATE_KEY') ?? 'uUyB2EhDWdWyypbiCcsC_xnOuNV-EAwDVbN6m_U3h3w';

webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

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
    const { data: uid, error: authErr } = await supabase.rpc(
      'auth_user_id',
      {},
      { headers: { 'x-nexus-token': token } },
    );
    if (authErr || !uid) return fail('Unauthorized', 401);

    const body = await req.json();
    const user_ids: string[] = Array.isArray(body?.user_ids)
      ? body.user_ids.map(String)
      : body?.user_id
        ? [String(body.user_id)]
        : [];

    // Dukung kirim manual subscription (untuk testing/dev).
    const targets: Array<{ endpoint: string; keys?: { p256dh?: string; auth?: string } | null }> = [];
    if (body?.subscription?.endpoint) {
      targets.push(body.subscription);
    } else if (user_ids.length) {
      // Akses via RPC security-definer, bukan query langsung — tabel di-lock RLS.
      const { data, error } = await supabase.rpc('get_push_subscriptions_for_users', {
        p_user_ids: user_ids,
      });
      if (error) return fail(String(error.message), 502);
      for (const row of data ?? []) {
        if (row?.subscription?.endpoint) targets.push(row.subscription);
      }
    } else {
      return fail('Butuh user_id / user_ids.');
    }

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
