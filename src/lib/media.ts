/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';


const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';
const FF_LOAD_TIMEOUT_MS = 60_000;
const FF_RUN_TIMEOUT_MS = 300_000;

let ffPromise: Promise<FFmpeg> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`Timeout: ${what}`)), ms);
    p.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      },
    );
  });
}

function getFFmpeg(): Promise<FFmpeg> {
  if (!ffPromise) {
    ffPromise = (async () => {
      const ff = new FFmpeg();
      await withTimeout(
        ff.load({
          coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
        }),
        FF_LOAD_TIMEOUT_MS,
        'memuat ffmpeg (koneksi lambat?)',
      );
      return ff;
    })();
    ffPromise.catch(() => {
      ffPromise = null;
    });
  }
  return ffPromise;
}

let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar'));
    img.src = url;
  });
}

export async function compressImage(file: Blob, maxDim = 1920, quality = 0.85): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1 && file.type === 'image/jpeg' && file.size < 200 * 1024) return file;
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('Kompresi gagal'))), 'image/jpeg', quality),
    );
    return out.size < file.size ? out : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressVideo(file: Blob, onProgress?: (pct: number) => void): Promise<Blob> {
  return serial(async () => {
    const ff = await getFFmpeg();
    ff.on('progress', ({ progress }) => {
      if (onProgress) onProgress(Math.max(0, Math.min(100, Math.round(progress * 100))));
    });
    try {
      await ff.writeFile('in.mp4', await fetchFile(file));
      await withTimeout(
        ff.exec([
          '-i', 'in.mp4',
          '-vf', "scale='min(1280,iw)':-2",
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-ac', '2',
          '-movflags', '+faststart',
          'out.mp4',
        ]),
        FF_RUN_TIMEOUT_MS,
        'kompres video (file terlalu besar?)',
      );
      const raw = await ff.readFile('out.mp4');
      const arr = raw instanceof Uint8Array ? raw : new Uint8Array(new TextEncoder().encode(String(raw)));
      await ff.deleteFile('in.mp4').catch(() => {});
      await ff.deleteFile('out.mp4').catch(() => {});
      return new Blob([arr as unknown as BlobPart], { type: 'video/mp4' });
    } catch (e) {
      await ff.deleteFile('in.mp4').catch(() => {});
      await ff.deleteFile('out.mp4').catch(() => {});
      throw e;
    }
  });
}

export async function prepareMedia(
  file: Blob,
  msgType: string,
  onProgress?: (pct: number) => void,
): Promise<Blob> {
  if (msgType === 'video') {
    if (file.size < 30 * 1024 * 1024) return file;
    try {
      const out = await compressVideo(file, onProgress);
      return out.size < file.size ? out : file;
    } catch {
      return file;
    }
  }
  if (msgType === 'image') {
    if (file.type === 'image/gif') return file;
    try {
      return await compressImage(file);
    } catch {
      return file;
    }
  }
  return file;
}
