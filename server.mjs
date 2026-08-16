import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lbiwnxkonxgnolmcuxap.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_BIG_BYTES = Number(process.env.MAX_BIG_BYTES || 1024 * 1024 * 1024);
const MAX_UPLOADS_PER_MIN = Number(process.env.MAX_UPLOADS_PER_MIN || 10);

fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');

// Header keamanan global (web): anti-embed, anti-MIME-sniff, anti-referer-leak,
// dan isolasi dari tab lain. Cache halaman HTML dimatikan supaya isi lama tidak
// tersimpan publik di browser; asset ber-hash boleh tetap di-cache.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'browsing-topics=(), interest-cohort=(), attribution-reporting=(), run-ad-auction=(), join-ad-interest-group=(), shared-storage=()'
  );
  if (req.path.endsWith('.html') || req.path === '/' || !path.extname(req.path)) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

function clientIp(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown');
}

const rate = new Map();
function rateLimited(ip) {
  const now = Date.now();
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

// Limiter per-IP untuk semua rute non-asset (anti-scrape / DDoS dasar).
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

// Proteksi rute API + media: tolak kalau melebihi kuota per 10 detik.
app.use('/api', (req, res, next) => {
  if (genRateLimited(clientIp(req), 120, 10_000)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan — tunggu sebentar.' });
  }
  next();
});
app.use('/media', (req, res, next) => {
  if (genRateLimited(clientIp(req), 200, 10_000)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan — tunggu sebentar.' });
  }
  next();
});

app.post('/api/upload', async (req, res) => {
  const uid = await authUser(req);
  if (!uid) return res.status(401).json({ error: 'Sesi tidak valid. Login ulang.' });
  if (rateLimited(clientIp(req))) return res.status(429).json({ error: 'Terlalu banyak upload — tunggu sebentar.' });

  const len = Number(req.headers['content-length'] || 0);
  // Browser streaming body tidak mengirim Content-Length (chunked), jadi len bisa 0.
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
  // Anti-hang: kalau tidak ada data 120 detik (koneksi mati/macet), putuskan
  // request supaya client dapat error dan tidak "numpuk" selamanya.
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
    try { res.status(status).json({ error: msg }); } catch { /* socket sudah mati */ }
    return;
  }

  res.status(201).json({ path: rel, size: got });
});

app.get('/media/*splat', async (req, res) => {
  // Media butuh sesi valid (anti-scrape). Cache dimatikan supaya file tidak
  // tersimpan di CDN/browser orang yang belum login.
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

const dist = path.join(__dirname, 'dist');
app.use(express.static(dist));
app.get('/*splat', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next();
  res.sendFile(path.join(dist, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NEXUS media server on :${PORT} (data: ${DATA_DIR})`);
});
