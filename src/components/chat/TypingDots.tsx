/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef } from 'react';

export default function TypingDots({ label }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-neon"
          style={{ animation: `typingBounce 1.2s ${i * 0.18}s infinite` }}
        />
      ))}
      {label && <span className="ml-2 text-xs font-mono text-slate-400">{label}</span>}
    </div>
  );
}

export function useTypingPing(key: string, isGroup: boolean, enabled = true) {
  const timer = useRef<number>();
  useEffect(() => {
    if (!enabled) return;
    const h = () => {
      import('../../lib/realtime').then((r) => r.sendTyping(key, isGroup));
      clearTimeout(timer.current);
      timer.current = window.setTimeout(h, 2500);
    };
    const start = window.setTimeout(h, 400);
    return () => {
      clearTimeout(start);
      clearTimeout(timer.current);
    };
  }, [key, isGroup, enabled]);
}
