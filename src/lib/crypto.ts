/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < u.length; i += chunk) {
    s += String.fromCharCode(...u.subarray(i, i + chunk));
  }
  return btoa(s);
}
export function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const u = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
  return { privateKey: kp.privateKey, publicKeyBase64: bufToB64(raw) };
}

function b64urlToB64(s: string): string {
  return s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (s.length % 4)) % 4);
}

export async function exportPublicRaw(privateKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const x = b64ToBuf(b64urlToB64(jwk.x!));
  const y = b64ToBuf(b64urlToB64(jwk.y!));
  const raw = new Uint8Array(1 + x.length + y.length);
  raw[0] = 4;
  raw.set(x, 1);
  raw.set(y, 1 + x.length);
  return bufToB64(raw);
}

export async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKeyB64: string) {
  const pub = await crypto.subtle.importKey(
    'raw',
    b64ToBuf(theirPublicKeyB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: pub },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBytes(key: CryptoKey, data: BufferSource) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return { ciphertext: bufToB64(ct), iv: bufToB64(iv) };
}

export async function decryptBytes(key: CryptoKey, ciphertextB64: string, ivB64: string) {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(ivB64) },
    key,
    b64ToBuf(ciphertextB64),
  );
}

export async function encryptText(key: CryptoKey, plaintext: string) {
  return encryptBytes(key, new TextEncoder().encode(plaintext));
}

export async function decryptText(key: CryptoKey, ctB64: string, ivB64: string) {
  const plain = await decryptBytes(key, ctB64, ivB64);
  return new TextDecoder().decode(plain);
}

export async function randomAESKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportAESKey(key: CryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufToB64(raw);
}

export async function importAESKey(b64: string) {
  return crypto.subtle.importKey('raw', b64ToBuf(b64), { name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptToRecipient(
  myPrivateKey: CryptoKey,
  recipientPublicKeyB64: string,
  plaintext: string,
) {
  const shared = await deriveSharedKey(myPrivateKey, recipientPublicKeyB64);
  return encryptText(shared, plaintext);
}

export async function decryptFromSender(
  myPrivateKey: CryptoKey,
  senderPublicKeyB64: string,
  ciphertextB64: string,
  ivB64: string,
) {
  const shared = await deriveSharedKey(myPrivateKey, senderPublicKeyB64);
  return decryptText(shared, ciphertextB64, ivB64);
}

export type PerKeyEntry = { ct: string; iv: string };
export type CiphertextsMap = Record<string, PerKeyEntry>;

export async function derivePasswordKey(password: string, username: string): Promise<CryptoKey> {
  const salt = new TextEncoder().encode(`nexus:${username.toLowerCase()}`);
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

let passwordKeyCache: CryptoKey | null = null;
export function setPasswordKey(k: CryptoKey | null) {
  passwordKeyCache = k;
}
export function getPasswordKey(): CryptoKey | null {
  return passwordKeyCache;
}

export async function encryptForKeys(
  myPrivateKey: CryptoKey,
  myPublicKey: string,
  recipientPublicKeys: string[],
  data: string | Uint8Array,
): Promise<CiphertextsMap> {
  const map: CiphertextsMap = {};
  const seen = new Set<string>();
  for (const rk of recipientPublicKeys) {
    if (!rk || seen.has(rk)) continue;
    seen.add(rk);
    try {
      const shared = await deriveSharedKey(myPrivateKey, rk);
      const enc =
        data instanceof Uint8Array
          ? await encryptBytes(shared, data as unknown as BufferSource)
          : await encryptText(shared, data);
      map[`${myPublicKey}:${rk}`] = { ct: enc.ciphertext, iv: enc.iv };
    } catch {
    }
  }
  return map;
}

export type PickResult = PerKeyEntry & { key: CryptoKey };
export async function pickEntry(
  myPrivateKey: CryptoKey,
  entries: CiphertextsMap | null | undefined,
): Promise<PickResult | null> {
  if (!entries) return null;
  const sharedCache = new Map<string, CryptoKey>();
  for (const label of Object.keys(entries)) {
    const e = entries[label];
    if (!e?.ct) continue;
    const senderPub = label.split(':')[0] || label;
    let shared = sharedCache.get(senderPub);
    if (!shared) {
      try {
        shared = await deriveSharedKey(myPrivateKey, senderPub);
      } catch {
        continue;
      }
      sharedCache.set(senderPub, shared);
    }
    try {
      await decryptBytes(shared, e.ct, e.iv ?? '');
      return { ct: e.ct, iv: e.iv, key: shared };
    } catch {
    }
  }
  return null;
}

export function sha256(text: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((h) =>
    bufToB64(h).replace(/[+/=]/g, '').slice(0, 14),
  );
}
