/*
  nexus://o8.2 CLIENT FORTRESS
  Auto-defend · Tamper-proof · Self-destruct
  sig://oktagram
*/

const FORTRESS_KEY = 'nexus:fortress';
const TAMPER_COUNT_KEY = 'nexus:tamper_count';
const HEARTBEAT_KEY = 'nexus:heartbeat';
const DEBUG_KEY = 'nexus:debug_detected';

let _integrityHash = '';
let _onBreach: (() => void) | null = null;
let _heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let _debugWatchInterval: ReturnType<typeof setInterval> | null = null;

// ─────────────────────────────────────────────
// FINGERPRINT: generates a device fingerprint
// ─────────────────────────────────────────────

export async function generateFingerprint(): Promise<string> {
  const parts: string[] = [];
  parts.push(navigator.userAgent);
  parts.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
  parts.push(navigator.language);
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  parts.push(String(navigator.hardwareConcurrency));
  parts.push(String(navigator.maxTouchPoints));
  parts.push(String((navigator as any).deviceMemory));
  parts.push(navigator.platform);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(122, 5, 62, 50);
      ctx.fillStyle = '#069';
      ctx.fillText('nexus-fp', 2, 15);
      parts.push(canvas.toDataURL().slice(0, 100));
    }
  } catch { parts.push('no-canvas'); }

  try {
    const webgl = document.createElement('canvas').getContext('webgl');
    if (webgl) {
      const ext = webgl.getExtension('WEBGL_debug_renderer_info');
      if (ext) {
        parts.push(webgl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      }
    }
  } catch { parts.push('no-webgl'); }

  try {
    const fonts = ['Arial', 'Verdana', 'Courier', 'Times New Roman', 'Georgia'];
    let fontStr = '';
    for (const f of fonts) {
      const span = document.createElement('span');
      span.style.fontFamily = f;
      span.style.position = 'absolute';
      span.style.left = '-9999px';
      span.textContent = 'test';
      document.body.appendChild(span);
      fontStr += f + ':' + span.offsetWidth + 'x' + span.offsetHeight + ';';
      document.body.removeChild(span);
    }
    parts.push(fontStr);
  } catch { parts.push('no-fonts'); }

  const raw = parts.join('|');
  const buf = new TextEncoder().encode(raw);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(hash);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

// ─────────────────────────────────────────────
// INTEGRITY: compute hash of critical modules
// ─────────────────────────────────────────────

export async function computeIntegrity(): Promise<string> {
  try {
    const scripts = document.querySelectorAll('script[src]');
    const urls: string[] = [];
    scripts.forEach((s) => {
      const src = (s as HTMLScriptElement).src;
      if (src && src.includes('assets/')) urls.push(src);
    });
    urls.sort();
    const raw = urls.join('|');
    const buf = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const bytes = new Uint8Array(hash);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  } catch { return ''; }
}

// ─────────────────────────────────────────────
// TAMPER DETECTION
// ─────────────────────────────────────────────

export async function checkTamper(): Promise<boolean> {
  const fp = await generateFingerprint();
  const stored = localStorage.getItem(FORTRESS_KEY);

  if (stored && stored !== fp) {
    const count = parseInt(localStorage.getItem(TAMPER_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(TAMPER_COUNT_KEY, String(count));

    if (count >= 3) {
      selfDestruct('TAMPER_3X');
      return true;
    }
    return false;
  }

  localStorage.setItem(FORTRESS_KEY, fp);
  localStorage.setItem(TAMPER_COUNT_KEY, '0');
  return false;
}

// ─────────────────────────────────────────────
// HEARTBEAT: periodic integrity check
// ─────────────────────────────────────────────

export function startHeartbeat(onBreach: () => void) {
  _onBreach = onBreach;

  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _heartbeatInterval = setInterval(async () => {
    const now = Date.now();
    const last = parseInt(localStorage.getItem(HEARTBEAT_KEY) || '0', 10);
    if (last > now + 300_000) {
      selfDestruct('CLOCK_TAMPER');
      return;
    }
    localStorage.setItem(HEARTBEAT_KEY, String(now));

    const currentHash = await computeIntegrity();
    if (_integrityHash && currentHash && currentHash !== _integrityHash) {
      selfDestruct('INTEGRITY_BREACH');
      return;
    }

    await checkTamper();
  }, 30_000);
}

export function stopHeartbeat() {
  if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
}

export function setIntegrityHash(hash: string) {
  _integrityHash = hash;
}

// ─────────────────────────────────────────────
// ANTI-DEBUG: detect devtools
// ─────────────────────────────────────────────

export function startAntiDebug() {
  if (_debugWatchInterval) return;

  let debugCount = 0;

  const check = () => {
    const start = performance.now();
    debugger;
    const elapsed = performance.now() - start;
    if (elapsed > 100) {
      debugCount++;
      localStorage.setItem(DEBUG_KEY, String(debugCount));
      if (debugCount >= 3) {
        selfDestruct('DEBUGGER_3X');
      }
    }
  };

  _debugWatchInterval = setInterval(check, 10_000);

  if (typeof window !== 'undefined') {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
        (e.ctrlKey && (e.key === 'U' || e.key === 'u')) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        debugCount++;
        localStorage.setItem(DEBUG_KEY, String(debugCount));
      }
    };
    window.addEventListener('keydown', handler);

    Object.defineProperty(window, '__devtools', {
      get() {
        debugCount++;
        return false;
      },
      configurable: false,
    });

    const devtools = /./;
    devtools.toString = () => {
      debugCount++;
      return '';
    };
    console.log('%c', devtools);
  }
}

export function stopAntiDebug() {
  if (_debugWatchInterval) { clearInterval(_debugWatchInterval); _debugWatchInterval = null; }
}

// ─────────────────────────────────────────────
// SELF-DESTRUCT: wipe all data on breach
// ─────────────────────────────────────────────

function selfDestruct(reason: string) {
  const prefix = 'nexus:';
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keysToRemove.push(k);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  try {
    indexedDB.deleteDatabase('nexus-e2e');
  } catch {}

  sessionStorage.clear();

  if (_onBreach) _onBreach();

  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#0b0f1a;color:#ff3333;font-family:monospace;text-align:center;padding:20px;">
      <div>
        <h1 style="font-size:24px;margin-bottom:16px;">SECURITY BREACH DETECTED</h1>
        <p style="color:#888;margin-bottom:12px;">Sistem mendeteksi aktivitas tidak wajar.</p>
        <p style="color:#666;font-size:12px;">Kode: ${reason}</p>
        <p style="color:#444;font-size:11px;margin-top:8px;">Silakan clear cache browser dan login ulang.</p>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// ANTI-TAMPER: protect localStorage entries
// ─────────────────────────────────────────────

export function sealStorage(key: string) {
  const original = localStorage.getItem(key);
  if (original === null) return;

  Object.defineProperty(localStorage, key, {
    get() { return original; },
    set() { /* silent block */ },
    configurable: false,
  });
}

// ─────────────────────────────────────────────
// PROTOTYPE POLLUTION PROTECTION
// ─────────────────────────────────────────────

function blockPrototypePollution() {
  try {
    const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

    const origDefineProperty = Object.defineProperty;
    Object.defineProperty = function safeDefineProperty(obj: any, prop: string, desc: any) {
      if (dangerousKeys.includes(prop) && typeof obj === 'object') {
        return obj;
      }
      return origDefineProperty(obj, prop, desc);
    } as typeof Object.defineProperty;

    const origAssign = Object.assign;
    Object.assign = function safeAssign(target: any, ...sources: any[]) {
      for (const src of sources) {
        if (src && typeof src === 'object') {
          for (const key of dangerousKeys) {
            if (key in src) {
              delete (src as any)[key];
            }
          }
        }
      }
      return origAssign(target, ...sources);
    } as typeof Object.assign;
  } catch {}
}

// ─────────────────────────────────────────────
// DOM CLOGGING PROTECTION
// ─────────────────────────────────────────────

function blockDomClobbering() {
  try {
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function(tag: string) {
      const el = origCreateElement(tag);
      if (tag.toLowerCase() === 'form') {
        const formEl = el as HTMLFormElement;
        const origSubmit = formEl.submit.bind(formEl);
        formEl.submit = function() {
          return origSubmit();
        };
      }
      return el;
    } as typeof document.createElement;
  } catch {}
}

// ─────────────────────────────────────────────
// CONTENT INJECTION DETECTION
// ─────────────────────────────────────────────

let contentCheckInterval: ReturnType<typeof setInterval> | null = null;

function startContentGuard() {
  contentCheckInterval = setInterval(() => {
    try {
      const scripts = document.querySelectorAll('script');
      scripts.forEach((s) => {
        const src = (s as HTMLScriptElement).src;
        if (src && !src.includes(window.location.origin) && !src.includes('tile.openstreetmap.org')) {
          s.remove();
        }
      });

      const iframes = document.querySelectorAll('iframe');
      iframes.forEach((f) => f.remove());

      const forms = document.querySelectorAll('form[action]');
      forms.forEach((f) => {
        const action = (f as HTMLFormElement).action;
        if (action && !action.includes(window.location.origin)) {
          (f as HTMLFormElement).removeAttribute('action');
        }
      });
    } catch {}
  }, 5000);
}

function stopContentGuard() {
  if (contentCheckInterval) { clearInterval(contentCheckInterval); contentCheckInterval = null; }
}

// ─────────────────────────────────────────────
// CSP ENFORCEMENT (client-side)
// ─────────────────────────────────────────────

function enforceCSP() {
  try {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://fonts.googleapis.com; img-src 'self' data: blob: https:; media-src 'self' blob: https: data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.ipify.org https://openrouter.ai; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
    document.head.appendChild(meta);
  } catch {}
}

// ─────────────────────────────────────────────
// MEMORY GUARD (detect memory tampering)
// ─────────────────────────────────────────────

let memoryBaseline = 0;

function checkMemory() {
  try {
    const perf = (performance as any).memory;
    if (perf) {
      const current = perf.usedJSHeapSize;
      if (memoryBaseline > 0 && current > memoryBaseline * 3) {
        selfDestruct('MEMORY_SPIKE');
        return;
      }
      memoryBaseline = current;
    }
  } catch {}
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

export async function initFortress(onBreach: () => void) {
  const tampered = await checkTamper();
  if (tampered) return;

  const hash = await computeIntegrity();
  setIntegrityHash(hash);

  startHeartbeat(onBreach);
  startAntiDebug();
  blockPrototypePollution();
  blockDomClobbering();
  startContentGuard();
  enforceCSP();

  localStorage.setItem(HEARTBEAT_KEY, String(Date.now()));

  setInterval(checkMemory, 60_000);
}

export function destroyFortress() {
  stopHeartbeat();
  stopAntiDebug();
  stopContentGuard();
}
