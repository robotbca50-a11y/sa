// Deteksi & trigger install PWA.
// - Android/Chrome & desktop Chrome/Edge: event `beforeinstallprompt` → kita
//   tampilkan tombol "Pasang" → prompt install resmi muncul (1 tap).
// - iOS: TIDAK ada API install; kita hanya bisa menampilkan panduan
//   Share → Add to Home Screen. (Aturan browser, tidak bisa dipaksa.)

let deferredPrompt: any = null;
let promptBound = false;

export function bindInstallPrompt() {
  if (promptBound) return;
  promptBound = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

export function getInstallPrompt() {
  return deferredPrompt;
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

export function isAndroid() {
  return /Android/.test(navigator.userAgent);
}

// Munculkan dialog install resmi (Android Chrome / desktop). return true = dipasang.
export async function promptInstall(): Promise<boolean> {
  const p = deferredPrompt;
  if (!p) return false;
  p.prompt();
  try {
    const choice = await p.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  } finally {
    deferredPrompt = null;
  }
}

const DISMISS_KEY = 'nexus:install-dismissed';

export function installDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* noop */
  }
}
