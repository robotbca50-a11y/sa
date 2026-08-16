/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef } from 'react';

const KEY = 'nexus:antix';
const HOLD_MS = 1800;

export function antiSadapEnabled(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    return v !== '0';
  } catch {
    return true;
  }
}

export function setAntiSadap(on: boolean) {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, '0');
  } catch {
  }
}

export default function AntiSadapOverlay() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!antiSadapEnabled()) return;
    let hideTimer: number | undefined;
    const black = () => {
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = undefined;
      if (ref.current) ref.current.style.display = 'block';
    };
    const unblack = () => {
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        hideTimer = undefined;
        if (ref.current) ref.current.style.display = 'none';
      }, HOLD_MS);
    };
    const onVis = () => {
      if (document.hidden) black();
      else unblack();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', black);
    window.addEventListener('focus', unblack);
    window.addEventListener('pagehide', black);
    window.addEventListener('pageshow', unblack);
    document.addEventListener('webkithidden', black);
    document.addEventListener('webkitvisibilitychange', onVis);
    return () => {
      if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', black);
      window.removeEventListener('focus', unblack);
      window.removeEventListener('pagehide', black);
      window.removeEventListener('pageshow', unblack);
      document.removeEventListener('webkithidden', black);
      document.removeEventListener('webkitvisibilitychange', onVis);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[1000000] flex items-center justify-center"
      style={{ display: 'none', background: '#000', pointerEvents: 'none', userSelect: 'none' }}
      aria-hidden
    >
      <span
        className="font-mono text-sm text-white/80 tracking-widest"
        style={{ textShadow: '0 0 12px rgba(0,0,0,0.9)' }}
      >
        TANGKAP LAYAR / REKAM TIDAK DIIZINKAN
      </span>
    </div>
  );
}
