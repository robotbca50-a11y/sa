import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Lock, Zap, Image, Users, Clapperboard, Phone, MapPin, Shield, Radio,
} from 'lucide-react';
import CyberCanvas from '../components/CyberCanvas';
import Glitch, { TypeWriter } from '../components/Glitch';
import NeonButton from '../components/NeonButton';
import { useStore } from '../lib/store';

const FEATURES = [
  { icon: Lock, t: 'E2E ENCRYPTION', d: 'ECDH + AES-256-GCM di browser. Server hanya lihat ciphertext.', c: '#00f0ff' },
  { icon: Zap, t: 'REALTIME', d: 'Pesan, typing, presence. Nol delay via Supabase Realtime.', c: '#b6ff2e' },
  { icon: Image, t: 'MEDIA EKSTRIM', d: 'Foto, video, GIF autoplay. Paste langsung Ctrl+V.', c: '#ff2ea6' },
  { icon: Users, t: 'DM + GRUP', d: 'One-on-one privat + grup dengan group-key E2E.', c: '#7c3aed' },
  { icon: Clapperboard, t: 'STORY 24 JAM', d: 'Status ala WA, lenyap otomatis setelah 24 jam.', c: '#ff9f43' },
  { icon: Phone, t: 'VIDEO CALL', d: 'WebRTC 1-on-1 + ruang NOBAR bareng.', c: '#54a0ff' },
  { icon: MapPin, t: 'SAFETY TRACE', d: 'Lokasi realtime (opsional) buat darurat, ada link Google Maps.', c: '#1dd1a1' },
  { icon: Radio, t: 'GHOST MODE', d: 'Handle kamu diacak cryptographically, anti-dobol.', c: '#f368e0' },
];

function TiltCard({ children, color }: { children: React.ReactNode; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ x: 0, y: 0 });
  return (
    <div
      ref={ref}
      className="tilt"
      style={{
        transform: `perspective(900px) rotateX(${t.y}deg) rotateY(${t.x}deg)`,
      }}
      onMouseMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        setT({ x: ((e.clientX - r.left) / r.width - 0.5) * 14, y: ((e.clientY - r.top) / r.height - 0.5) * -14 });
      }}
      onMouseLeave={() => setT({ x: 0, y: 0 })}
    >
      <div
        className="glass rounded-xl p-5 h-full hud-corner relative overflow-hidden"
        style={{ borderColor: `${color}44` }}
      >
        <div
          className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-25"
          style={{ background: `radial-gradient(circle, ${color}, transparent 70%)` }}
        />
        {children}
      </div>
    </div>
  );
}

export default function Landing() {
  const setView = useStore((s) => s.setView);
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] });
  const yBg = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <div className="relative min-h-dvh overflow-hidden scanlines w-full" style={{ width: '100vw', maxWidth: '100%' }}>
      <CyberCanvas />
      <div className="grid-floor absolute inset-0 z-0" />

      {/* NAV */}
      <nav className="relative z-40 flex items-center justify-between px-5 sm:px-10 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 font-mono">
          <span className="w-3 h-3 rounded-full bg-neon animate-pulseglow" />
          <span className="text-neon font-bold tracking-widest">NEXUS</span>
          <span className="text-slate-500 text-xs">v2.0</span>
        </div>
        <div className="flex items-center gap-3">
          <NeonButton small onClick={() => setView('auth')}>
            MASUK
          </NeonButton>
        </div>
      </nav>

      {/* HERO */}
      <div ref={hero} className="relative z-30 max-w-7xl mx-auto px-5 sm:px-10 pt-16 pb-10">
        <motion.div style={{ y: yBg, opacity }} className="text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass font-mono text-xs text-neon mb-8"
          >
            <Shield size={13} /> PROTOKOL: END-TO-END // GHOST NETWORK
          </motion.div>

          <h1 className="font-display font-bold text-5xl sm:text-7xl md:text-8xl leading-none">
            <Glitch text="NEXUS" className="neon-text" />
            <br />
            <span className="virus-text">// SYNC INTO</span>{' '}
            <span className="text-lime" style={{ textShadow: '0 0 20px rgba(182,255,46,.5)' }}>
              THE DARK
            </span>
          </h1>

          <div className="mt-6 font-mono text-slate-400 text-sm sm:text-lg min-h-[1.6em]">
            <TypeWriter
              text="> obrolan rahasia, media autoplay, story 24 jam, reels, nobar, video call... semua terkunci E2E."
              speed={24}
            />
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <NeonButton onClick={() => setView('auth')}>
              <Zap size={16} /> ENTER THE GRID
            </NeonButton>
          </div>

          <div className="mt-12 flex justify-center gap-6 font-mono text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-lime animate-pulse" /> AES-256-GCM</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-neon animate-pulse" /> REALTIME</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-virus animate-pulse" /> 24/7</span>
          </div>
        </motion.div>

        {/* FEATURE GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-20 pb-4">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.t}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
            >
              <TiltCard color={f.c}>
                <f.icon size={26} style={{ color: f.c }} />
                <div className="mt-3 font-mono text-sm font-bold tracking-wider" style={{ color: f.c }}>
                  {f.t}
                </div>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{f.d}</p>
              </TiltCard>
            </motion.div>
          ))}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="relative z-30 border-t border-white/10 py-6 text-center font-mono text-xs text-slate-500">
        NEXUS // chat terenkripsi — pesan kamu, kunci kamu. <span className="text-neon">Server bodoh.</span>
      </footer>
    </div>
  );
}
