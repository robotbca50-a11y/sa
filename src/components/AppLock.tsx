import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Delete, LogOut } from 'lucide-react';
import { useStore } from '../lib/store';
import { isLocked, unlock, checkAutoLock, lockNow, markActive, onUserActivity } from '../lib/lock';

export default function AppLock() {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState(false);
  const view = useStore((s) => s.view);

  useEffect(() => {
    const onDown = () => {
      markActive();
      onUserActivity();
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    const iv = window.setInterval(() => {
      const st = checkAutoLock();
      if (st && view === 'app') setLocked(true);
    }, 1000);
    const onVis = () => {
      if (document.hidden) {
        markActive();
        lockNow();
      } else {
        const st = checkAutoLock();
        if (st) setLocked(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', lockNow);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', lockNow);
      window.clearInterval(iv);
    };
  }, [view]);

  function press(d: string) {
    const next = (pin + d).slice(0, 4);
    setPin(next);
    setErr(false);
    if (next.length === 4) {
      setTimeout(() => {
        const ok = unlock(next);
        if (ok) {
          setLocked(false);
          setPin('');
        } else {
          setErr(true);
          setPin('');
        }
      }, 120);
    }
  }

  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-abyss/98 backdrop-blur-xl flex items-center justify-center px-6"
        >
          <div className="w-full max-w-xs">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-neon/15 border border-neon/40 flex items-center justify-center mb-3">
                <Lock size={26} className="text-neon" />
              </div>
              <div className="font-mono text-sm text-white">APP TERKUNCI</div>
              <div className="font-mono text-[10px] text-slate-500 mt-1">masukkan PIN 4 digit untuk membuka</div>
            </div>
            <div className="flex justify-center gap-3 mb-6">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`w-3.5 h-3.5 rounded-full border transition-colors ${
                    pin.length > i ? 'bg-neon border-neon' : err ? 'border-virus' : 'border-slate-600'
                  }`}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  onClick={() => press(d)}
                  className="py-4 rounded-xl bg-white/5 border border-white/10 text-white text-xl font-mono hover:bg-white/10 active:scale-95 transition-all"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                onClick={() => press('0')}
                className="py-4 rounded-xl bg-white/5 border border-white/10 text-white text-xl font-mono hover:bg-white/10 active:scale-95 transition-all"
              >
                0
              </button>
              <button
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="py-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center"
              >
                <Delete size={20} />
              </button>
            </div>
            {err && <div className="text-center text-virus text-xs font-mono mt-4">PIN salah. Coba lagi.</div>}
            <button
              onClick={() => {
                window.dispatchEvent(new Event('nexus:logout'));
              }}
              className="mt-6 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-virus/40 text-virus text-xs font-mono hover:bg-virus/10"
            >
              <LogOut size={13} /> Keluar & buka tanpa PIN
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
