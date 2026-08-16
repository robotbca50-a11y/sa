const SUPABASE_URL = 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';

const AI_BASE_URL = Deno.env.get('AI_BASE_URL') ?? '';
const AI_API_KEY = Deno.env.get('AI_API_KEY') ?? '';
const AI_MODEL = Deno.env.get('AI_MODEL') ?? '';

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
    const token = req.headers.get('x-nexus-token') ?? '';
    if (!token) return fail('Unauthorized', 401);

    const { data: uid, error: authErr } = await rpc<string | null>('require_auth', {}, token);
    if (authErr || !uid) return fail('Unauthorized', 401);

    if (!AI_BASE_URL || !AI_API_KEY || !AI_MODEL) {
      return json({ ok: false, configured: false, err: 'AI belum dikonfigurasi di server (AI_BASE_URL / AI_API_KEY / AI_MODEL).' }, 501);
    }

    const body = await req.json();
    const prompt = String(body?.prompt ?? '').slice(0, 16000);
    const system = String(body?.system ?? '').slice(0, 4000);
    if (!prompt) return fail('Butuh prompt.');

    const messages: Array<{ role: string; content: string }> = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });

    const res = await fetch(`${AI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.7,
        max_tokens: 512,
      }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (j && (j as { error?: { message?: string } }).error?.message) || `HTTP ${res.status}`;
      return fail(msg, 502);
    }
    const text = j && (j as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (typeof text !== 'string') return fail('Respon AI tidak valid.', 502);
    return json({ ok: true, text });
  } catch (e) {
    return fail(String(e));
  }
});
