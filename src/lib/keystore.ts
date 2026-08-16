/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

const DB = 'nexus-e2e';
const STORE = 'keys';

function openDB(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function slot(userKey: string) {
  return `privateKey:${userKey}`;
}

export async function savePrivateKey(key: CryptoKey, userKey: string) {
  const db = await openDB();
  const jwk = await crypto.subtle.exportKey('jwk', key);
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(jwk, slot(userKey));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function loadPrivateKey(userKey: string): Promise<CryptoKey | null> {
  const db = await openDB();
  const jwk = await new Promise<JsonWebKey | undefined>((res) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).get(slot(userKey));
    req.onsuccess = () => res(req.result);
  });
  if (!jwk) {
    const legacy = await new Promise<JsonWebKey | undefined>((res) => {
      const tx = db.transaction(STORE);
      const req = tx.objectStore(STORE).get('privateKey');
      req.onsuccess = () => res(req.result);
    });
    if (!legacy) return null;
    await savePrivateKey(await importJwk(legacy), userKey);
    return importJwk(legacy);
  }
  return importJwk(jwk);
}

async function importJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
}

export async function clearPrivateKey(userKey: string) {
  const db = await openDB();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot(userKey));
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

function encodeB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function decodeB64(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function readJwk(userKey: string): Promise<JsonWebKey | null> {
  const db = await openDB();
  return new Promise<JsonWebKey | undefined>((res) => {
    const tx = db.transaction(STORE);
    const req = tx.objectStore(STORE).get(slot(userKey));
    req.onsuccess = () => res(req.result);
  }).then((jwk) => jwk ?? null);
}

export async function exportPrivateKeyB64(userKey: string): Promise<string> {
  const jwk = await readJwk(userKey);
  if (!jwk) throw new Error('Kunci privat tidak ditemukan di device ini.');
  return encodeB64(new TextEncoder().encode(JSON.stringify(jwk)));
}

export async function importPrivateKeyB64(b64: string, userKey: string): Promise<CryptoKey> {
  const json = new TextDecoder().decode(decodeB64(b64));
  const jwk = JSON.parse(json) as JsonWebKey;
  if (jwk?.kty !== 'EC' || !jwk.d) throw new Error('bukan kunci privat yang valid');
  const key = await importJwk(jwk);
  await savePrivateKey(key, userKey);
  return key;
}
