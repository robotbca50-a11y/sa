// NEXUS — Edge Function untuk push notification beneran (Web Push).
// Deploy: supabase functions deploy send-push
// Set env dulu (Supabase Dashboard → Edge Functions → send-push → Secrets):
//   VAPID_SUBJECT=mailto:admin@nexus.app
//   VAPID_PUBLIC_KEY=<base64>
//   VAPID_PRIVATE_KEY=<base64>
// Dipanggil client: POST { user_id, title, body, url }
// atau kirim langsung: POST { subscription: {...}, title, body, url }
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
    const { user_id, title, body, url, subscription } = await req.json();

    if (!PUBLIC_KEY || !PRIVATE_KEY) {
      return fail('VAPID keys belum di-set di env function send-push.');
    }

    const targets: Array<{ endpoint: string; keys?: { p256dh?: string; auth?: string } | null }> = [];
    if (subscription?.endpoint) {
      targets.push(subscription);
    } else if (user_id) {
      // Akses via RPC security-definer, bukan query langsung — tabel di-lock RLS.
      const { data, error } = await supabase.rpc('get_push_subscriptions', {
        p_user_id: user_id,
      });
      if (error) return fail(String(error.message), 502);
      for (const row of data ?? []) {
        if (row?.subscription?.endpoint) targets.push(row.subscription);
      }
    } else {
      return fail('Butuh user_id atau subscription.');
    }

    const payload = JSON.stringify({ title: title ?? 'NEXUS', body: body ?? '', url: url ?? '' });
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
