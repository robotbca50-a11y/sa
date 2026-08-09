import { downloadMedia } from './api';
import { decryptBytes, decryptText } from './crypto';
import type { Msg } from '../types';

export type Decoded = {
  text: string;
  mediaUrl: string | null;
  mediaMime: string;
};

const cache = new Map<string, Decoded>();

export async function decodeMessage(msg: Msg, key: CryptoKey): Promise<Decoded> {
  if (cache.has(msg.id)) return cache.get(msg.id)!;

  let out: Decoded;
  if (msg.msg_type === 'text' && msg.ciphertext) {
    const text = await decryptText(key, msg.ciphertext, msg.iv ?? '');
    out = { text, mediaUrl: null, mediaMime: '' };
  } else if (msg.media_path && msg.ciphertext) {
    const blob = await downloadMedia('chat-media', msg.media_path);
    const plain = await decryptBytes(key, msg.ciphertext, msg.iv ?? '');
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
