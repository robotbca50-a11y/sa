/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  scanRequest, installHoneypots, bodyScanMiddleware,
  getSecurityState, manualBlockIP, manualUnblockIP, manualClearThreats,
  registerMasterUID,
  activateKillSwitch, deactivateKillSwitch, killAllSessions, panicWipe,
  bindSession, validateSession,
  executeFireball, unquarantine,
} from './server-threats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'nexus2024';
if (!process.env.ADMIN_SECRET) console.warn('WARNING: Using default ADMIN_SECRET. Set ADMIN_SECRET env var in Railway for production.');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_BIG_BYTES = Number(process.env.MAX_BIG_BYTES || 1024 * 1024 * 1024);
const MAX_UPLOADS_PER_MIN = Number(process.env.MAX_UPLOADS_PER_MIN || 10);

function timingSafeCompare(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'browsing-topics=(), interest-cohort=(), attribution-reporting=(), run-ad-auction=(), join-ad-interest-group=(), shared-storage=(), camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' blob: https: data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.ipify.org https://openrouter.ai; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'");
  if (req.path.endsWith('.html') || req.path === '/' || !path.extname(req.path)) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// ─── THREAT ENGINE: body scan + global scan ──────────────────
app.use(bodyScanMiddleware);

// ─── HEALTHCHECK (must be before scan middleware) ────────────
app.get('/health', (req, res) => res.status(200).json({ ok: true }));
app.get('/api/health', (req, res) => res.status(200).json({ ok: true }));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') && !req.path.startsWith('/media/')) return next();
  if (req.path === '/api/hp/log') return next();
  if (req.path === '/api/admin/security') return next();
  if (req.path === '/api/admin/unquarantine') return next();
  if (req.path === '/api/admin/rpc') return next();
  if (req.path === '/health' || req.path === '/api/health') return next();
  const uid = req.headers['x-nexus-user-id'] || null;
  const result = scanRequest(req, uid);
  if (!result.allowed) {
    return res.status(result.status || 403).json({ error: result.msg || 'Akses ditolak.' });
  }
  if (result.throttled && result.msg) {
    res.setHeader('X-Threat-Warning', result.msg);
  }
  if (result.warnings?.length > 0) {
    res.setHeader('X-Threat-Detected', result.warnings.map((w) => w.type).join(','));
  }
  if (result.fireball) {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const served = executeFireball(ip, result.fireball, res);
    if (served) return;
  }
  next();
});

// ─── HONEYPOTS ──────────────────────────────────────────────
installHoneypots(app);

// ─── ADMIN SECURITY DASHBOARD ───────────────────────────────
function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown');
}

app.post('/api/admin/security', async (req, res) => {
  const { action, ip, perm, secret, reason } = req.body || {};
  if (!timingSafeCompare(secret, ADMIN_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  switch (action) {
    case 'get_state':
      const state = getSecurityState();
      try {
        const evRes = await fetch(`${SUPABASE_URL}/rest/v1/security_events?select=*&order=created_at.desc&limit=200`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (evRes.ok) {
          const dbEvents = await evRes.json();
          if (Array.isArray(dbEvents) && dbEvents.length > 0) {
            const mapped = dbEvents.map((e) => ({
              time: e.created_at, ip: e.ip, type: e.event_type,
              severity: e.severity, detail: e.detail || '', score: e.meta?.score || 0,
            }));
            const seen = new Set(state.threats.map((t) => t.time + t.ip + t.type));
            for (const ev of mapped) {
              if (!seen.has(ev.time + ev.ip + ev.type)) {
                state.threats.unshift(ev);
              }
            }
            state.threats.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
            if (state.threats.length > 500) state.threats.length = 500;
          }
        }
      } catch {}
      try {
        const blRes = await fetch(`${SUPABASE_URL}/rest/v1/blocked_ips?select=*&or=(is_permanent.eq.true,blocked_until.gt.now())`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        });
        if (blRes.ok) {
          const dbBlocked = await blRes.json();
          if (Array.isArray(dbBlocked)) {
            const existingIPs = new Set(state.blockedIPs.map((b) => b.ip));
            for (const b of dbBlocked) {
              if (!existingIPs.has(b.ip)) {
                state.blockedIPs.push({
                  ip: b.ip, perm: b.is_permanent,
                  until: b.blocked_until ? new Date(b.blocked_until).getTime() : 0,
                  score: b.threat_score || 0,
                });
              }
            }
          }
        }
      } catch {}
      return res.json(state);
    case 'block_ip':
      if (!ip) return res.status(400).json({ error: 'IP required' });
      manualBlockIP(ip, !!perm);
      return res.json({ ok: true, msg: `IP ${ip} ${perm ? 'permanently' : 'temporarily'} blocked` });
    case 'unblock_ip':
      if (!ip) return res.status(400).json({ error: 'IP required' });
      manualUnblockIP(ip);
      return res.json({ ok: true, msg: `IP ${ip} unblocked` });
    case 'kill_switch':
      activateKillSwitch(reason || 'manual_admin');
      return res.json({ ok: true, msg: 'Kill switch activated — all access blocked' });
    case 'kill_switch_off':
      deactivateKillSwitch();
      return res.json({ ok: true, msg: 'Kill switch deactivated' });
    case 'kill_sessions':
      killAllSessions();
      return res.json({ ok: true, msg: 'All sessions terminated' });
    case 'panic_wipe':
      panicWipe();
      return res.json({ ok: true, msg: 'PANIC WIPE executed — all data cleared' });
    case 'clear_all':
      manualClearThreats();
      return res.json({ ok: true, msg: 'All threat data cleared' });
    case 'ban_ip':
      if (!ip) return res.status(400).json({ error: 'IP required' });
      manualBlockIP(ip, true);
      return res.json({ ok: true, msg: `IP ${ip} permanently banned` });
    default:
      return res.status(400).json({ error: 'Unknown action' });
  }
});

app.post('/api/admin/unquarantine', (req, res) => {
  const { secret, ip } = req.body || {};
  if (!timingSafeCompare(secret, ADMIN_SECRET)) return res.status(401).json({ error: 'Unauthorized' });
  if (!ip) return res.status(400).json({ error: 'IP required' });
  unquarantine(ip);
  return res.json({ ok: true, msg: `IP ${ip} unquarantined` });
});

// ─── ADMIN RPC PROXY (eliminates plain-text passwords from client) ──
const ADMIN_RPC_WHITELIST = new Set([
  'list_pending_users', 'set_user_status', 'delete_user',
  'list_all_users', 'get_user_stats', 'get_all_locations',
  'get_access_logs', 'set_blackout', 'list_blackouts',
  'purge_all_users_except_master', 'admin_reports', 'resolve_report',
  'get_security_events', 'admin_check',
]);

app.post('/api/admin/rpc', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  const bodySecret = req.body?.secret;
  if (!timingSafeCompare(secret, ADMIN_SECRET) && !timingSafeCompare(bodySecret, ADMIN_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { fn, args } = req.body || {};
  if (!fn || !ADMIN_RPC_WHITELIST.has(fn)) {
    return res.status(400).json({ error: 'Invalid function' });
  }
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-admin-validated': '1',
      },
      body: JSON.stringify(args || {}),
    });
    const text = await rpcRes.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!rpcRes.ok) {
      return res.status(rpcRes.status).json({ error: typeof data === 'string' ? data : (data?.message || 'RPC error') });
    }
    return res.json(data);
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

// ─── RATE LIMITS ────────────────────────────────────────────
function clientIpClean(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
  if (rate.size > 10_000) {
    for (const [k, v] of rate) if (now > v.reset) rate.delete(k);
  }
  const e = rate.get(ip);
  if (!e || now > e.reset) {
    rate.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  e.count += 1;
  return e.count > MAX_UPLOADS_PER_MIN;
}

async function authUser(req) {
  const token = req.headers['x-nexus-token'];
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/require_auth`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-nexus-token': token,
      },
      body: '{}',
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    const data = JSON.parse(text);
    return typeof data === 'string' && /^[0-9a-f-]{36}$/i.test(data) ? data : null;
  } catch {
    return null;
  }
}

function safeRel(rel) {
  if (typeof rel !== 'string') return null;
  const parts = rel.split('/');
  if (parts.length < 3 || parts[0] !== 'big' || !/^[0-9a-f-]{36}$/i.test(parts[1])) return null;
  const abs = path.resolve(DATA_DIR, rel);
  if (!abs.startsWith(path.resolve(DATA_DIR) + path.sep)) return null;
  return abs;
}

const genRate = new Map();
function genRateLimited(ip, maxPerWindow, windowMs) {
  const now = Date.now();
  if (genRate.size > 10_000) {
    for (const [k, v] of genRate) if (now - v.t > windowMs) genRate.delete(k);
  }
  const e = genRate.get(ip);
  if (!e || now - e.t > windowMs) {
    genRate.set(ip, { t: now, n: 1 });
    return false;
  }
  e.n += 1;
  return e.n > maxPerWindow;
}

app.use('/api', (req, res, next) => {
  if (genRateLimited(clientIpClean(req), 120, 10_000)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan — tunggu sebentar.' });
  }
  next();
});
app.use('/media', (req, res, next) => {
  if (genRateLimited(clientIpClean(req), 200, 10_000)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan — tunggu sebentar.' });
  }
  next();
});

// ─── UPLOAD ─────────────────────────────────────────────────
app.post('/api/upload', async (req, res) => {
  const uid = await authUser(req);
  if (!uid) return res.status(401).json({ error: 'Sesi tidak valid. Login ulang.' });
  if (rateLimited(clientIpClean(req))) return res.status(429).json({ error: 'Terlalu banyak upload — tunggu sebentar.' });

  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const ALLOWED_TYPES = [
    'image/', 'video/', 'audio/', 'application/pdf',
    'application/zip', 'application/x-zip',
    'text/plain', 'application/octet-stream'
  ];
  if (ct && !ALLOWED_TYPES.some((t) => ct.startsWith(t))) {
    return res.status(415).json({ error: 'Tipe file tidak didukung.' });
  }

  const len = Number(req.headers['content-length'] || 0);
  if (len > MAX_BIG_BYTES) return res.status(413).json({ error: `File melebihi batas ${Math.round(MAX_BIG_BYTES / 1024 / 1024)} MB.` });

  const ext = String(req.headers['x-file-ext'] || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  const rel = `big/${uid}/${randomUUID()}${ext ? '.' + ext : ''}`;
  const filePath = safeRel(rel);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  let got = 0;
  let failed = false;
  let over = false;
  let done = false;
  const ws = createWriteStream(filePath);
  ws.on('error', () => { failed = true; finish(); });
  let idle = setTimeout(() => { failed = true; req.destroy(); }, 120000);
  req.on('data', (c) => {
    idle.refresh();
    got += c.length;
    if (got > MAX_BIG_BYTES) {
      over = true;
      req.destroy();
    }
  });
  req.on('error', () => { failed = true; finish(); });
  req.on('close', () => clearTimeout(idle));
  req.on('end', finish);
  function finish() {
    if (done) return;
    done = true;
    clearTimeout(idle);
    ws.end();
  }
  req.pipe(ws);

  await new Promise((resolve) => {
    ws.on('close', resolve);
    ws.on('error', resolve);
  });

  if (failed || over || got === 0) {
    fs.rmSync(filePath, { force: true });
    const status = over ? 413 : 400;
    const msg = over
      ? `File melebihi batas ${Math.round(MAX_BIG_BYTES / 1024 / 1024)} MB.`
      : 'Upload terputus.';
    try { res.status(status).json({ error: msg }); } catch { }
    return;
  }

  res.status(201).json({ path: rel, size: got });
});

// ─── MEDIA ──────────────────────────────────────────────────
app.get('/media/*splat', async (req, res) => {
  const uid = await authUser(req);
  if (!uid) return res.status(401).json({ error: 'Sesi tidak valid.' });
  const rel = Array.isArray(req.params.splat) ? req.params.splat.join('/') : req.params.splat;
  const abs = safeRel(rel);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(abs);
});

app.delete('/api/media', async (req, res) => {
  const uid = await authUser(req);
  if (!uid) return res.status(401).json({ error: 'Sesi tidak valid.' });
  const abs = safeRel(String(req.query.path || ''));
  if (!abs || !abs.includes(`${path.sep}big${path.sep}${uid}${path.sep}`)) return res.status(403).json({ error: 'Forbidden' });
  fs.rmSync(abs, { force: true });
  res.json({ ok: true });
});

app.delete('/api/media/all', async (req, res) => {
  const uid = await authUser(req);
  if (!uid) return res.status(401).json({ error: 'Sesi tidak valid.' });
  fs.rmSync(path.join(DATA_DIR, 'big', uid), { recursive: true, force: true });
  res.json({ ok: true });
});

// ─── SPA FALLBACK ───────────────────────────────────────────
const dist = path.join(__dirname, 'dist');
app.use(express.static(dist));
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next();
  res.sendFile(path.join(dist, 'index.html'));
});

// ─── START ──────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`NEXUS media server on :${PORT} (data: ${DATA_DIR})`);
  console.log(`THREAT ENGINE: active | HONEYPOTS: armed | MASTER: immune`);
});
