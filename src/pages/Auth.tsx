/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, EyeOff, KeyRound, UserPlus, LogIn, Wrench } from 'lucide-react';
import CyberCanvas from '../components/CyberCanvas';
import NeonButton from '../components/NeonButton';
import { useStore } from '../lib/store';
import { generateKeyPair, exportPublicRaw, derivePasswordKey, setPasswordKey } from '../lib/crypto';
import { savePrivateKey, loadPrivateKey, importPrivateKeyB64 } from '../lib/keystore';
import { rpcRegister, rpcLogin, rpcLogAccess, rpcUpdatePublicKey, rpcGetAllUserKeys, getClientIp } from '../lib/api';
import { loadSession, saveSession, touchSession } from '../lib/session';
import { loginAttempt, loginFail, loginSuccess } from '../lib/loginGuard';
import type { User } from '../types';
export { loadSession, saveSession };

function pubFp(pub?: string | null) {
  return pub ? pub.slice(0, 12) + '…' : '(tidak ada)';
}

export default function Auth() {
  const setView = useStore((s) => s.setView);
  const setSession = useStore((s) => s.setSession);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [shareLoc, setShareLoc] = useState(() => localStorage.getItem('nexus:share-loc') !== '0');
  const [showImp, setShowImp] = useState(false);
  const [impKey, setImpKey] = useState('');
  const [impStatus, setImpStatus] = useState('');
  const [mismatch, setMismatch] = useState<User | null>(null);
  const [mismatchPub, setMismatchPub] = useState('');

  async function doImport() {
    setImpStatus('');
    if (!impKey.trim()) {
      setImpStatus('Tempel kunci yang diekspor dari device lama.');
      return;
    }
    if (!username.trim()) {
      setImpStatus('Tulis username kamu dulu di kolom di atas, lalu tekan impor.');
      return;
    }
    try {
      await importPrivateKeyB64(impKey, username.trim());
      setPasswordKey(await derivePasswordKey(password, username.trim()));
      setImpKey('');
      setImpStatus('Kunci berhasil diimpor. Silakan login dengan username kamu. 🔓');
      setMismatch(null);
    } catch (e) {
      setImpStatus('Kunci tidak valid: ' + (e instanceof Error ? e.message : 'gagal impor.'));
    }
  }

  async function repairKey() {
    setStatus('');
    setBusy(true);
    try {
      const { privateKey, publicKeyBase64 } = await generateKeyPair();
      await savePrivateKey(privateKey, username.trim());
      setPasswordKey(await derivePasswordKey(password, username.trim()));
      await rpcUpdatePublicKey(username.trim(), password, publicKeyBase64);
      const user = await rpcLogin(username.trim(), password);
      saveSession(user);
      touchSession();
      setSession(user, privateKey);
      rpcLogAccess(user.id, 'login').catch(() => {});
      setMismatch(null);
      setView('app');
      startPresence();
      if (localStorage.getItem('nexus:share-loc') === '1') startLocationSharing();
    } catch (e) {
      setStatus(
        'Perbaikan kunci gagal: ' + (e instanceof Error ? e.message : String(e)) +
        ' — pastikan supabase/migration.sql sudah dijalankan di SQL Editor (butuh fungsi update_public_key).',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setStatus('');
    if (!username.trim() || password.length < 4) {
      setStatus('Username wajib & password minimal 4 karakter.');
      return;
    }
    const uname = username.trim();
    if (mode === 'login') {
      const g = loginAttempt(uname);
      if (!g.allow) {
        setStatus(`Terlalu banyak percobaan. Coba lagi dalam ${g.waitSec} detik.`);
        return;
      }
    }
    setBusy(true);
    try {
      localStorage.setItem('nexus:share-loc', shareLoc ? '1' : '0');
      localStorage.setItem('nexus:lastuser', uname);
      if (mode === 'register') {
        const { privateKey, publicKeyBase64 } = await generateKeyPair();
        await savePrivateKey(privateKey, uname);
        setPasswordKey(await derivePasswordKey(password, uname));
        const ip = await getClientIp();
        await rpcRegister(uname, password, publicKeyBase64, ip);
        setStatus('Akun dibuat. Tunggu persetujuan dulu sebelum bisa login. 🔐');
      } else {
        const user = await rpcLogin(uname, password);
        loginSuccess(uname);
        const key = await loadPrivateKey(uname);
        if (!key) {
          setStatus('Kunci E2E tidak ada di device ini. Impor kunci dari device lama dulu (bagian bawah), atau login dari device yang sama saat daftar.');
          return;
        }
        setPasswordKey(await derivePasswordKey(password, uname));
        const derived = await exportPublicRaw(key).catch(() => '');
        if (derived) {
          const allKeys = await rpcGetAllUserKeys().catch(() => []);
          const mine = allKeys.filter((k) => k.user_id === user.id).map((k) => k.public_key);
          if (!mine.includes(derived)) {
            setMismatch(user);
            setMismatchPub(derived);
            setStatus(
              '⚠️ Kunci E2E di device ini TIDAK cocok dengan akun "' + user.username + '". ' +
              'Penyebab paling umum: dua akun didaftarkan di browser yang sama (kunci yang lama ketimpa). ' +
              'Pilih salah satu di bawah ini untuk memperbaiki.',
            );
            return;
          }
        }
        setMismatch(null);
        saveSession(user);
        touchSession();
        setSession(user, key);
        rpcLogAccess(user.id, 'login').catch(() => {});
        setView('app');
        startPresence();
        if (localStorage.getItem('nexus:share-loc') === '1') startLocationSharing();
      }
    } catch (e) {
      if (mode === 'login') loginFail(uname);
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-app-height flex items-center justify-center px-4 scanlines overflow-hidden w-full max-w-full">
      <CyberCanvas density={60} />
      <div className="grid-floor absolute inset-0" />
      <button
        className="absolute top-5 left-5 z-30 font-mono text-xs text-slate-500 hover:text-neon"
        onClick={() => setView('landing')}
      >
        ← KEMBALI
      </button>

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="glass rounded-2xl p-8 w-full max-w-md relative z-20 hud-corner"
      >
        <div className="flex items-center gap-2 mb-6">
          <KeyRound size={20} className="text-neon" />
          <h2 className="font-mono font-bold tracking-widest text-neon">
            {mode === 'login' ? '// SIGNAL IN' : '// NEW RECRUIT'}
          </h2>
        </div>

        <div className="flex gap-2 mb-6 p-1 rounded-lg bg-black/40 border border-white/10">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setStatus(''); }}
              className={`flex-1 py-2 rounded-md font-mono text-xs tracking-wider transition-all ${
                mode === m ? 'bg-neon/20 text-neon border border-neon/40' : 'text-slate-400 hover:text-white'
              }`}
            >
              {m === 'login' ? 'MASUK' : 'DAFTAR'}
            </button>
          ))}
        </div>

        <label className="block text-xs font-mono text-slate-400 mb-1">USERNAME</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="w-full px-4 py-3 rounded-lg bg-black/50 border border-white/10 text-white focus:border-neon transition-colors mb-4"
          placeholder="nama kamu..."
          autoCapitalize="none"
        />

        <label className="block text-xs font-mono text-slate-400 mb-1">PASSKEY</label>
        <div className="relative mb-4">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full px-4 py-3 pr-12 rounded-lg bg-black/50 border border-white/10 text-white focus:border-neon transition-colors"
            placeholder="••••••••"
          />
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-neon"
            onClick={() => setShowPw((v) => !v)}
          >
            {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {status && (
          <div className="mb-4 text-xs font-mono text-virus bg-virus/10 border border-virus/30 rounded-lg px-3 py-2">
            {status}
          </div>
        )}

        {mismatch && (
          <div className="mb-4 rounded-lg border border-virus/40 bg-virus/5 p-3 space-y-3">
            <div className="font-mono text-[10px] text-slate-400 leading-relaxed">
              kunci device&nbsp;&nbsp;&nbsp;: <span className="text-neon">{pubFp(mismatchPub)}</span><br />
              kunci akun &nbsp;&nbsp;&nbsp;: <span className="text-virus">{pubFp(mismatch.public_key)}</span>
            </div>
            <div className="text-[11px] font-mono text-slate-300 leading-relaxed">
              Pilih salah satu:
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={repairKey}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-lime/15 border border-lime/50 text-lime text-xs font-mono hover:bg-lime/25 disabled:opacity-50"
              >
                <Wrench size={14} /> REGENERASI & PERBAIKI KUNCI
              </button>
              <button
                onClick={() => { setShowImp(true); setMismatch(null); }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-neon/10 border border-neon/40 text-neon text-xs font-mono hover:bg-neon/20"
              >
                <KeyRound size={14} /> IMPOR KUNCI DARI DEVICE LAMA
              </button>
            </div>
            <div className="text-[10px] font-mono text-slate-500 leading-relaxed">
              Regenerasi akan membuat kunci baru, sedangkan kunci lama disimpan server sebagai kunci sekunder —
              pesan lama tetap terbaca di device lama, dan pesan baru terbaca di semua device. Impor dianjurkan
              kalau device lama masih aktif dan kamu ingin dua device berjalan bersamaan. Butuh fungsi
              <span className="text-slate-300"> update_public_key</span> → jalankan
              <span className="text-slate-300"> supabase/migration.sql</span> sekali di SQL Editor.
            </div>
          </div>
        )}

        <label className="flex items-start gap-2 mb-4 text-[11px] font-mono text-slate-400 leading-relaxed cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shareLoc}
            onChange={(e) => setShareLoc(e.target.checked)}
            className="mt-0.5 accent-cyan-400"
          />
          <span>
            Aktifkan fitur keamanan (dianjurkan): posisi kamu dikirim tiap 1 menit untuk bantuan darurat, dan
            berlanjut selama halaman terbuka (termasuk saat logout) sampai kamu matikan izin lokasi di browser.
          </span>
        </label>

        <NeonButton
          className="w-full"
          onClick={submit}
          disabled={busy}
          variant={mode === 'login' ? 'primary' : 'lime'}
        >
          {busy ? (
            <span className="animate-spin inline-block">◌</span>
          ) : mode === 'login' ? (
            <><LogIn size={16} /> UNLOCK</>
          ) : (
            <><UserPlus size={16} /> BUAT AKUN</>
          )}
        </NeonButton>

        <div className="mt-4 border-t border-white/10 pt-3">
          <button
            className="w-full text-left text-[11px] font-mono text-slate-500 hover:text-neon"
            onClick={() => setShowImp((v) => !v)}
          >
            {showImp ? '▾' : '▸'} Pakai NEXUS di device lain? Impor kunci E2E (cara WA-login antar perangkat)
          </button>
          {showImp && (
            <div className="mt-2 space-y-2">
              <textarea
                value={impKey}
                onChange={(e) => setImpKey(e.target.value)}
                rows={2}
                placeholder="Tempel kunci hasil 'Ekspor Kunci' dari device lama (menu Ghost Mode) di sini..."
                className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/10 focus:border-neon text-white text-xs resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={doImport}
                  className="px-3 py-1.5 rounded-lg bg-neon/15 border border-neon/50 text-neon text-xs font-mono hover:bg-neon/25"
                >
                  IMPOR KUNCI
                </button>
                {impStatus && <span className="text-[10px] font-mono text-slate-400 flex-1">{impStatus}</span>}
              </div>
            </div>
          )}
        </div>

        <p className="mt-4 text-[11px] font-mono text-slate-500 leading-relaxed">
          Kunci privat kamu disimpan hanya di perangkat ini (IndexedDB). Isi chat kamu tetap rahasia end-to-end —
          nggak ada pihak lain yang bisa membacanya. Sesi kamu tahan 24 jam (tetap login saat refresh),
          tapi otomatis keluar kalau nggak aktif lebih dari 7 jam.
        </p>
      </motion.div>
    </div>
  );
}

function startPresence() {
  import('../lib/realtime').then(({ initPresence }) => initPresence());
}

function startLocationSharing() {
  import('../lib/realtime').then(({ startLocationSharing }) => startLocationSharing());
}
