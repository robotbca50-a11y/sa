/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../lib/store';

export default function ToastHost() {
  const toasts = useStore((s) => s.toasts);
  const pop = useStore((s) => s.popToast);

  return (
    <div className="pt-safe fixed top-0 right-0 z-[90] flex flex-col items-end gap-2 p-3 w-[min(100vw,420px)]">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 60, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            className="glass hud-corner rounded-lg p-3 cursor-pointer flex gap-3 items-start"
            onClick={() => {
              t.onClick?.();
              pop(t.id);
            }}
          >
            <div className="text-2xl leading-none mt-0.5">{t.icon ?? '🔔'}</div>
            <div className="min-w-0">
              <div className="font-mono text-xs text-neon tracking-wider">{t.title}</div>
              {t.body && (
                <div className="text-sm text-slate-300 mt-1 break-words line-clamp-3">{t.body}</div>
              )}
            </div>
            <button
              className="ml-auto text-slate-500 hover:text-neon font-mono"
              onClick={(e) => {
                e.stopPropagation();
                pop(t.id);
              }}
            >
              x
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
