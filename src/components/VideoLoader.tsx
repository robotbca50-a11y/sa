/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import Glitch from './Glitch';

const VIDEOS = [
  '/vidios/130911-748586188_medium.mp4',
  '/vidios/186363-877727695_medium.mp4',
  '/vidios/199741-911047189_medium.mp4',
  '/vidios/200065-911902193_medium.mp4',
  '/vidios/23154-333321334_medium.mp4',
  '/vidios/264826_medium.mp4',
  '/vidios/73654-549527823_medium.mp4',
];

const DURATION = 4000;

export default function VideoLoader({ onDone }: { onDone: () => void }) {
  const [src] = useState(() => VIDEOS[Math.floor(Math.random() * VIDEOS.length)]);
  const [leaving, setLeaving] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      const pct = Math.round(p * 100);
      if (barRef.current) barRef.current.style.width = `${pct}%`;
      if (pctRef.current) pctRef.current.textContent = `${pct}%`;
      if (statusRef.current) {
        const st =
          p < 0.15
            ? 'INITIALISASI ANTARMUKA CYBORG'
            : p < 0.45
              ? 'MENGHUBUNGI GALAKSI BIMA SAKTI'
              : p < 0.8
                ? 'MENYINKRONKAN ENKRIPSI KUNCI'
                : 'MEMASUKI LUBANG HITAM';
        if (statusRef.current.textContent !== st) statusRef.current.textContent = st;
      }
      if (p >= 1 && !doneRef.current) {
        doneRef.current = true;
        setTimeout(() => {
          setLeaving(true);
          setTimeout(() => {
            if (!doneRef.current) return;
            onDoneRef.current();
          }, 700);
        }, 300);
      } else {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[80] bg-black transition-opacity duration-700 ${
        leaving ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <video
        key={src}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
      <div className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-center gap-4 px-6 text-center">
        <Glitch
          text="NEXUS"
          className="neon-text text-[clamp(2.2rem,8vw,6.5rem)] font-bold tracking-[0.35em] md:tracking-[0.45em]"
        />
        <div
          ref={statusRef}
          className="font-mono text-[clamp(0.55rem,2.2vw,0.95rem)] tracking-[0.4em] text-white/90"
          style={{ textShadow: '0 0 10px rgba(0,0,0,0.9)' }}
        >
          INITIALISASI ANTARMUKA CYBORG
        </div>
        <div className="mt-2 h-[clamp(2px,0.4vw,4px)] w-[min(62vw,30rem)] overflow-hidden rounded-full bg-white/20 backdrop-blur-sm">
          <div
            ref={barRef}
            className="h-full w-0 rounded-full bg-gradient-to-r from-virus via-arc to-neon shadow-[0_0_14px_rgba(0,240,255,0.9)]"
          />
        </div>
        <div
          ref={pctRef}
          className="font-mono text-[clamp(0.7rem,2.4vw,1.05rem)] tracking-[0.3em] text-virus"
          style={{ textShadow: '0 0 12px rgba(255,46,166,0.8)' }}
        >
          0%
        </div>
      </div>
    </div>
  );
}
