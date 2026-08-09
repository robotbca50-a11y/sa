import { useEffect, useState } from 'react';

const TERMINAL_LINES: string[] = [
  'Microsoft Windows [Versi 10.0.19045.4046]',
  '(c) Microsoft Corporation. Hak cipta dilindungi.',
  '',
  'C:\\WINDOWS\\system32> taskkill /f /im explorer.exe',
  'SUKSES: Proses "explorer.exe" (PID 4204) sudah dihentikan.',
  'C:\\WINDOWS\\system32> shutdown /r /f /t 10',
  'C:\\WINDOWS\\system32> shutdown /r /f /t 5',
  'C:\\WINDOWS\\system32> shutdown /r /f /t 3',
  'C:\\WINDOWS\\system32> shutdown /r /f /t 1',
  '',
  'Sistem sedang dimatikan. Tutup semua aplikasi sekarang.',
  '> KAMU KEBLOKIR. SELAMAT DATANG DI KEGELAPAN.',
];

function TerminalScreen({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState('');
  useEffect(() => {
    let line = 0;
    let ch = 0;
    let timer = 0;
    const tick = () => {
      const cur = TERMINAL_LINES[line];
      if (ch < cur.length) {
        ch += 1;
        setText((prev) => prev + cur[ch - 1]);
        timer = window.setTimeout(tick, 16);
      } else {
        line += 1;
        ch = 0;
        if (line >= TERMINAL_LINES.length) {
          timer = window.setTimeout(onDone, 1400);
          return;
        }
        setText((prev) => prev + '\n');
        timer = window.setTimeout(tick, 260);
      }
    };
    timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, [onDone]);
  return (
    <div className="flex h-full w-full items-start justify-start bg-black p-6 sm:p-10 font-mono text-[clamp(0.6rem,2.4vw,1rem)] leading-relaxed text-[#4af626]">
      <pre className="whitespace-pre-wrap">{text}<span className="animate-pulse">█</span></pre>
    </div>
  );
}

function BsodScreen({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPct((p) => Math.min(100, p + 1 + Math.floor(Math.random() * 4)));
    }, 110);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (pct >= 100) {
      const t = window.setTimeout(onDone, 1600);
      return () => window.clearTimeout(t);
    }
  }, [pct, onDone]);
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white"
      style={{ background: '#0078d7' }}
    >
      <div className="text-[clamp(5rem,18vw,10rem)] leading-none font-bold">:&#40;</div>
      <div className="mt-6 max-w-xl text-[clamp(1rem,3.4vw,1.7rem)] font-semibold">
        PC kamu ngalamin masalah dan perlu di-restart.
      </div>
      <div className="mt-4 max-w-lg text-[clamp(0.7rem,2.2vw,1rem)] opacity-95">
        Kami lagi ngumpulin info error-nya, dan nanti PC akan restart sendiri.
      </div>
      <div className="mt-6 text-[clamp(0.8rem,2.6vw,1.2rem)]">
        {pct}% selesai
      </div>
      <div className="mt-2 text-[clamp(0.6rem,2vw,0.85rem)] opacity-90">
        Stop code: NEXUS_KERNEL_SECURITY_CHECK_FAILURE
      </div>
      <div className="absolute bottom-4 text-[clamp(0.55rem,1.8vw,0.8rem)] opacity-80">
        Ini bukan error beneran. Kamu cuma diblock. 💀
      </div>
    </div>
  );
}

function RebootScreen({ onDone }: { onDone: () => void }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPct((p) => Math.min(100, p + 1 + Math.floor(Math.random() * 3)));
    }, 150);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (pct >= 100) {
      const t = window.setTimeout(onDone, 1500);
      return () => window.clearTimeout(t);
    }
  }, [pct, onDone]);
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center bg-black text-white">
      <div className="mb-10 flex items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/15 border-t-white" />
        <div className="font-display text-3xl font-bold tracking-widest">WINDOWS</div>
      </div>
      <div className="text-[clamp(0.9rem,2.8vw,1.4rem)] font-semibold tracking-wide">
        MENYIAPKAN PENYETELAN ULANG
      </div>
      <div className="mt-3 text-[clamp(0.65rem,2vw,0.95rem)] text-white/80">
        JANGAN MATIKAN KOMPUTER
      </div>
      <div className="mt-8 w-[min(70vw,30rem)] overflow-hidden rounded-full bg-white/15">
        <div
          className="h-[clamp(3px,0.6vw,6px)] rounded-full bg-white transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 font-mono text-[clamp(0.7rem,2.2vw,1rem)]">{pct}%</div>
      <div className="absolute bottom-4 text-[clamp(0.55rem,1.8vw,0.8rem)] text-white/60">
        NEXUS // KILL SCREEN
      </div>
    </div>
  );
}

const SCREENS = [TerminalScreen, BsodScreen, RebootScreen];

export default function FakeReset() {
  const [phase, setPhase] = useState(0);
  // Setelah urutan "boot" selesai, diam di layar hitam polos (tanpa ulang).
  if (phase >= SCREENS.length) {
    return <div className="h-full w-full bg-black" />;
  }
  const Comp = SCREENS[phase];
  return <Comp onDone={() => setPhase((p) => p + 1)} />;
}
