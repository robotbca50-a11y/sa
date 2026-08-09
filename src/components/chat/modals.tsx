import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, EyeOff, KeyRound } from 'lucide-react';
import NeonButton from '../NeonButton';
import Avatar, { hashColor } from '../Avatar';
import type { User } from '../../types';
import { useStore } from '../../lib/store';
import { exportPrivateKeyB64 } from '../../lib/keystore';

export function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="glass hud-corner rounded-2xl p-6 w-full max-w-md max-h-[85vh] overflow-y-auto"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function NewChatModal({ users, meId, onPick, onClose }: { users: User[]; meId: string; onPick: (u: User) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = users.filter((u) => u.id !== meId && u.username.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono font-bold text-neon tracking-widest">// Pilih target</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-virus"><X size={18} /></button>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="cari username..."
        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-neon/60 text-white mb-3 text-sm"
      />
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {list.map((u) => (
          <button
            key={u.id}
            onClick={() => onPick(u)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Avatar id={u.id} name={u.username} size={38} />
            <span className="text-sm text-white">{u.username}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function NewGroupModal({ users, meId, onCreate, onClose }: { users: User[]; meId: string; onCreate: (name: string, memberIds: string[]) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const list = users.filter((u) => u.id !== meId && u.username.toLowerCase().includes(q.toLowerCase()));

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono font-bold text-arc-lighter tracking-widest" style={{ color: '#a78bfa' }}>// Grup baru</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-virus"><X size={18} /></button>
      </div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nama grup..."
        className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 focus:border-arc text-white mb-3"
      />
      <div className="flex items-center gap-1.5 flex-wrap mb-3 min-h-[30px]">
        {picked.length === 0 && <span className="text-xs text-slate-600 font-mono">pilih member...</span>}
        {picked.map((pid) => {
          const u = users.find((x) => x.id === pid);
          return (
            <button
              key={pid}
              onClick={() => setPicked((p) => p.filter((x) => x !== pid))}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-mono"
              style={{ background: hashColor(pid) + '22', color: hashColor(pid), border: `1px solid ${hashColor(pid)}55` }}
            >
              {u?.username} ✕
            </button>
          );
        })}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="cari member..."
        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-arc text-white mb-3 text-sm"
      />
      <div className="space-y-1 max-h-40 overflow-y-auto mb-4">
        {list.map((u) => (
          <button
            key={u.id}
            onClick={() => setPicked((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Avatar id={u.id} name={u.username} size={34} />
            <span className="text-sm text-white flex-1 text-left">{u.username}</span>
            <span
              className="w-4 h-4 rounded border flex items-center justify-center text-[10px]"
              style={{
                borderColor: picked.includes(u.id) ? '#a78bfa' : '#3b4252',
                background: picked.includes(u.id) ? '#a78bfa22' : 'transparent',
              }}
            >
              {picked.includes(u.id) ? '✓' : ''}
            </span>
          </button>
        ))}
      </div>
      <NeonButton
        variant="ghost"
        className="w-full"
        disabled={!name.trim() || picked.length === 0}
        onClick={() => onCreate(name.trim(), picked)}
      >
        <EyeOff size={14} /> Buat grup E2E
      </NeonButton>
    </Modal>
  );
}

export function AddMemberModal({ users, meId, existing, onAdd, onClose }: { users: User[]; meId: string; existing: string[]; onAdd: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = users.filter((u) => u.id !== meId && !existing.includes(u.id) && u.username.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono font-bold text-lime tracking-widest">// Tambah member</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-virus"><X size={18} /></button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="cari..."
        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-lime text-white mb-3 text-sm"
      />
      <div className="space-y-1">
        {list.map((u) => (
          <button
            key={u.id}
            onClick={() => { onAdd(u.id); onClose(); }}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <Avatar id={u.id} name={u.username} size={34} />
            <span className="text-sm text-white">{u.username}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function GhostSettingsModal({ onClose }: { onClose: () => void }) {
  const ghost = useStore((s) => s.ghostMode);
  const interval = useStore((s) => s.ghostInterval);
  const toggle = useStore((s) => s.toggleGhost);
  const setInt = useStore((s) => s.setGhostInterval);
  const me = useStore((s) => s.me);
  const [expKey, setExpKey] = useState('');
  const [expMsg, setExpMsg] = useState('');

  async function doExport() {
    setExpMsg('');
    try {
      const b64 = await exportPrivateKeyB64(me?.username ?? '');
      setExpKey(b64);
      try {
        await navigator.clipboard.writeText(b64);
        setExpMsg('Kunci sudah disalin ke clipboard. Pindahkan ke device lain → tab login → Impor Kunci.');
      } catch {
        setExpMsg('Kunci tampil di bawah — salin manual. Pindahkan ke device lain → Impor Kunci.');
      }
    } catch (e) {
      setExpMsg(e instanceof Error ? e.message : 'Gagal ekspor kunci.');
    }
  }

  return (
    <Modal onClose={onClose}>
      <h3 className="font-mono font-bold text-neon tracking-widest mb-4 flex items-center gap-2">
        <EyeOff size={16} /> GHOST MODE
      </h3>
      <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/10 mb-3">
        <div>
          <div className="text-sm text-white font-medium">Aktifkan Ghost Mode</div>
          <div className="text-xs text-slate-500">Nama kamu tampil sebagai hash acak yang berputar terus.</div>
        </div>
        <button
          onClick={toggle}
          className={`w-12 h-7 rounded-full transition-colors ${ghost ? 'bg-neon/60' : 'bg-white/10'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${ghost ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>
      <div className="text-xs font-mono text-slate-400 mb-2">Rotasi handle setiap</div>
      <div className="flex gap-2 mb-4">
        {[5, 15, 30, 60].map((n) => (
          <button
            key={n}
            onClick={() => setInt(n)}
            className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-colors ${
              interval === n ? 'bg-neon/20 border-neon/50 text-neon' : 'border-white/10 text-slate-400 hover:border-neon/40'
            }`}
          >
            {n}s
          </button>
        ))}
      </div>

      <div className="border-t border-white/10 pt-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-white font-medium flex items-center gap-1.5">
              <KeyRound size={14} className="text-neon" /> Login di device lain (kayak WA)
            </div>
            <div className="text-[11px] text-slate-500">Ekspor kunci E2E ini, impor di device tujuan sebelum login.</div>
          </div>
          <button
            onClick={doExport}
            className="px-3 py-1.5 rounded-lg bg-neon/15 border border-neon/50 text-neon text-xs font-mono hover:bg-neon/25"
          >
            EKSPOR KUNCI
          </button>
        </div>
        {expKey && (
          <textarea
            readOnly
            value={expKey}
            rows={2}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full px-3 py-2 rounded-lg bg-black/50 border border-neon/40 text-neon text-[10px] font-mono resize-none mb-1"
          />
        )}
        {expMsg && <div className="text-[11px] font-mono text-lime">{expMsg}</div>}
      </div>

      <NeonButton variant="ghost" className="w-full" onClick={onClose}>SIMPAN & TUTUP</NeonButton>
    </Modal>
  );
}
