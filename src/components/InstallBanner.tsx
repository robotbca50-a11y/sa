import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, X, Download, Bell, Share, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getInstallPrompt,
  isStandalone,
  isIOS,
  isAndroid,
  promptInstall,
  installDismissed,
  dismissInstall,
} from '../lib/install';

// Banner "Pasang NEXUS di layar utama" — muncul otomatis SETELAH login (sekali
// saja), selalu di ATAS layar. Tombol PASANG SEKARANG selalu tersedia:
//   - Android Chrome/desktop: tombol memanggil dialog install resmi browser.
//   - iOS / Android non-Chrome / kalau browser memblokir prompt: tombol membuka
//     panduan langkah demi langkah (Share → Add to Home Screen / menu browser).
// Konten bisa di-scroll (max-h) jadi tidak pernah kepotong di layar kecil.
export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    if (isStandalone() || installDismissed()) return;
    const t = window.setTimeout(() => setShow(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    // Tombol "PASANG" di header bisa memunculkan banner lagi kapan saja.
    const onShow = () => setShow(true);
    window.addEventListener('nexus:show-install', onShow);
    return () => window.removeEventListener('nexus:show-install', onShow);
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
    else setGuide(true); // prompt diblokir/declined → tampilkan panduan manual
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.25 }}
          className="pt-safe fixed top-0 inset-x-0 z-[60] px-3 flex justify-center pointer-events-none"
        >
          <div className="pointer-events-auto glass rounded-2xl border border-neon/30 hud-corner shadow-[0_0_30px_rgba(0,240,255,0.15)] w-full max-w-md max-h-85-app overflow-y-auto">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-xl bg-neon/10 border border-neon/40 flex items-center justify-center">
                  {ios ? <Smartphone size={20} className="text-neon" /> : <Download size={20} className="text-neon" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-[11px] text-neon tracking-widest">PASANG APLIKASI //</div>
                  <p className="text-sm text-white mt-0.5 leading-snug">
                    Pasang NEXUS di layar utama biar gampang dibuka <b>dan notifikasi selalu masuk</b>, walau web-nya ditutup.
                  </p>
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

              <button
                onClick={doInstall}
                disabled={installing}
                className="mt-3 w-full py-3 rounded-xl bg-neon/15 border border-neon/50 text-neon font-mono text-sm hover:bg-neon/25 disabled:opacity-50"
              >
                {installing ? 'Menyiapkan...' : '⬇ PASANG SEKARANG'}
              </button>

              <button
                onClick={() => setGuide((v) => !v)}
                className="mt-2 w-full py-2 rounded-xl border border-white/10 text-slate-300 font-mono text-xs hover:bg-white/5 flex items-center justify-center gap-1.5"
              >
                {guide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {ios ? 'Cara pasang di iPhone / iPad' : 'Cara pasang + kalau diblokir'}
              </button>

              {guide && (
                <div className="mt-3 text-xs text-slate-300 leading-relaxed space-y-2">
                  {ios ? (
                    <>
                      <div className="font-mono text-neon tracking-widest text-[10px]">IPHONE / IPAD (SAFARI)</div>
                      <p>
                        iPhone tidak punya tombol install otomatis — ini aturan Apple, bukan NEXUS. Ikuti 3 langkah ini di
                        Safari:
                      </p>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">1.</span> Ketuk tombol <b>Share</b>{' '}
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 font-mono text-[10px]">
                          <Share size={10} /> Bagikan
                        </span>{' '}
                        (di bawah layar Safari)
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">2.</span> Pilih <b>Add to Home Screen</b> (tambah ke layar utama)
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">3.</span> Ketuk <b>Add</b> — app NEXUS muncul di layar utama,
                        notifikasi otomatis aktif.
                      </div>
                      <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-[11px] text-slate-400">
                        Notifikasi iPhone hanya jalan setelah app dipasang (butuh iOS 16.4 atau lebih baru).
                      </div>
                    </>
                  ) : android ? (
                    <>
                      <div className="font-mono text-neon tracking-widest text-[10px]">ANDROID (CHROME)</div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">1.</span> Ketuk menu <b>⋮</b> di pojok kanan atas Chrome
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">2.</span> Pilih <b>Install app</b> atau <b>Tambahkan ke layar utama</b>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">3.</span> Konfirmasi — app NEXUS terpasang seperti aplikasi biasa
                      </div>
                      <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-[11px] text-slate-400">
                        <b>Kalau diblokir:</b> buka <Settings size={10} className="inline" /> Pengaturan Chrome → Situs →
                        temukan NEXUS → izinkan <b>Notifikasi</b> dan <b>Instalasi aplikasi</b>. Kalau memakai Firefox,
                        Samsung Internet, atau browser lain: gunakan menu <b>Tambahkan ke beranda</b> / <b>Instal aplikasi</b>.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono text-neon tracking-widest text-[10px]">DESKTOP (CHROME / EDGE)</div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">1.</span> Klik ikon <b>install</b> di bilah alamat (kanan) atau menu ⋮
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-neon font-mono">2.</span> Pilih <b>Install NEXUS</b>
                      </div>
                      <div className="rounded-lg bg-white/5 border border-white/10 p-2 text-[11px] text-slate-400">
                        Firefox: menu → <b>Pasang Aplikasi</b>. Safari: menu File → <b>Add to Dock</b>.
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                <Bell size={11} className="text-neon/70" />
                <span>
                  {ios
                    ? 'Setelah dipasang, aktifkan notifikasi via tombol 🔔.'
                    : canAutoInstall
                      ? 'Setelah dipasang, aktifkan notifikasi via tombol 🔔 di atas.'
                      : 'Notifikasi jalan di browser; pasang biar selalu muncul.'}
                </span>
              </div>

              {installed && (
                <div className="mt-2 rounded-lg bg-lime/10 border border-lime/40 p-2 text-[11px] text-lime">
                  ✓ NEXUS berhasil dipasang.
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
