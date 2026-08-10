import { downloadMedia } from './api';
import { decryptBytes, decryptText, pickEntry } from './crypto';
import type { Msg } from '../types';

export type Decoded = {
  text: string;
  mediaUrl: string | null;
  mediaMime: string;
};

const cache = new Map<string, Decoded>();

// Kunci privat device ini. Di-set saat masuk app; dipakai untuk membuka
// entri ciphertexts multi-key (pesan yang dienkripsi ke kunci sekunder).
let privKey: CryptoKey | null = null;
export function setDecryptPrivateKey(k: CryptoKey | null) {
  privKey = k;
}

async function entryFor(key: CryptoKey, msg: Msg) {
  if (privKey) {
    const multi = await pickEntry(privKey, msg.ciphertexts);
    if (multi) return multi;
  }
  return msg.ciphertext ? { ct: msg.ciphertext, iv: msg.iv ?? '' } : null;
}

export async function decodeMessage(msg: Msg, key: CryptoKey): Promise<Decoded> {
  if (cache.has(msg.id)) return cache.get(msg.id)!;

  let out: Decoded;
  const entry = await entryFor(key, msg);
  if (msg.msg_type === 'text' && entry) {
    const text = await decryptText(key, entry.ct, entry.iv);
    out = { text, mediaUrl: null, mediaMime: '' };
  } else if (msg.media_path && entry) {
    const blob = await downloadMedia('chat-media', msg.media_path);
    const plain = await decryptBytes(key, entry.ct, entry.iv);
    const mediaMime = blob.type || 'application/octet-stream';
    const mediaBlob = new Blob([plain], { type: mediaMime });
    out = { text: '', mediaUrl: URL.createObjectURL(mediaBlob), mediaMime };
  } else if (msg.media_path) {
    out = { text: '', mediaUrl: null, mediaMime: '' };
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
