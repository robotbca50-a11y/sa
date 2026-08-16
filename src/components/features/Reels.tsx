/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, Trash2, Link2, Music, Heart } from 'lucide-react';
import { rpcAddReel, rpcGetReels, rpcDeleteReel, uploadMedia } from '../../lib/api';
import { useMediaSrc } from '../../lib/useMediaSrc';
import { useStore } from '../../lib/store';
import NeonButton from '../NeonButton';
import type { Reel } from '../../types';

function tiktokEmbed(url: string) {
  const m = url.match(/video\/(\d+)/);
  const id = m ? m[1] : null;
  if (!id) return null;
  return { id, src: `https://www.tiktok.com/embed/v2/${id}?autoplay=1&muted=1` };
}

export default function Reels() {
  const me = useStore((s) => s.me);
  const [reels, setReels] = useState<Reel[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    rpcGetReels().then(setReels).catch(() => {});
  }, []);

  async function addTikTok() {
    const u = url.trim();
    if (!tiktokEmbed(u)) return;
    await rpcAddReel({ userId: me!.id, source: 'tiktok', tiktokUrl: u, caption: '' });
    setUrl('');
    setShowAdd(false);
    rpcGetReels().then(setReels).catch(() => {});
  }

  async function addUpload(file: File) {
    const path = `reels/${crypto.randomUUID()}`;
    await uploadMedia('chat-media', path, file, me!.id);
    await rpcAddReel({ userId: me!.id, source: 'upload', mediaPath: path, caption: '' });
    setShowAdd(false);
    rpcGetReels().then(setReels).catch(() => {});
  }

  return (
    <div className="h-full flex-1 w-full min-w-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="font-mono text-sm text-virus tracking-widest flex items-center gap-2">
          <Music size={15} /> REELS // FOR YOU
        </div>
        <NeonButton variant="danger" small onClick={() => setShowAdd((v) => !v)}>
          <Upload size={13} /> Upload
        </NeonButton>
      </div>

      {showAdd && (
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="tempel link TikTok... (https://tiktok.com/@x/video/123)"
              className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-virus text-white text-sm"
            />
            <NeonButton small variant="danger" onClick={addTikTok} disabled={!tiktokEmbed(url)}>
              <Link2 size={13} /> Embed
            </NeonButton>
          </div>
          <div className="text-center text-xs text-slate-600 font-mono">— atau —</div>
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full py-3 rounded-xl border-2 border-dashed border-virus/40 text-virus text-sm font-mono hover:bg-virus/10 transition-colors"
          >
            <Upload size={16} className="inline mr-2" /> Upload video kamu sendiri
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addUpload(f);
              e.target.value = '';
            }}
          />
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto snap-y snap-mandatory lg:snap-none lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-4 lg:p-4 lg:content-start lg:overflow-y-auto">
        {reels.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <div className="text-4xl mb-3">🎬</div>
            <div className="font-mono text-sm">Belum ada reels. Upload atau tempel link TikTok.</div>
          </div>
        )}
        {reels.map((r) => (
          <ReelCard key={r.id} reel={r} onDelete={async () => {
            if (r.user_id !== me?.id) return;
            await rpcDeleteReel(r.id, me.id);
            rpcGetReels().then(setReels).catch(() => {});
          }} />
        ))}
      </div>
    </div>
  );
}

function ReelCard({ reel, onDelete }: { reel: Reel; onDelete: () => void }) {
  const me = useStore((s) => s.me);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const reelSrc = useMediaSrc('chat-media', reel.media_path);
  const embed = reel.source === 'tiktok' ? tiktokEmbed(reel.tiktok_url ?? '') : null;

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const tryPlay = () => {
      const v = videoRef.current;
      if (!v) return;
      v.play().catch(() => {
        if (v.readyState >= 2) return;
        v.addEventListener('loadeddata', () => v.play().catch(() => {}), { once: true });
      });
    };
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            if (embed) {
              const ifr = el.querySelector('iframe');
              if (ifr && ifr.src) {
                ifr.src = ifr.src.split('autoplay=0').join('autoplay=1');
              }
            }
            tryPlay();
          } else {
            videoRef.current?.pause();
          }
        });
      },
      { threshold: 0.4 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [embed]);

  return (
    <div
      ref={cardRef}
      className="h-full snap-start flex items-center justify-center relative lg:h-[70vh] lg:min-h-[520px] lg:rounded-2xl lg:border lg:border-white/10 lg:overflow-hidden lg:bg-black/30"
    >
      <div className="relative w-full max-w-[420px] lg:max-w-none h-full flex items-center justify-center px-4">
        {embed ? (
          <div className="w-full h-[80%] lg:h-full">
            <iframe
              src={embed.src}
              className="w-full h-full rounded-xl lg:rounded-none border-0"
              loading="lazy"
              title="tiktok"
            />
          </div>
        ) : reel.media_path ? (
          <video
            ref={videoRef}
            src={reelSrc}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            onLoadedData={() => videoRef.current?.play().catch(() => {})}
            className="max-h-[78%] max-w-full rounded-xl lg:rounded-none lg:max-h-full lg:h-full lg:w-full lg:object-contain bg-black"
          />
        ) : null}

        <div className="absolute bottom-16 left-5 right-5 flex items-center gap-2">
          <div className="flex-1 text-sm text-white/90 drop-shadow">
            @{reel.username}
            {reel.caption && <div className="text-xs text-white/60 truncate">{reel.caption}</div>}
          </div>
          <button className="p-2 rounded-full bg-white/10 text-virus" title="like">
            <Heart size={18} />
          </button>
          {reel.user_id === me?.id && (
            <button onClick={onDelete} className="p-2 rounded-full bg-white/10 text-white/60 hover:text-virus">
              <Trash2 size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
