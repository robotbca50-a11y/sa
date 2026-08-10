import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, X, Download, Bell } from 'lucide-react';
import {
  getInstallPrompt,
  isStandalone,
  isIOS,
  isAndroid,
  promptInstall,
  installDismissed,
  dismissInstall,
} from '../lib/install';

// Banner "Pasang ke layar utama" — muncul otomatis SETELAH login (sekali saja).
// Android Chrome/desktop: tombol "Pasang" → dialog install resmi (1 tap).
// iPhone: panduan langkah Share → Add to Home Screen (iOS tidak punya API install).
export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (isStandalone() || installDismissed()) return;
    // Muncul sedikit setelah login biar tidak langsung menghalangi.
    const t = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  const prompt = getInstallPrompt();
  const ios = isIOS();
  const android = isAndroid();
  const canAutoInstall = !!prompt; // Android Chrome / desktop Chrome-Edge

  async function doInstall() {
    setInstalling(true);
    const ok = await promptInstall();
    setInstalling(false);
    if (ok) setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.25 }}
          className="pt-safe fixed top-0 left-1/2 -translate-x-1/2 z-[60] w-full flex justify-center px-3"
        >
          <div className="glass rounded-2xl border border-neon/30 p-4 hud-corner shadow-[0_0_30px_rgba(0,240,255,0.15)] w-[min(100%,480px)]">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-neon/10 border border-neon/40 flex items-center justify-center">
                {ios && !canAutoInstall ? <Smartphone size={20} className="text-neon" /> : <Download size={20} className="text-neon" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] text-neon tracking-widest">PASANG APLIKASI //</div>
                <p className="text-sm text-white mt-0.5 leading-snug">
                  Pasang NEXUS di layar utama biar gampang dibuka <b>dan notifikasi selalu masuk</b>, walau web-nya ditutup.
                </p>

                {canAutoInstall ? (
                  <button
                    onClick={doInstall}
                    disabled={installing}
                    className="mt-2.5 w-full py-2.5 rounded-xl bg-neon/15 border border-neon/50 text-neon font-mono text-sm hover:bg-neon/25 disabled:opacity-50"
                  >
                    {installing ? 'Menyiapkan...' : '⬇ PASANG SEKARANG'}
                  </button>
                ) : ios ? (
                  <div className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                    <div className="flex items-start gap-1.5 mb-1">
                      <span className="text-neon font-mono">1.</span> Ketuk tombol <b>Share</b> <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">⏏ Bagikan</span> di Safari
                    </div>
                    <div className="flex items-start gap-1.5 mb-1">
                      <span className="text-neon font-mono">2.</span> Pilih <b>Add to Home Screen</b>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <span className="text-neon font-mono">3.</span> Ketuk <b>Add</b> — notifikasi langsung aktif
                    </div>
                  </div>
                ) : android ? (
                  <div className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                    Buka menu <b>⋮</b> di Chrome → <b>Install app / Tambahkan ke layar utama</b>. Kalau tombol Pasang di atas tidak
                    muncul, lakukan lewat menu Chrome.
                  </div>
                ) : (
                  <div className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                    Buka menu browser → <b>Pasang / Add to Home Screen</b>.
                  </div>
                )}

                <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Bell size={11} className="text-neon/70" />
                  <span>
                    {canAutoInstall
                      ? 'Setelah dipasang, aktifkan notifikasi via tombol 🔔 di atas.'
                      : ios
                        ? 'Notifikasi iPhone hanya jalan setelah app dipasang (iOS 16.4+).'
                        : 'Notifikasi jalan di browser; pasang biar selalu muncul.'}
                  </span>
                </div>
              </div>
              <button
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-virus"
                onClick={() => {
                  dismissInstall();
                  setShow(false);
                }}
                title="Nanti saja"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
