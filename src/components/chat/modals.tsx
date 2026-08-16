/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, EyeOff, KeyRound, Lock, ShieldAlert } from 'lucide-react';
import NeonButton from '../NeonButton';
import Avatar, { hashColor, avatarUrl } from '../Avatar';
import type { User } from '../../types';
import { useStore } from '../../lib/store';
import { exportPrivateKeyB64, savePrivateKey } from '../../lib/keystore';
import { derivePasswordKey, setPasswordKey, getPasswordKey, decryptText, encryptText } from '../../lib/crypto';
import { saveSession } from '../../lib/session';
import { antiSadapEnabled, setAntiSadap } from '../AntiSadapOverlay';
import { getLockPin, setLockPin, getLockTimeout, setLockTimeout, lockNow } from '../../lib/lock';
import { rpcKillMySessions } from '../../lib/api';
import { appNotify } from '../../lib/notify';

const GRK = (id: string) => `grp:${id}`;

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
            <Avatar id={u.id} name={u.username} size={38} src={avatarUrl(u.avatar)} />
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
            <Avatar id={u.id} name={u.username} size={34} src={avatarUrl(u.avatar)} />
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
            <Avatar id={u.id} name={u.username} size={34} src={avatarUrl(u.avatar)} />
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
  const [antiSadap, setAntiSadapState] = useState(antiSadapEnabled());
  const [pinInput, setPinInput] = useState('');
  const [lockReload, setLockReload] = useState(0);
  const lockTimeout = getLockTimeout();
  void lockReload;

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

      <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-white/10 mb-4">
        <div>
          <div className="text-sm text-white font-medium">Anti-Sadap</div>
          <div className="text-xs text-slate-500">Layar langsung hitam saat app di-blur/background — isi chat tak terbaca dari app switcher.</div>
        </div>
        <button
          onClick={() => {
            const next = !antiSadapEnabled();
            setAntiSadap(next);
            setAntiSadapState(next);
          }}
          className={`w-12 h-7 rounded-full transition-colors ${antiSadap ? 'bg-lime/60' : 'bg-white/10'}`}
        >
          <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${antiSadap ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
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

      <div className="border-t border-white/10 pt-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-white font-medium flex items-center gap-1.5">
              <Lock size={14} className="text-neon" /> Auto-Lock App
            </div>
            <div className="text-[11px] text-slate-500">App terkunci otomatis setelah ditinggal. Kunci E2E tetap aman di dalam.</div>
          </div>
          {getLockPin() && (
            <button
              onClick={() => {
                setLockPin(null);
                setLockTimeout(0);
                setLockReload((v) => v + 1);
              }}
              className="px-3 py-1.5 rounded-lg bg-virus/15 border border-virus/40 text-virus text-xs font-mono hover:bg-virus/25"
            >
              MATIKAN PIN
            </button>
          )}
        </div>
        <div className="flex gap-2 mb-2">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder={getLockPin() ? 'PIN lama/baru (4 digit)' : 'Buat PIN (4 digit)'}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/50 border border-white/10 focus:border-neon/60 text-white text-sm tracking-widest placeholder-slate-500"
          />
          <button
            onClick={() => {
              if (pinInput.length === 4) {
                setLockPin(pinInput);
                setPinInput('');
                setLockReload((v) => v + 1);
              }
            }}
            disabled={pinInput.length !== 4}
            className="px-3 py-2 rounded-lg bg-neon/15 border border-neon/50 text-neon text-xs font-mono hover:bg-neon/25 disabled:opacity-30"
          >
            SIMPAN PIN
          </button>
        </div>
        <div className="text-xs font-mono text-slate-400 mb-2">Kunci otomatis setelah</div>
        <div className="flex gap-2">
          {[
            { v: 0, l: 'OFF' },
            { v: 15, l: '15 dtk' },
            { v: 60, l: '1 mnt' },
            { v: 300, l: '5 mnt' },
          ].map((o) => (
            <button
              key={o.v}
              onClick={() => {
                setLockTimeout(o.v);
                if (o.v > 0 && getLockPin()) lockNow();
                setLockReload((v) => v + 1);
              }}
              className={`flex-1 py-2 rounded-lg text-xs font-mono border transition-colors ${
                lockTimeout === o.v ? 'bg-neon/20 border-neon/50 text-neon' : 'border-white/10 text-slate-400 hover:border-neon/40'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10 pt-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-white font-medium flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-virus" /> Kill Switch
            </div>
            <div className="text-[11px] text-slate-500">Logout semua device lain dari jarak jauh (mis. HP hilang). Device ini tetap login.</div>
          </div>
          <button
            onClick={async () => {
              if (!window.confirm('KILL SWITCH?\nSemua device lain akan logout. Lanjut?')) return;
              try {
                const n = await rpcKillMySessions();
                appNotify('KILL SWITCH AKTIF', n > 0 ? `${n} sesi lain di-logout.` : 'Tidak ada sesi lain ditemukan.', { icon: '🛡️' });
              } catch (e) {
                appNotify('GAGAL', e instanceof Error ? e.message : String(e), { icon: '⚠️' });
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-virus/15 border border-virus/40 text-virus text-xs font-mono hover:bg-virus/25 shrink-0"
          >
            LOGOUT SEMUA DEVICE
          </button>
        </div>
      </div>

      <NeonButton variant="ghost" className="w-full" onClick={onClose}>SIMPAN & TUTUP</NeonButton>
    </Modal>
  );
}

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const me = useStore((s) => s.me);
  const privateKey = useStore((s) => s.privateKey);
  const patchMe = useStore((s) => s.patchMe);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [newName, setNewName] = useState(me?.username ?? '');
  const [pass, setPass] = useState('');

  async function changeUsername() {
    setMsg('');
    const name = newName.trim();
    if (!me) return;
    if (name.length < 2) {
      setMsg('Username minimal 2 karakter.');
      return;
    }
    if (name === me.username) {
      setMsg('Username masih sama dengan sekarang.');
      return;
    }
    if (pass.length < 4) {
      setMsg('Masukkan password akun untuk mengunci perubahan.');
      return;
    }
    setBusy(true);
    try {
      const { rpcUpdateUsername } = await import('../../lib/api');
      const oldPkey = getPasswordKey();
      await rpcUpdateUsername(name);
      if (!privateKey) throw new Error('Kunci E2E tidak tersedia di device ini.');
      await savePrivateKey(privateKey, name);
      await savePrivateKey(privateKey, me.id);
      const newPkey = await derivePasswordKey(pass, name);
      setPasswordKey(newPkey);
      if (oldPkey) {
        try {
          const { rpcMyGroups, rpcGetGroupKeyBackup, rpcSaveGroupKeyBackup } = await import('../../lib/api');
          const groups = await rpcMyGroups(me.id).catch(() => []);
          for (const g of groups) {
            const bk = await rpcGetGroupKeyBackup(g.id).catch(() => null);
            if (!bk) continue;
            const raw = await decryptText(oldPkey, bk.enc_key, bk.iv);
            const enc = await encryptText(newPkey, raw);
            await rpcSaveGroupKeyBackup(g.id, enc.ciphertext, enc.iv).catch(() => {});
          }
        } catch {
        }
      }
      const updated = { ...me, username: name, avatar: me.avatar ?? null };
      saveSession(updated);
      patchMe({ username: name });
      setMsg('Username diperbarui.');
      onClose();
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal ganti username.');
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    setMsg('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMsg('Hanya file gambar.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMsg('Foto profil maksimal 5 MB.');
      return;
    }
    if (!me) return;
    setBusy(true);
    try {
      const { uploadAvatar, rpcSetAvatar } = await import('../../lib/api');
      const path = await uploadAvatar(me.id, file);
      await rpcSetAvatar(path);
      const avatar = `avatars/${path}`;
      patchMe({ avatar });
      saveSession({ ...me, avatar });
      setMsg('Foto profil diperbarui.');
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal upload foto profil.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!me) return;
    setBusy(true);
    try {
      const { rpcSetAvatar } = await import('../../lib/api');
      await rpcSetAvatar(null);
      patchMe({ avatar: null });
      saveSession({ ...me, avatar: null });
      setMsg('Foto profil dihapus.');
      onClose();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal hapus foto profil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-mono font-bold text-neon tracking-widest">// Profil</h3>
        <button onClick={onClose} className="text-slate-500 hover:text-virus"><X size={18} /></button>
      </div>
      <div className="flex flex-col items-center gap-3 mb-4">
        <Avatar id={me?.id ?? 'me'} name={me?.username ?? '?'} size={84} src={avatarUrl(me?.avatar)} />
        <div className="font-mono text-white font-semibold">@{me?.username}</div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <div className="flex gap-2 mb-3">
        <NeonButton
          variant="primary"
          className="flex-1"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          GANTI FOTO
        </NeonButton>
        <NeonButton
          variant="ghost"
          className="flex-1"
          disabled={busy || !me?.avatar}
          onClick={remove}
        >
          HAPUS
        </NeonButton>
      </div>
      <div className="text-[11px] font-mono text-slate-500 text-center mb-4">
        JPG/PNG/WebP maks 5 MB. Foto tampil di daftar chat & header.
      </div>

      <div className="h-px bg-white/10 mb-4" />
      <h4 className="font-mono text-xs text-slate-300 mb-2 tracking-widest">// GANTI USERNAME</h4>
      <input
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="username baru"
        maxLength={24}
        className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 focus:border-neon/60 text-white mb-2 text-sm"
      />
      <input
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="password akun (konfirmasi)"
        className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 focus:border-neon/60 text-white mb-2 text-sm"
      />
      <NeonButton
        variant="ghost"
        className="w-full"
        disabled={busy}
        onClick={changeUsername}
      >
        SIMPAN USERNAME
      </NeonButton>
      <div className="text-[11px] font-mono text-slate-500 text-center mt-2">
        Akun, password, kunci E2E & chat tetap sama — hanya handle yang berubah. Login berikutnya pakai username baru.
      </div>
      {msg && <div className="mt-2 text-xs font-mono text-lime text-center">{msg}</div>}
    </Modal>
  );
}

export function ForwardPicker({
  dms,
  groups,
  excludeKey,
  onPick,
  onClose,
}: {
  dms: { key: string; name: string; peerId?: string }[];
  groups: { id: string; name: string }[];
  excludeKey: string;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const targets = [
    ...dms.map((d) => ({ key: d.key, name: d.name })),
    ...groups.map((g) => ({ key: GRK(g.id), name: g.name })),
  ].filter((t) => t.key !== excludeKey);
  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-sm text-white tracking-widest">↪ FORWARD KE</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white">
          <X size={18} />
        </button>
      </div>
      {targets.length === 0 ? (
        <div className="py-8 text-center text-sm font-mono text-slate-500">
          Tidak ada percakapan lain untuk dijadikan tujuan.
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
          {targets.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                onPick(t.key);
                onClose();
              }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm text-white hover:bg-white/10"
            >
              <Avatar id={t.key.startsWith('grp:') ? `group:${t.name}` : `user:${t.name}`} name={t.name} size={34} />
              <span className="truncate flex-1">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
