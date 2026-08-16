/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, MonitorPlay, Link2, Clapperboard, ExternalLink, Timer } from 'lucide-react';
import { onWatch, sendWatch } from '../../lib/realtime';
import { useStore } from '../../lib/store';
import NeonButton from '../NeonButton';

let ytApiPromise: Promise<void> | null = null;
function loadYT() {
  if ((window as any).YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((res) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    const prev = (window as any).onYouTubeIframeAPIReady;
    (window as any).onYouTubeIframeAPIReady = () => {
      prev?.();
      res();
    };
  });
  return ytApiPromise;
}

function extractId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function openNetflix() {
  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  const url = isMobile ? 'https://www.netflix.com' : 'https://www.netflix.com';
  window.open(url, '_blank');
}

export default function WatchParty() {
  const me = useStore((s) => s.me);
  const [mode, setMode] = useState<'netflix' | 'youtube'>('netflix');
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [cdMsg, setCdMsg] = useState<string | null>(null);
  const playerRef = useRef<any>(null);
  const lastBroadcast = useRef(0);
  const isApplying = useRef(false);
  const remoteState = useRef({ url: '', playing: false, t: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onWatch((p) => {
      if (p.from === me?.id) return;
      if (p.event === 'netflix-countdown') {
        setCdMsg(`${p.username ?? 'Seseorang'} memulai hitung mundur`);
        runCountdown();
        return;
      }
      remoteState.current = p;
      if (p.url && p.url !== videoId) {
        loadVideo(p.url);
      }
    });
    return () => unsub();
  }, [videoId, me?.id]);

  function runCountdown() {
    setCountdown(3);
    setCdMsg(null);
    const iv = setInterval(() => {
      setCountdown((c) => {
        if (c === null) {
          clearInterval(iv);
          return null;
        }
        if (c <= 1) {
          clearInterval(iv);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    setTimeout(() => {
      setCountdown(null);
    }, 4000);
  }

  function startTogether() {
    sendWatch({
      from: me!.id,
      username: me!.username,
      event: 'netflix-countdown',
    });
    runCountdown();
  }

  async function loadVideo(id: string) {
    await loadYT();
    setVideoId(id);
    setTimeout(() => {
      const el = containerRef.current;
      if (!el) return;
      el.innerHTML = '';
      const div = document.createElement('div');
      el.appendChild(div);
      playerRef.current = new (window as any).YT.Player(div, {
        videoId: id,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            setSynced(true);
            const r = remoteState.current;
            if (r.url === id) {
              if (r.playing) playerRef.current?.playVideo();
              if (r.t) playerRef.current?.seekTo(r.t, true);
            } else {
              playerRef.current?.playVideo();
            }
          },
          onStateChange: (e: any) => {
            if (isApplying.current) return;
            if (e.data === 1) {
              broadcast();
            }
            if (e.data === 2) {
              sendWatch({ from: me!.id, url: id, playing: false, t: playerRef.current?.getCurrentTime?.() ?? 0 });
            }
          },
          onError: () => setSynced(false),
        },
      });
    }, 120);
  }

  function broadcast() {
    const now = Date.now();
    if (now - lastBroadcast.current < 2500) return;
    lastBroadcast.current = now;
    sendWatch({
      from: me!.id,
      url: videoId,
      playing: playerRef.current?.getPlayerState?.() === 1,
      t: playerRef.current?.getCurrentTime?.() ?? 0,
    });
  }

  useEffect(() => {
    const iv = setInterval(() => {
      if (playerRef.current?.getPlayerState?.() === 1) broadcast();
      const r = remoteState.current;
      if (r.url === videoId && r.playing) {
        const ct = playerRef.current?.getCurrentTime?.() ?? 0;
        if (Math.abs(ct - r.t) > 2.5) {
          isApplying.current = true;
          playerRef.current?.seekTo(r.t, true);
          setTimeout(() => (isApplying.current = false), 400);
        }
      }
    }, 2500);
    return () => clearInterval(iv);
  }, [videoId]);

  function startYt() {
    const id = extractId(url);
    if (!id) return;
    remoteState.current = { url: id, playing: true, t: 0 };
    loadVideo(id);
  }

  return (
    <div className="h-full flex-1 w-full min-w-0 flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10">
        <div className="font-mono text-sm text-lime tracking-widest flex items-center gap-2 mr-auto">
          <MonitorPlay size={15} /> NOBAR // WATCH TOGETHER
        </div>
        {synced && mode === 'youtube' && <span className="text-[10px] font-mono text-lime animate-pulse">● SYNCED</span>}
        <div className="flex rounded-lg border border-white/10 p-0.5">
          {(['netflix', 'youtube'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setVideoId(null);
                setSynced(false);
              }}
              className={`px-3 py-1 text-[11px] font-mono rounded-md transition-colors ${
                mode === m ? 'bg-lime/20 text-lime' : 'text-slate-500 hover:text-white'
              }`}
            >
              {m === 'netflix' ? 'NETFLIX' : 'YOUTUBE SYNC'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'netflix' ? (
        <div className="flex-1 min-h-0 overflow-y-auto grid lg:grid-cols-[1fr,340px]">
          <div className="flex items-center justify-center p-4 lg:p-8">
            <div className="glass rounded-xl p-6 sm:p-8 w-full max-w-xl lg:max-w-3xl hud-corner">
              <div className="flex items-center gap-2 mb-2">
                <Clapperboard size={18} className="text-virus" />
                <div className="text-sm text-white font-semibold">Nobar Netflix — 100% legal</div>
              </div>
              <ol className="space-y-2 text-sm text-slate-300 mb-5 list-none">
                <li className="flex gap-2"><span className="text-lime font-mono">01</span> Setiap peserta pakai <b>akun Netflix miliknya sendiri</b> (login sendiri, biaya pribadi).</li>
                <li className="flex gap-2"><span className="text-lime font-mono">02</span> Buka Netflix di browser / aplikasi di perangkat masing-masing.</li>
                <li className="flex gap-2"><span className="text-lime font-mono">03</span> Pilih judul yang sama, lalu tekan <b>MULAI BERSAMA</b> di sini.</li>
                <li className="flex gap-2"><span className="text-lime font-mono">04</span> Hitung mundur 3-2-1 → semua pencet play di Netflix-nya sendiri barengan.</li>
              </ol>

              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <NeonButton variant="lime" className="flex-1" onClick={startTogether}>
                  <Timer size={15} /> MULAI BERSAMA
                </NeonButton>
                <NeonButton variant="ghost" className="flex-1" onClick={openNetflix}>
                  <ExternalLink size={15} /> BUKA NETFLIX
                </NeonButton>
              </div>

              {cdMsg && <div className="text-[11px] font-mono text-arc-lighter mb-2">↳ {cdMsg}</div>}

              {countdown !== null && (
                <motion.div
                  key={countdown}
                  initial={{ scale: 1.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-center py-3"
                >
                  <span className="text-5xl font-mono font-bold text-lime neon-text">
                    {countdown === 0 ? 'GO! ▶' : countdown}
                  </span>
                </motion.div>
              )}

              <div className="flex items-start gap-2 mt-2 text-[11px] text-slate-500 font-mono leading-relaxed">
                <LockNote />
                <span>
                  Kenapa nggak diputar langsung di sini? Netflix pakai DRM (hak cipta) — nggak ada cara legal buat
                  ikut mengontrol playernya. Jadi playback tetap 100% di akun & perangkat masing-masing, ini cara
                  nobar yang aman & legal.
                </span>
              </div>
            </div>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-white/10 p-4 space-y-3 overflow-y-auto">
            <div className="font-mono text-[11px] text-lime tracking-widest">PANDUAN PERANGKAT</div>
            <div className="text-xs text-slate-400 leading-relaxed space-y-2">
              <p><b className="text-white">HP / Tablet (Android, iOS):</b> install aplikasi Netflix dari Play Store / App Store, login akun sendiri, sambungkan perangkat ke TV kalau mau.</p>
              <p><b className="text-white">Laptop / PC:</b> buka <span className="text-lime font-mono">netflix.com</span> di browser (Chrome/Edge/Firefox), login akun sendiri.</p>
              <p><b className="text-white">Smart TV / TV Box:</b> pakai aplikasi Netflix bawaan TV. Ruang ini tetap dibuka di HP sebagai pengatur hitung mundur.</p>
              <p className="pt-2 text-slate-500">Satu akun Netflix bisa dipakai beberapa profil — tiap orang boleh profilnya sendiri, tapi tetap 1 langganan per rumah tangga. Nobar jarak jauh pakai akun masing-masing supaya legal.</p>
            </div>
          </aside>
        </div>
      ) : !videoId ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4 min-h-0">
          <div className="glass rounded-xl p-6 max-w-md w-full hud-corner">
            <div className="text-sm text-white font-medium mb-1">Ruang nobar sync YouTube</div>
            <p className="text-xs text-slate-500 font-mono mb-4">
              tempel link YouTube, semua yang buka ruang ini ikut nonton & sync otomatis.
            </p>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && startYt()}
              placeholder="https://youtube.com/watch?v=..."
              className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 focus:border-lime text-white text-sm mb-3"
            />
            <NeonButton variant="lime" className="w-full" onClick={startYt} disabled={!extractId(url)}>
              <Play size={15} /> PUTAR BERSAMA
            </NeonButton>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-black relative min-h-0">
          <div ref={containerRef} className="w-full aspect-video mx-auto max-w-[1920px] shrink-0" />
          <div className="flex-1 flex items-center justify-center p-3 gap-3">
            <button
              onClick={() => playerRef.current?.playVideo()}
              className="p-2.5 rounded-full bg-lime/15 border border-lime/40 text-lime hover:bg-lime/25"
            >
              <Play size={16} />
            </button>
            <button
              onClick={() => playerRef.current?.pauseVideo()}
              className="p-2.5 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20"
            >
              <Pause size={16} />
            </button>
            <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
              <Link2 size={11} /> kontrol otomatis sync ke semua yang nonton
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function LockNote() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0 text-lime">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
