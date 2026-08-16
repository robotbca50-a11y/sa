const SPAM_KEY = 'nexus:ai:spam';
const MEMORY_KEY = 'nexus:ai:memory';
const AI_PREF_KEY = 'nexus:ai:prefs';

type Corpus = { good: Record<string, number>; bad: Record<string, number>; gTotal: number; bTotal: number };

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
  }
}

const TOKEN_RE = /[a-z0-9]{2,}/gi;

export function aiTokens(text: string): string[] {
  return Array.from(String(text).toLowerCase().match(TOKEN_RE) ?? []);
}

export function aiClean(text: string, max = 4000): string {
  return String(text).replace(/\s+/g, ' ').trim().slice(0, max);
}

function emptyCorpus(): Corpus {
  return { good: {}, bad: {}, gTotal: 0, bTotal: 0 };
}

function loadCorpus(): Corpus {
  const c = readJSON<Corpus>(SPAM_KEY, emptyCorpus());
  if (!c || typeof c !== 'object') return emptyCorpus();
  if (!c.good) c.good = {};
  if (!c.bad) c.bad = {};
  if (!c.gTotal) c.gTotal = 0;
  if (!c.bTotal) c.bTotal = 0;
  return c;
}

export function spamStats(): { good: number; bad: number } {
  const c = loadCorpus();
  return { good: c.gTotal, bad: c.bTotal };
}

export function learnSpam(text: string, isSpam: boolean): void {
  const c = loadCorpus();
  const dict = isSpam ? c.bad : c.good;
  const target = isSpam ? 'bTotal' : 'gTotal';
  for (const w of aiTokens(text)) {
    dict[w] = (dict[w] ?? 0) + 1;
  }
  c[target] += 1;
  writeJSON(SPAM_KEY, c);
}

const SPAM_STOP: Record<string, boolean> = {
  yang: true, dan: true, di: true, ke: true, dari: true, itu: true, ini: true, tidak: true, aku: true, kamu: true,
  ada: true, adalah: true, untuk: true, dengan: true, pada: true, aja: true, udah: true,
  gak: true, ga: true, ya: true, y: true, ngga: true, juga: true, sudah: true, akan: true, bisa: true,
  the: true, and: true, of: true, to: true, a: true, an: true, in: true, for: true, is: true, on: true, i: true,
  you: true, we: true, they: true, it: true, or: true, at: true, by: true,
};

const SPAM_BAD_HINT: Record<string, boolean> = {
  pinjaman: true, pinjol: true, kredit: true, dana: true, cepat: true, cair: true, investasi: true, kaya: true,
  withdraw: true, free: true, gratis: true, promo: true, diskon: true, hadiah: true, menang: true, undian: true,
  lotere: true, pulsa: true, kuota: true, voucer: true, voucher: true, jual: true, jasa: true, ijazah: true,
  tiktok: true, bot: true, bantu: true, klik: true, link: true, login: true, password: true, verifikasi: true,
  otp: true, sultan: true, presiden: true, bitcoin: true, crypto: true, forex: true, trading: true, judi: true,
  slot: true, gacor: true, maxwin: true, togel: true, bokep: true, selingkuh: true, pasangan: true, hack: true,
  saldo: true, rekening: true, transfer: true, bonus: true, cashback: true, flash: true, sale: true, belanja: true,
};

export function spamScore(text: string): { score: number; verdict: 'spam' | 'clean' | 'unknown' } {
  const c = loadCorpus();
  const words = aiTokens(text);
  const useful = words.filter((w) => !SPAM_STOP[w]);
  if (!useful.length) return { score: 0.5, verdict: 'unknown' };

  const g = c.gTotal + 2;
  const b = c.bTotal + 2;
  let pSpam = 0.5;
  let pClean = 0.5;

  for (const w of useful.slice(0, 40)) {
    const gw = (c.good[w] ?? 0) + 1;
    const bw = (c.bad[w] ?? 0) + 1;
    const gNorm = gw / g;
    const bNorm = bw / b;
    const pw = bNorm / (bNorm + gNorm);
    const pc = gNorm / (bNorm + gNorm);
    pSpam *= pw;
    pClean *= pc;
  }

  const hint = useful.some((w) => SPAM_BAD_HINT[w]);
  let score = pSpam / (pSpam + pClean || 1);
  if (hint) score = Math.max(score, 0.72);

  if (Number.isNaN(score)) score = hint ? 0.72 : 0.4;
  const verdict = score >= 0.72 ? 'spam' : score <= 0.35 ? 'clean' : 'unknown';
  return { score, verdict };
}

export function classifySpam(text: string): boolean {
  return spamScore(text).verdict === 'spam';
}

export type AiPrefs = { spamFilter: boolean; smartReply: boolean };

export function getAiPrefs(): AiPrefs {
  return { spamFilter: true, smartReply: true, ...readJSON<Partial<AiPrefs>>(AI_PREF_KEY, {}) };
}

export function setAiPrefs(p: Partial<AiPrefs>) {
  writeJSON(AI_PREF_KEY, { ...getAiPrefs(), ...p });
}

const GREETINGS: Array<[RegExp, string[]]> = [
  [/^(halo|hai|hallo|hello|hi|hey|hei|yo|hy|oy|p)/i, ['Halo juga! Ada yang bisa dibantu?', 'Hai, kabar baik. Kamu gimana?', 'Halo! Lagi ngapain?']],
  [/^(selamat|met)\s*(pagi|siang|sore|malam)/i, ['Selamat! Semoga harimu lancar.', 'Balik juga, semangat kerjanya!']],
  [/^(assalamualaikum|assalamu'alaikum|salam)/i, ['Waalaikumsalam warahmatullah.', 'Waalaikumsalam, kabar baik?']],
];

const QUESTIONS: Array<[RegExp, string[]]> = [
  [/^(apa|apakah|apa sih|apaan)/i, ['Hmm, menurutku...', 'Menurut kamu sendiri gimana?', 'Kalau versiku, iya. Kamu?']],
  [/^(kenapa|mengapa)/i, ['Mungkin karena situasinya memang gitu. Detailnya gimana?', 'Bisa jadi ada alasan di balik itu.']],
  [/^(siapa|kapan|berapa|di mana|kemana|ke mana|gimana|bagaimana)/i, ['Aku rasa kamu lebih tahu jawabannya.', 'Coba tanya langsung ke orangnya, lebih akurat.']],
  [/^(bisakah|bisa nggak|bisa ga|bolehkah|mau nggak|mau ga|gimana kalau|gimana kalo)/i, ['Boleh banget, kenapa enggak?', 'Bisa, asal dua-duanya nyaman.']],
  [/^(nggak|gak|ga|tidak|belum|sudah|iya|ya|ok|oke|sip|mantap|siap)/i, ['Oke, noted.', 'Sip, aman.']],
];

const THANKS: Array<[RegExp, string[]]> = [
  [/^(terima kasih|makasih|mksh|thanks|thank you|syukron)/i, ['Sama-sama!', 'Sama-sama, senang bantu.']],
];

export function smartReplies(text: string): string[] {
  const t = aiClean(text, 300);
  if (!t) return [];
  const out: string[] = [];
  for (const [re, pool] of GREETINGS) {
    if (re.test(t)) {
      out.push(pool[0]);
      break;
    }
  }
  for (const [re, pool] of THANKS) {
    if (re.test(t)) {
      out.push(pool[0]);
      break;
    }
  }
  for (const [re, pool] of QUESTIONS) {
    if (re.test(t)) {
      out.push(pool[0]);
      break;
    }
  }
  if (!out.length) {
    out.push('Oh gitu ya.', 'Menarik, ceritain lebih lanjut dong.');
    out.push(t.length < 80 ? 'Sip, aku paham.' : 'Wah panjang juga ceritanya, lanjut. 😄');
  }
  return out.slice(0, 3);
}

export function summarize(messages: string[]): string {
  const clean = messages.filter((m) => m && m.trim()).map((m) => m.trim()).slice(-120);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length <= 4) return clean.join('\n');

  const freq: Record<string, number> = {};
  for (const m of clean) {
    for (const w of aiTokens(m)) {
      if (!SPAM_STOP[w]) freq[w] = (freq[w] ?? 0) + 1;
    }
  }
  const maxFreq = Math.max(1, ...Object.values(freq));
  const scored = clean.map((m) => {
    const words = aiTokens(m);
    if (!words.length) return { m, s: 0 };
    let s = 0;
    for (const w of words) s += (freq[w] ?? 0) / maxFreq;
    return { m, s: s / Math.sqrt(words.length + 1) };
  });
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, 4);
  const byIdx = clean
    .map((m, i) => ({ m, i }))
    .filter((x) => top.some((t) => t.m === x.m))
    .sort((a, b) => a.i - b.i);
  const head = clean[0];
  const out = byIdx.map((x) => x.m);
  if (!out.includes(head) && out.length < 4) out.unshift(head);
  return out.slice(0, 4).join('\n');
}

const DICT: Array<[RegExp, string]> = [
  [/halo/gi, 'hello'], [/hai/gi, 'hi'], [/selamat pagi/gi, 'good morning'], [/selamat siang/gi, 'good afternoon'],
  [/selamat sore/gi, 'good evening'], [/selamat malam/gi, 'good night'], [/terima kasih/gi, 'thank you'],
  [/makasih/gi, 'thanks'], [/sama-sama/gi, 'you are welcome'], [/apa kabar/gi, 'how are you'], [/kabar baik/gi, 'i am fine'],
  [/bagaimana/gi, 'how'], [/kenapa/gi, 'why'], [/kapan/gi, 'when'], [/siapa/gi, 'who'], [/berapa/gi, 'how much'],
  [/di mana/gi, 'where'], [/apa/gi, 'what'], [/iya/gi, 'yes'], [/tidak/gi, 'no'], [/nggak/gi, 'no'], [/gak/gi, 'no'],
  [/aku/gi, 'i'], [/kamu/gi, 'you'], [/dia/gi, 'he/she'], [/mereka/gi, 'they'], [/kami/gi, 'we'],
  [/mau/gi, 'want'], [/bisa/gi, 'can'], [/suka/gi, 'like'], [/bingung/gi, 'confused'], [/senang/gi, 'happy'],
  [/sedih/gi, 'sad'], [/marah/gi, 'angry'], [/capek/gi, 'tired'], [/cape/gi, 'tired'], [/pusing/gi, 'dizzy'],
  [/sibuk/gi, 'busy'], [/sendiri/gi, 'alone'], [/bersama/gi, 'together'], [/rumah/gi, 'home'], [/kantor/gi, 'office'],
  [/sekolah/gi, 'school'], [/kerja/gi, 'work'], [/makan/gi, 'eat'], [/minum/gi, 'drink'], [/tidur/gi, 'sleep'],
  [/bangun/gi, 'wake up'], [/pergi/gi, 'go'], [/datang/gi, 'come'], [/beli/gi, 'buy'], [/jual/gi, 'sell'],
  [/malam ini/gi, 'tonight'], [/hari ini/gi, 'today'], [/besok/gi, 'tomorrow'], [/kemarin/gi, 'yesterday'],
  [/sekarang/gi, 'now'], [/nanti/gi, 'later'], [/selalu/gi, 'always'], [/kadang/gi, 'sometimes'],
  [/teman/gi, 'friend'], [/keluarga/gi, 'family'], [/nama/gi, 'name'], [/umur/gi, 'age'], [/saya/gi, 'i'],
];

export function translatePhrase(text: string, to: 'id' | 'en'): string {
  let out = aiClean(text, 800);
  if (to === 'en') {
    for (const [re, rep] of DICT) out = out.replace(re, rep);
  } else {
    for (const [re, rep] of DICT) {
      if (/^[a-z]+$/i.test(rep)) out = out.replace(new RegExp(`\\b${rep}\\b`, 'gi'), re.source.replace(/[^a-z| ]/gi, '').trim() || rep);
    }
  }
  return out;
}

export async function aiModel(prompt: string, system?: string): Promise<string | null> {
  try {
    const { loadToken } = await import('./session');
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = await import('./supabase');
    const token = loadToken();
    if (!token) return null;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'x-nexus-token': token,
      },
      body: JSON.stringify({ prompt, system }),
    });
    const j = await res.json();
    if (!res.ok || !j.ok) return null;
    return typeof j.text === 'string' ? j.text : null;
  } catch {
    return null;
  }
}

type Memory = Array<{ topic: string; fact: string; at: string }>;

function loadMemory(): Memory {
  return readJSON<Memory>(MEMORY_KEY, []);
}

function saveMemory(m: Memory) {
  writeJSON(MEMORY_KEY, m.slice(-80));
}

const FACT_PATTERNS: Array<RegExp> = [
  /(?:ingat|catat|catatlah|tolong ingat)\s+(?:bahwa|kalau|jika)?\s*(.+)/i,
  /namaku?\s+(?:adalah|ialah|itu)?\s+(.+)/i,
  /aku\s+(?:suka|hobi|gemar)\s+(.+)/i,
  /aku\s+(?:tinggal|bertempat)\s+(?:di|tinggal di)\s+(.+)/i,
  /(?:usia|umur)ku?\s+(?:adalah|itu)?\s+(\d+)/i,
];

export function recallMemory(query: string): string[] {
  const q = query.toLowerCase();
  const mem = loadMemory();
  if (!mem.length) return [];
  const scored = mem
    .map((m) => {
      let s = 0;
      for (const w of aiTokens(q)) {
        if (m.topic.includes(w) || m.fact.includes(w)) s += 1;
      }
      return { ...m, s };
    })
    .filter((m) => m.s > 0)
    .sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map((m) => m.fact);
}

export function rememberFact(input: string): string | null {
  for (const re of FACT_PATTERNS) {
    const m = input.match(re);
    if (m && m[1]) {
      const fact = m[1].trim();
      const topic = fact.slice(0, 40);
      const mem = loadMemory().filter((x) => x.topic !== topic);
      mem.push({ topic, fact, at: new Date().toISOString() });
      saveMemory(mem);
      return fact;
    }
  }
  return null;
}

export function memorySummary(): Memory {
  return loadMemory();
}

export function assistantReply(input: string): string {
  const q = aiClean(input, 600);
  const lower = q.toLowerCase();

  const remembered = rememberFact(q);
  if (remembered) {
    return `Oke, aku ingat: ${remembered}.`;
  }

  if (/(siapa kamu|kamu siapa|kamu apa|apa kamu)/i.test(lower)) {
    return 'Aku NEXUS AI, asisten privat yang tinggal di perangkatmu. Semua yang aku tahu nggak keluar dari HP ini.';
  }

  if (/(bisa apa|bisa ngapain|fungsi kamu|kamu bisa apa)/i.test(lower)) {
    return 'Aku bisa: (1) saran balasan cerdas, (2) ringkas chat, (3) terjemah pesan, (4) filter spam yang belajar dari feedback-mu, (5) mengingat fakta yang kamu kasih tahu. Semua offline & privat.';
  }

  if (/(spam|filter spam)/i.test(lower)) {
    const st = spamStats();
    return `Filter spamku sudah belajar dari ${st.bad} laporan spam & ${st.good} pesan normal. Kamu bisa bantu ajari aku lewat aksi "Lapor spam" di pesan.`;
  }

  if (/(ingat|hafal|hafalan)/i.test(lower)) {
    const mem = loadMemory();
    if (!mem.length) return 'Belum ada yang aku ingat. Bilang misalnya "ingat bahwa hari ulang tahunku 12 Mei" — nanti aku ingat.';
    const list = mem.slice(-5).map((x, i) => `${i + 1}. ${x.fact}`).join('\n');
    return `Ini yang aku ingat:\n${list}`;
  }

  if (/(terima kasih|makasih|thanks)/i.test(lower)) return 'Sama-sama. Aku di sini kalau kamu butuh.';

  if (/(halo|hai|hi|pagi|siang|sore|malam)/i.test(lower)) return 'Halo! Ada yang bisa aku bantu?';

  const recalled = recallMemory(q);
  if (recalled.length) {
    return `Dari yang aku ingat: ${recalled[0]}`;
  }

  const sr = smartReplies(q);
  if (sr.length) return sr[0];

  return 'Menarik. Aku belum punya jawaban pasti untuk itu — tapi kalau kamu beri tahu faktanya, aku akan ingat.';
}
