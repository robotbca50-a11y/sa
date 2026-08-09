// NEXUS — Edge Function untuk push notification beneran.
// Deploy: supabase functions deploy send-push
// Set env dulu (di Supabase Dashboard → Edge Functions → send-push → Secrets):
//   SUPABASE_URL=https://nwwdnvbfeslglzsgdvdj.supabase.co
//   SUPABASE_ANON_KEY=sb_publishable_GkMU340PXc-4BgQ0A-kiTg_OIWegfIf
//   VAPID_SUBJECT=mailto:admin@nexus.app
//   VAPID_PUBLIC_KEY=...
//   VAPID_PRIVATE_KEY=...
// Cara pakai dari client: fetch('.../functions/v1/send-push', { method:'POST', body: JSON.stringify({ user_id, title, body }) })

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  try {
    const { user_id, title, body, url } = await req.json();
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', user_id);
    const results = [];
    for (const row of subs ?? []) {
      try {
        await supabase.functions.invoke('send-push', { body: { subscription: row.subscription, title, body, url } });
      } catch (e) {
        results.push({ ok: false, err: String(e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, err: String(e) }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
});
