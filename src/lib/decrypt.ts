/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { downloadMedia } from './api';
import { decryptText, pickEntry, b64ToBuf, type PickResult } from './crypto';
import type { Msg } from '../types';

export type Decoded = {
  text: string;
  mediaUrl: string | null;
  mediaMime: string;
};

const cache = new Map<string, Decoded>();

let privKey: CryptoKey | null = null;
export function setDecryptPrivateKey(k: CryptoKey | null) {
  privKey = k;
}

type Entry = { ct: string; iv: string; key: CryptoKey };

async function entryFor(key: CryptoKey, msg: Msg): Promise<Entry | null> {
  if (privKey) {
    const multi: PickResult | null = await pickEntry(privKey, msg.ciphertexts);
    if (multi) return { ct: multi.ct, iv: multi.iv, key: multi.key };
  }
  return msg.ciphertext ? { ct: msg.ciphertext, iv: msg.iv ?? '', key } : null;
}

async function decryptMediaBlob(blob: Blob, key: CryptoKey, msg: Msg, entry: Entry | null): Promise<Blob | null> {
  try {
    const sample = await blob.slice(0, 131072).text();
    const nl = sample.indexOf('\n');
    const headStr = nl >= 0 ? sample.slice(0, nl) : sample;
    if (headStr.trimStart().startsWith('{')) {
      const h = JSON.parse(headStr);
      if (h && h.v === 1 && Array.isArray(h.ivs) && h.n > 0) {
        const headLen = new TextEncoder().encode(headStr + '\n').length;
        const parts: BlobPart[] = [];
        let off = headLen;
        for (let i = 0; i < h.n; i++) {
          const ctLen = i === h.n - 1 ? blob.size - off : h.ch + 16;
          const ct = await blob.slice(off, off + ctLen).arrayBuffer();
          const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(h.ivs[i]) }, entry?.key ?? key, ct);
          parts.push(pt);
          off += ctLen;
        }
        return new Blob(parts, { type: h.mime || blob.type || 'application/octet-stream' });
      }
    }
    const iv = (entry?.iv || msg.iv || '').trim();
    if (!iv) return null;
    const buf = await blob.arrayBuffer();
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(iv) }, entry?.key ?? key, buf);
    return new Blob([pt], { type: blob.type || 'application/octet-stream' });
  } catch {
    return null;
  }
}

export async function decodeMessage(msg: Msg, key: CryptoKey): Promise<Decoded> {
  if (cache.has(msg.id)) return cache.get(msg.id)!;

  let out: Decoded;
  const entry = await entryFor(key, msg);
  if (msg.msg_type === 'text' && entry) {
    const text = await decryptText(entry.key, entry.ct, entry.iv);
    out = { text, mediaUrl: null, mediaMime: '' };
  } else if (msg.media_path) {
    const blob = await downloadMedia('chat-media', msg.media_path);
    const plain = await decryptMediaBlob(blob, key, msg, entry);
    if (!plain) throw new Error('Media tidak dapat dibaca.');
    out = { text: '', mediaUrl: URL.createObjectURL(plain), mediaMime: plain.type || 'application/octet-stream' };
  } else {
    out = { text: '🔒 [Pesan terenkripsi]', mediaUrl: null, mediaMime: '' };
  }
  cache.set(msg.id, out);
  return out;
}

export function evictCache(id: string) {
  const prev = cache.get(id);
  if (prev?.mediaUrl) URL.revokeObjectURL(prev.mediaUrl);
  cache.delete(id);
}

export function clearCache() {
  cache.forEach((v) => v.mediaUrl && URL.revokeObjectURL(v.mediaUrl));
  cache.clear();
}
