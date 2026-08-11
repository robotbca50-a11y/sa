import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const ANON = 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';
(async () => {
  const login = await fetch(`${SUPABASE_URL}/rest/v1/rpc/login_user`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: 'sender1', p_password: 'sender1234' }),
  });
  const tok = JSON.parse(await login.text())[0].token;
  const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: uid, error: authErr } = await supabase.rpc('require_auth', {}, { headers: { 'x-nexus-token': tok } });
  console.log('require_auth via supabase-js:', JSON.stringify({ uid, authErr: authErr?.message ?? null }));
  const { data: uid2, error: authErr2 } = await supabase.rpc('auth_user_id', {}, { headers: { 'x-nexus-token': tok } });
  console.log('auth_user_id via supabase-js:', JSON.stringify({ uid2, authErr2: authErr2?.message ?? null }));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
