import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ShieldCheck, Users, MapPin, ScrollText, Check, X, LogOut, ArrowLeft, Trash2, Power } from 'lucide-react';
import { useStore } from '../lib/store';
import {
  rpcPendingUsers, rpcSetUserStatus, rpcAllLocations, rpcAccessLogs, rpcUserStats,
  rpcAllUsers, rpcDeleteUser, rpcPurgeAllUsers, rpcListBlackouts, rpcSetBlackout,
} from '../lib/api';
import { sendBlackout } from '../lib/realtime';
import NeonButton from '../components/NeonButton';
import CyberCanvas from '../components/CyberCanvas';
import type { AccessLog, LocRow, User } from '../types';

function gmLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export default function Admin() {
  const setView = useStore((s) => s.setView);
  const [logged, setLogged] = useState(!!sessionStorage.getItem('nexus:master'));
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'approve' | 'map' | 'logs' | 'users'>('approve');
  const [pending, setPending] = useState<User[]>([]);
  const [locs, setLocs] = useState<LocRow[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [blackouts, setBlackouts] = useState<string[]>([]);
  const [stats, setStats] = useState<{ total: number; pending: number; online: number; today: number }>({ total: 0, pending: 0, online: 0, today: 0 });
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});

  const cred = () => JSON.parse(sessionStorage.getItem('nexus:master') ?? '{}');

  async function login() {
    setErr('');
    try {
      await rpcPendingUsers(u.trim(), p);
      sessionStorage.setItem('nexus:master', JSON.stringify({ u: u.trim(), p }));
      setLogged(true);
      refreshAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  // Jeda kecil antar panggilan biar tidak membebani rate limit.
  const pause = (ms = 250) => new Promise((r) => setTimeout(r, ms));

  async function refreshAll() {
    const c = cred();
    try {
      const pend = await rpcPendingUsers(c.u, c.p);
      setPending(pend);
      await pause();
      const loc = await rpcAllLocations(c.u, c.p);
      setLocs(loc);
      drawMap(loc);
      await pause();
      const lg = await rpcAccessLogs(c.u, c.p);
      setLogs(lg);
      await pause();
      const st = await rpcUserStats(c.u, c.p);
      setStats(st);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLogged(false);
    }
    try {
      const all = await rpcAllUsers(c.u, c.p);
      setAllUsers(all);
      await pause();
      try {
        const bl = await rpcListBlackouts(c.u, c.p);
        setBlackouts(bl.map((b) => b.target_user_id));
      } catch {
        /* versi lama tanpa kill screen */
      }
      setErr('');
    } catch (e) {
      setAllUsers([]);
      if (!/function|was not found/i.test(e instanceof Error ? e.message : String(e))) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    }
  }

  function drawMap(rows: LocRow[]) {
    if (!mapRef.current) return;
    if (!leafletRef.current) {
      leafletRef.current = L.map(mapRef.current).setView([-2.5, 118], 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
      }).addTo(leafletRef.current);
    }
    const seen: Record<string, boolean> = {};
    rows.forEach((r) => {
      seen[r.user_id] = true;
      const icon = L.divIcon({
        html: `<div style="width:22px;height:22px;border-radius:50%;background:#00f0ff;border:3px solid #0b0f1a;box-shadow:0 0 14px #00f0ff;display:flex;align-items:center;justify-content:center;font-size:10px;">📍</div>`,
        className: '',
      });
      if (markersRef.current[r.user_id]) {
        markersRef.current[r.user_id].setLatLng([r.lat, r.lng]);
      } else {
        const m = L.marker([r.lat, r.lng], { icon })
          .addTo(leafletRef.current!)
          .bindPopup(
            `<b>${r.username ?? r.user_id}</b><br/>lat ${r.lat.toFixed(4)}, lng ${r.lng.toFixed(4)}<br/><a href="${gmLink(r.lat, r.lng)}" target="_blank">Buka di Google Maps</a>`,
          );
        markersRef.current[r.user_id] = m;
      }
    });
    Object.keys(markersRef.current).forEach((id) => {
      if (!seen[id]) {
        markersRef.current[id].remove();
        delete markersRef.current[id];
      }
    });
    if (rows.length > 0 && rows.length <= 3) {
      leafletRef.current.setView([rows[0].lat, rows[0].lng], 12);
    }
  }

  useEffect(() => {
    if (!logged) return;
    refreshAll();
    const iv = setInterval(refreshAll, 30000);
    const presence = supabase
      .channel('nexus-presence')
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState();
        setStats((s) => ({ ...s, online: Object.keys(state).length }));
      })
      .subscribe();
    return () => {
      clearInterval(iv);
      presence.unsubscribe();
      leafletRef.current?.remove();
      leafletRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logged]);

  async function acc(id: string, status: 'approved' | 'rejected') {
    const c = cred();
    await rpcSetUserStatus(c.u, c.p, id, status);
    refreshAll();
  }

  async function delUser(id: string, username: string) {
    if (!window.confirm(`HAPUS permanen user "${username}"?\nSemua data mereka (chat, kunci, riwayat) akan dihapus.`)) return;
    setErr('');
    try {
      const c = cred();
      await rpcDeleteUser(c.u, c.p, id);
      refreshAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function purgeAll() {
    if (!window.confirm('HAPUS SEMUA user kecuali master?\nSemua akun, chat, media, story, reels, dan riwayat akan dihapus PERMANEN. Aksi ini tidak bisa dibatalkan!')) return;
    setErr('');
    try {
      const c = cred();
      await rpcPurgeAllUsers(c.u, c.p);
      refreshAll();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function toggleBlackout(id: string, active: boolean) {
    const c = cred();
    setErr('');
    try {
      await rpcSetBlackout(c.u, c.p, id, active);
      setBlackouts((prev) => (active ? [...prev, id] : prev.filter((x) => x !== id)));
      sendBlackout({ target_user_id: id, active });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  function logout() {
    sessionStorage.removeItem('nexus:master');
    setLogged(false);
    setView('landing');
  }

  if (!logged) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4 scanlines overflow-hidden">
        <CyberCanvas density={50} />
        <div className="grid-floor absolute inset-0" />
        <button className="absolute top-5 left-5 z-30 font-mono text-xs text-slate-500 hover:text-neon" onClick={() => setView('landing')}>
          ← KEMBALI
        </button>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass hud-corner rounded-2xl p-8 w-full max-w-md relative z-20"
        >
          <div className="flex items-center gap-2 mb-6">
            <ShieldCheck size={20} className="text-lime" />
            <h2 className="font-mono font-bold tracking-widest text-lime">// MASTER OVERRIDE</h2>
          </div>
          <input value={u} onChange={(e) => setU(e.target.value)} placeholder="Username master"
            className="w-full px-4 py-3 rounded-lg bg-black/50 border border-white/10 text-white mb-3 focus:border-lime" />
          <input value={p} onChange={(e) => setP(e.target.value)} type="password" placeholder="Password master"
            onKeyDown={(e) => e.key === 'Enter' && login()}
            className="w-full px-4 py-3 rounded-lg bg-black/50 border border-white/10 text-white mb-4 focus:border-lime" />
          {err && <div className="mb-3 text-xs font-mono text-virus bg-virus/10 border border-virus/30 rounded-lg px-3 py-2">{err}</div>}
          <NeonButton variant="lime" className="w-full" onClick={login}>
            <ShieldCheck size={16} /> AKSES PANEL
          </NeonButton>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen scanlines">
      <CyberCanvas density={30} />
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-5">
        <header className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="flex items-center gap-2 font-mono">
            <ShieldCheck size={20} className="text-lime" />
            <span className="text-lime font-bold tracking-widest">NEXUS // MASTER CONSOLE</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[11px] font-mono text-slate-400 hidden sm:block">
              online: <span className="text-lime">{stats.online}</span> • total: <span className="text-neon">{stats.total}</span> • pending: <span className="text-virus">{stats.pending}</span>
            </div>
            <button onClick={() => setView('app')} className="p-2 rounded-lg text-slate-400 hover:text-neon border border-white/10" title="Kembali ke app">
              <ArrowLeft size={16} />
            </button>
            <button onClick={logout} className="p-2 rounded-lg text-slate-400 hover:text-virus border border-white/10" title="Keluar">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <div className="flex gap-2 mb-4">
          {([
            { id: 'approve', label: `ACC USER (${pending.length})`, icon: Users },
            { id: 'users', label: `USERS (${allUsers.length})`, icon: ShieldCheck },
            { id: 'map', label: `LIVE MAP (${locs.length})`, icon: MapPin },
            { id: 'logs', label: 'ACCESS LOG', icon: ScrollText },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs tracking-wider border transition-colors ${
                tab === t.id ? 'bg-neon/10 border-neon/50 text-neon' : 'border-white/10 text-slate-400 hover:text-white'
              }`}
            >
              <t.icon size={14} /> <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'approve' && (
          <div className="space-y-2">
            {pending.length === 0 && <div className="glass rounded-xl p-6 text-center font-mono text-sm text-slate-500">Tidak ada user menunggu ACC.</div>}
            {pending.map((u) => (
              <div key={u.id} className="glass rounded-xl p-4 flex items-center gap-3 flex-wrap">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm"
                  style={{ background: '#00f0ff22', color: '#00f0ff', border: '1px solid #00f0ff55' }}
                >
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-[120px]">
                  <div className="text-white font-medium">{u.username}</div>
                  <div className="font-mono text-[11px] text-slate-500">daftar: {new Date(u.created_at!).toLocaleString('id-ID')}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acc(u.id, 'approved')} className="px-3 py-1.5 rounded-lg bg-lime/15 border border-lime/40 text-lime text-xs font-mono hover:bg-lime/25">
                    <Check size={14} className="inline mr-1" />ACC
                  </button>
                  <button onClick={() => acc(u.id, 'rejected')} className="px-3 py-1.5 rounded-lg bg-virus/15 border border-virus/40 text-virus text-xs font-mono hover:bg-virus/25">
                    <X size={14} className="inline mr-1" />TOLAK
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'users' && (
          <div className="space-y-2">
            {err && <div className="mb-3 text-xs font-mono text-virus bg-virus/10 border border-virus/30 rounded-lg px-3 py-2">{err}</div>}
            <div className="flex justify-end mb-2">
              <button
                onClick={purgeAll}
                className="px-3 py-1.5 rounded-lg bg-virus/20 border border-virus/50 text-virus text-xs font-mono hover:bg-virus/35"
              >
                <Trash2 size={14} className="inline mr-1" />HAPUS SEMUA USER (kecuali master)
              </button>
            </div>
            {allUsers.length === 0 && <div className="glass rounded-xl p-6 text-center font-mono text-sm text-slate-500">Belum ada user.</div>}
            {allUsers.map((u) => (
              <div key={u.id} className="glass rounded-xl p-4 flex items-center gap-3 flex-wrap">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-mono font-bold text-sm"
                  style={{ background: '#00f0ff22', color: '#00f0ff', border: '1px solid #00f0ff55' }}
                >
                  {u.username.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-[140px]">
                  <div className="text-white font-medium">{u.username}</div>
                  <div className="font-mono text-[11px] text-slate-500 truncate max-w-[420px]">{u.id}</div>
                  <div className="font-mono text-[11px]">
                    <span className={u.status === 'approved' ? 'text-lime' : 'text-virus'}>{u.status}</span>
                    <span className="text-slate-600"> • daftar: {new Date(u.created_at!).toLocaleString('id-ID')}</span>
                    {blackouts.includes(u.id) && <span className="text-virus ml-2 animate-pulse">● LAYAR HITAM</span>}
                  </div>
                </div>
                <button
                  onClick={() => toggleBlackout(u.id, !blackouts.includes(u.id))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    blackouts.includes(u.id)
                      ? 'bg-lime/15 border-lime/40 text-lime hover:bg-lime/25'
                      : 'bg-virus/15 border-virus/40 text-virus hover:bg-virus/25'
                  }`}
                  title={blackouts.includes(u.id) ? 'Kembalikan layar (OFF)' : 'Matikan layar user (hitam penuh)'}
                >
                  <Power size={14} className="inline mr-1" />
                  {blackouts.includes(u.id) ? 'HIDUPKAN' : 'MATIKAN'}
                </button>
                <button
                  onClick={() => delUser(u.id, u.username)}
                  className="px-3 py-1.5 rounded-lg bg-virus/15 border border-virus/40 text-virus text-xs font-mono hover:bg-virus/25"
                >
                  <Trash2 size={14} className="inline mr-1" />HAPUS
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === 'map' && (
          <div className="glass rounded-xl p-3">
            <div className="mb-2 flex items-center justify-between flex-wrap gap-2">
              <span className="font-mono text-xs text-neon tracking-widest">LOKASI REALTIME</span>
              <span className="font-mono text-[10px] text-slate-500">refresh otomatis 30 detik + realtime</span>
            </div>
            <div ref={mapRef} className="w-full h-[420px] rounded-lg overflow-hidden bg-black/40" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {locs.map((l) => (
                <a
                  key={l.user_id}
                  href={gmLink(l.lat, l.lng)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 p-2 rounded-lg bg-black/30 border border-white/10 hover:border-neon/50 transition-colors"
                >
                  <MapPin size={15} className="text-virus shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs text-white truncate">{l.username ?? l.user_id}</div>
                    <div className="font-mono text-[10px] text-slate-500">{l.lat.toFixed(4)}, {l.lng.toFixed(4)}</div>
                  </div>
                  <span className="ml-auto font-mono text-[10px] text-lime shrink-0">MAPS ↗</span>
                </a>
              ))}
              {locs.length === 0 && <div className="font-mono text-xs text-slate-600">Belum ada user berbagi lokasi.</div>}
            </div>
          </div>
        )}

        {tab === 'logs' && (
          <div className="glass rounded-xl overflow-hidden">
            <div className="p-3 font-mono text-xs text-neon tracking-widest border-b border-white/10">RIWAYAT AKSES</div>
            <div className="max-h-[420px] overflow-y-auto">
              {logs.length === 0 && <div className="p-4 font-mono text-xs text-slate-600">Belum ada log.</div>}
              {logs.map((l) => (
                <div key={l.id} className="flex items-center gap-3 px-4 py-2 border-b border-white/5 font-mono text-xs">
                  <span
                    className={`w-2 h-2 rounded-full ${l.event === 'login' ? 'bg-lime' : l.event === 'logout' ? 'bg-virus' : 'bg-neon'}`}
                  />
                  <span className="text-white">{l.username ?? l.user_id.slice(0, 8)}</span>
                  <span className="text-slate-400">{l.event}</span>
                  <span className="text-slate-600 truncate flex-1">{l.ip ?? '—'}</span>
                  <span className="text-slate-500 shrink-0">{new Date(l.created_at).toLocaleTimeString('id-ID')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { supabase } from '../lib/supabase';
