/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import {
  aiClean,
  aiTokens,
  smartReplies,
  assistantReply,
  rememberFact,
  recallMemory,
  memorySummary,
} from './ai';
import { chatWithAi } from './nexus-ai';

const BRAIN_KEY = 'nexus:brain';
const BRAIN_SEEN_KEY = 'nexus:brain:seen';
const MAX_NGRAM_ENTRIES = 40000;
const MAX_TURNS = 400;
const EOS = '∅';
const BOS = '^';

type BrainData = {
  v: number;
  ngrams: Record<string, Record<string, number>>;
  turns: { q: string; a: string; at: string }[];
  freq: Record<string, number>;
  trained: number;
  updatedAt: number;
  pushedAt: number;
  dirty: boolean;
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function emptyBrain(): BrainData {
  return { v: 1, ngrams: {}, turns: [], freq: {}, trained: 0, updatedAt: Date.now(), pushedAt: 0, dirty: false };
}

function loadBrain(): BrainData {
  const b = readJson<BrainData>(BRAIN_KEY, emptyBrain());
  if (!b || typeof b !== 'object') return emptyBrain();
  if (!b.ngrams) b.ngrams = {};
  if (!b.turns) b.turns = [];
  if (!b.freq) b.freq = {};
  if (!b.trained) b.trained = 0;
  return b;
}

function saveBrain(b: BrainData) {
  writeJson(BRAIN_KEY, b);
}

let lastSeen: string[] | null = null;

function seenIds(): string[] {
  if (!lastSeen) lastSeen = readJson<string[]>(BRAIN_SEEN_KEY, []);
  return lastSeen;
}

function rememberSeen(id: string) {
  const s = seenIds();
  if (s.includes(id)) return;
  s.push(id);
  if (s.length > 3000) s.splice(0, s.length - 3000);
  writeJson(BRAIN_SEEN_KEY, s);
}

function sentences(text: string): string[] {
  return String(text)
    .split(/[.!?\n…]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);
}

function bump(table: Record<string, Record<string, number>>, ctx: string, next: string) {
  const row = (table[ctx] ??= {});
  row[next] = (row[next] ?? 0) + 1;
}

function entryCount(b: BrainData): number {
  let n = 0;
  for (const k in b.ngrams) n += 1;
  return n;
}

function prune(b: BrainData) {
  if (entryCount(b) <= MAX_NGRAM_ENTRIES) return;
  const ctxs = Object.keys(b.ngrams).map((c) => {
    let sum = 0;
    for (const w in b.ngrams[c]) sum += b.ngrams[c][w];
    return { c, sum };
  });
  ctxs.sort((a, z) => a.sum - z.sum);
  for (let i = 0; i < ctxs.length - MAX_NGRAM_ENTRIES; i++) {
    delete b.ngrams[ctxs[i].c];
  }
  const freqKeys = Object.keys(b.freq);
  if (freqKeys.length > 20000) {
    freqKeys.sort((a, z) => (b.freq[a] ?? 0) - (b.freq[z] ?? 0));
    for (let i = 0; i < freqKeys.length - 20000; i++) delete b.freq[freqKeys[i]];
  }
}

let lastIncoming: string | null = null;

export function brainLearn(text: string, id?: string, isMine = false) {
  const clean = aiClean(text, 2000);
  if (clean.length < 3) return;
  if (id) {
    if (seenIds().includes(id)) return;
    rememberSeen(id);
  }
  const b = loadBrain();
  for (const s of sentences(clean)) {
    const toks = [BOS, ...aiTokens(s)];
    for (let i = 0; i < toks.length; i++) {
      const ctx = toks[i];
      const next = i + 1 < toks.length ? toks[i + 1] : EOS;
      bump(b.ngrams, ctx, next);
      const ctx2 = i > 0 ? `${toks[i - 1]} ${ctx}` : `${BOS} ${ctx}`;
      bump(b.ngrams, ctx2, next);
      if (next !== EOS) b.freq[next] = (b.freq[next] ?? 0) + 1;
    }
  }
  if (isMine && lastIncoming) {
    b.turns.push({ q: lastIncoming, a: clean, at: new Date().toISOString() });
    if (b.turns.length > MAX_TURNS) b.turns.splice(0, b.turns.length - MAX_TURNS);
    lastIncoming = null;
  } else if (!isMine) {
    lastIncoming = clean;
  }
  b.trained += 1;
  b.updatedAt = Date.now();
  b.dirty = true;
  prune(b);
  saveBrain(b);
  try {
    window.dispatchEvent(new Event('nexus:brain-learn'));
  } catch {
  }
}

function pickWeighted(row: Record<string, number>): string | null {
  let total = 0;
  for (const w in row) total += row[w];
  if (!total) return null;
  let r = Math.random() * total;
  for (const w in row) {
    r -= row[w];
    if (r <= 0) return w;
  }
  return null;
}

function generate(input: string): string | null {
  const b = loadBrain();
  if (!entryCount(b)) return null;
  const toks = aiTokens(input);
  if (!toks.length) return null;
  const ctx1 = toks[toks.length - 1];
  const ctx2 = toks.length > 1 ? `${toks[toks.length - 2]} ${toks[toks.length - 1]}` : `${BOS} ${ctx1}`;
  const out: string[] = [];
  let ctx = ctx2;
  for (let step = 0; step < 16; step++) {
    const row = b.ngrams[ctx];
    const next = row ? pickWeighted(row) : null;
    if (!next || next === EOS) break;
    out.push(next);
    const back = out.slice(-2);
    ctx = back.length === 2 ? back.join(' ') : back[0];
    if (out.length >= 10) break;
  }
  if (!out.length) {
    const row = b.ngrams[BOS + ' ' + ctx1] ?? b.ngrams[ctx1];
    const next = row ? pickWeighted(row) : null;
    if (!next || next === EOS) return null;
    out.push(next);
  }
  const joined = out.join(' ');
  if (!joined.trim()) return null;
  return joined.trim().replace(/\s+([,.?!;:])/g, '$1') + (/([.!?])$/.test(joined) ? '' : '');
}

function bestTurn(input: string): { q: string; a: string } | null {
  const b = loadBrain();
  if (!b.turns.length) return null;
  const qToks = new Set(aiTokens(input));
  if (!qToks.size) return null;
  let best: { q: string; a: string } | null = null;
  let bestScore = 0;
  for (const t of b.turns) {
    const tq = new Set(aiTokens(t.q));
    let inter = 0;
    for (const w of qToks) if (tq.has(w)) inter += 1;
    const denom = Math.sqrt(qToks.size * tq.size) || 1;
    const score = inter / denom;
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 0.38 ? best : null;
}

export function brainSuggest(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    const c = aiClean(t, 200);
    if (c && !seen.has(c) && !c.toLowerCase().includes(input.toLowerCase())) {
      seen.add(c);
      out.push(c);
    }
  };
  const t = bestTurn(input);
  if (t) push(t.a);
  const gen = generate(input);
  if (gen) push(gen);
  if (out.length < 2) {
    for (const s of smartReplies(input)) push(s);
  }
  return out.slice(0, 3);
}

export function brainReply(input: string): string | null {
  const t = bestTurn(input);
  if (t) return t.a;
  return generate(input);
}

export async function brainAssistantReply(input: string): Promise<string> {
  const q = aiClean(input, 600);
  const lower = q.toLowerCase();

  const remembered = rememberFact(q);
  if (remembered) return `Oke, aku ingat: ${remembered}.`;

  if (/(siapa kamu|kamu siapa|kamu apa|apa kamu)/i.test(lower)) {
    return 'Aku NEXUS AI, asisten yang tinggal di perangkatmu. Otakku belajar dari percakapanmu dan tersinkron privat antar semua perangkatmu — tidak ada pihak luar yang bisa membacanya.';
  }
  if (/(bisa apa|bisa ngapain|fungsi kamu|kamu bisa apa)/i.test(lower)) {
    return 'Aku belajar dari semua chat yang kamu baca & tulis, lalu jadi makin pintar. Aku bisa: (1) saran balasan ala caramu sendiri, (2) ringkas chat, (3) terjemah pesan, (4) filter spam yang belajar, (5) mengingat fakta, (6) Daily Challenge belajar 10 sesi per topik. Semua perangkatmu punya kepintaran yang sama.';
  }
  if (/(spam|filter spam)/i.test(lower)) {
    return 'Filter spamku belajar dari pesan yang kamu lapor. Makin sering kamu ajarin lewat aksi "Lapor spam", makin jitu tebakannya.';
  }
  if (/(ingat|hafal|hafalan)/i.test(lower)) {
    const mem = memorySummary();
    if (!mem.length) return 'Belum ada yang aku ingat. Bilang misalnya "ingat bahwa ulang tahunku 12 Mei" — nanti aku ingat di semua perangkatmu.';
    const list = mem.slice(-5).map((x, i) => `${i + 1}. ${x.fact}`).join('\n');
    return `Ini yang aku ingat:\n${list}`;
  }
  if (/(terima kasih|makasih|thanks)/i.test(lower)) return 'Sama-sama. Aku di sini kalau kamu butuh.';
  if (/(halo|hai|hi|pagi|siang|sore|malam)/i.test(lower)) return 'Halo! Ada yang bisa aku bantu?';

  const recalled = recallMemory(q);
  if (recalled.length) return `Dari yang aku ingat: ${recalled[0]}`;

  const b = brainReply(q);
  if (b) return b;

  const ext = await chatWithAi(q);
  if (ext) return ext;

  return assistantReply(q);
}

export function brainStats(): { trained: number; turns: number; updatedAt: number } {
  const b = loadBrain();
  return { trained: b.trained, turns: b.turns.length, updatedAt: b.updatedAt };
}

export function brainDirty(): boolean {
  return loadBrain().dirty;
}

export function brainExport(): { payload: unknown; trained: number; updatedAt: number } {
  const b = loadBrain();
  const payload = { v: b.v, ngrams: b.ngrams, turns: b.turns, freq: b.freq };
  return { payload, trained: b.trained, updatedAt: b.updatedAt };
}

export function brainMerge(remote: { payload: unknown; trained: number; updatedAt: number }): boolean {
  const r = (remote.payload ?? {}) as Partial<BrainData>;
  if (!r || typeof r !== 'object' || !r.ngrams || typeof r.ngrams !== 'object') return false;
  const b = loadBrain();
  let changed = false;
  for (const ctx in r.ngrams) {
    const row = r.ngrams[ctx];
    if (!row || typeof row !== 'object') continue;
    for (const w in row) {
      const c = row[w] as number;
      if (!c) continue;
      const prev = b.ngrams[ctx]?.[w] ?? 0;
      b.ngrams[ctx] = b.ngrams[ctx] ?? {};
      b.ngrams[ctx][w] = prev + c;
      changed = true;
    }
  }
  for (const w in r.freq) {
    const c = r.freq[w] as number;
    if (c) {
      b.freq[w] = (b.freq[w] ?? 0) + c;
      changed = true;
    }
  }
  if (Array.isArray(r.turns)) {
    const existing = new Set(b.turns.map((t) => `${t.q}|${t.a}`));
    for (const t of r.turns) {
      if (!t || !t.q || !t.a) continue;
      const k = `${t.q}|${t.a}`;
      if (!existing.has(k)) {
        existing.add(k);
        b.turns.push(t);
        changed = true;
      }
    }
    if (b.turns.length > MAX_TURNS) b.turns.splice(0, b.turns.length - MAX_TURNS);
  }
  if (changed) {
    b.trained = Math.max(b.trained, r.trained ?? 0);
    b.updatedAt = Math.max(b.updatedAt, remote.updatedAt || 0);
    b.dirty = true;
    prune(b);
    saveBrain(b);
    try {
      window.dispatchEvent(new Event('nexus:brain-learn'));
    } catch {
    }
  }
  return changed;
}

export function brainMarkPushed() {
  const b = loadBrain();
  b.dirty = false;
  b.pushedAt = Date.now();
  b.updatedAt = Date.now();
  saveBrain(b);
}

export function brainReset() {
  const b = emptyBrain();
  saveBrain(b);
  lastSeen = null;
  try {
    window.dispatchEvent(new Event('nexus:brain-learn'));
  } catch {
  }
}
