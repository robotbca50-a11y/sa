/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/


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
  }
}

export function clearInstallDismiss() {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
  }
}

export function showInstallBanner() {
  clearInstallDismiss();
  window.dispatchEvent(new CustomEvent('nexus:show-install'));
}
