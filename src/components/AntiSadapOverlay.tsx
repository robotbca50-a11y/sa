import { useEffect, useState } from 'react';

const KEY = 'nexus:antix';

export function antiSadapEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAntiSadap(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

// Layar jadi hitam total saat app di-background / kehilangan fokus — seperti
// mode anti-sadap di app bank & Netflix. Isi chat tidak bisa terbaca orang
// yang mengintip lewat app switcher / saat kamu pindah aplikasi.
export default function AntiSadapOverlay() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!antiSadapEnabled()) return;
    const onHide = () => setShown(true);
    const onShow = () => window.setTimeout(() => setShown(false), 150);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onHide();
      else onShow();
    });
    window.addEventListener('blur', onHide);
    window.addEventListener('focus', onShow);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onHide);
      window.removeEventListener('focus', onShow);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-0 z-[1000000]"
      style={{ background: '#000', pointerEvents: 'none', userSelect: 'none' }}
      aria-hidden
    />
  );
}
