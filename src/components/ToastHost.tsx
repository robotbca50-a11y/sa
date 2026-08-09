import { AnimatePresence, motion } from 'framer-motion';
import { useStore } from '../lib/store';

export default function ToastHost() {
  const toasts = useStore((s) => s.toasts);
  const pop = useStore((s) => s.popToast);

  return (
    <div className="fixed top-4 right-4 z-[90] flex flex-col gap-2 w-[min(92vw,360px)]">
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
