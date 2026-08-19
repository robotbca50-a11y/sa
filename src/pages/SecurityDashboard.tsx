/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ShieldAlert, ShieldOff, Ban, RefreshCw, Trash2, ArrowLeft, AlertTriangle, Activity, Wifi, Eye, Power } from 'lucide-react';
import NeonButton from '../components/NeonButton';

type ThreatEvent = {
  time: string;
  ip: string;
  type: string;
  severity: string;
  detail: string;
  score: number;
};

type AttackerProfile = {
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  threatTypes: Record<string, number>;
  maxScore: number;
  userAgents: string[];
};

type IcewallStats = {
  quarantined: string[];
  quarantineCount: number;
};

type FireballStats = {
  totalFired: number;
  active: { ip: string; firedAt: number; type: string; totalFired: number }[];
};

type SecurityState = {
  threats: ThreatEvent[];
  stats: {
    total: number;
    last1h: number;
    last24h: number;
    critical1h: number;
    blockedIPs: number;
    topThreats: [string, number][];
    activeAttackers: { ip: string; score: number; events: number; blocked: boolean }[];
  };
  attackers: Record<string, AttackerProfile>;
  blockedIPs: { ip: string; perm: boolean; until: number; score: number }[];
  killSwitch: { active: boolean; reason: string; at: number } | null;
  sessions: number;
  icewall: IcewallStats;
  fireball: FireballStats;
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ff3333',
  high: '#ff8800',
  medium: '#ffcc00',
  low: '#00cc88',
};

export default function SecurityDashboard() {
  const [secret, setSecret] = useState('');
  const [logged, setLogged] = useState(!!sessionStorage.getItem('nexus:sec_dash'));
  const [state, setState] = useState<SecurityState | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<'live' | 'attackers' | 'blocked' | 'stats' | 'fortress'>('live');
  const [blockInput, setBlockInput] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const cred = () => sessionStorage.getItem('nexus:sec_dash') || '';

  async function doLogin() {
    setErr('');
    try {
      const res = await fetch('/api/admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_state', secret }),
      });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
      setState(data);
      sessionStorage.setItem('nexus:sec_dash', secret);
      setLogged(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function refresh() {
    try {
      const res = await fetch('/api/admin/security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_state', secret: cred() }),
      });
      if (res.ok) setState(await res.json());
    } catch {}
  }

  useEffect(() => {
    if (!logged) return;
    refresh();
    if (!autoRefresh) return;
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, [logged, autoRefresh]);

  async function blockIP(ip: string, perm = false) {
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'block_ip', ip, perm, secret: cred() }),
    });
    refresh();
  }

  async function unblockIP(ip: string) {
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unblock_ip', ip, secret: cred() }),
    });
    refresh();
  }

  async function clearAll() {
    if (!confirm('Hapus semua data ancaman?')) return;
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_all', secret: cred() }),
    });
    refresh();
  }

  async function banIP(ip: string) {
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ban_ip', ip, secret: cred() }),
    });
    refresh();
  }

  async function unquarantineIP(ip: string) {
    await fetch('/api/admin/unquarantine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, secret: cred() }),
    });
    refresh();
  }

  async function activateKillSwitch() {
    if (!confirm('AKTIFKAN KILL SWITCH? Semua akses user akan diblokir.')) return;
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill_switch', secret: cred(), reason: 'admin_manual' }),
    });
    refresh();
  }

  async function deactivateKillSwitch() {
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill_switch_off', secret: cred() }),
    });
    refresh();
  }

  async function killAllSessions() {
    if (!confirm('TERMINTAE SEMUA SESSION? Semua user akan logout.')) return;
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'kill_sessions', secret: cred() }),
    });
    refresh();
  }

  async function panicWipe() {
    if (!confirm('⚠️ PANIC WIPE? Ini akan menghapus SEMUA data ancaman dan session. Tidak bisa dibatalkan.')) return;
    if (!confirm('ARE YOU SURE? This is IRREVERSIBLE.')) return;
    await fetch('/api/admin/security', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'panic_wipe', secret: cred() }),
    });
    refresh();
  }

  function logoutDash() {
    sessionStorage.removeItem('nexus:sec_dash');
    setLogged(false);
    setState(null);
  }

  if (!logged) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#06080e]">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#0b0f1a] border border-red-500/30 rounded-xl p-8 w-full max-w-md">
          <div className="flex items-center gap-3 mb-6">
            <ShieldAlert size={28} className="text-red-400" />
            <h2 className="text-xl font-mono font-bold text-red-400 tracking-wider">SECURITY COMMAND</h2>
          </div>
          <input
            type="password"
            placeholder="Admin Secret"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && doLogin()}
            className="w-full bg-black/40 border border-red-500/20 rounded-lg px-4 py-3 text-white font-mono mb-4 focus:outline-none focus:border-red-500/60"
          />
          {err && <p className="text-red-400 text-sm mb-4">{err}</p>}
          <NeonButton variant="danger" onClick={doLogin} className="w-full">
            <Shield size={16} /> MASUK
          </NeonButton>
        </motion.div>
      </div>
    );
  }

  const s = state?.stats;
  const threats = state?.threats || [];
  const attackers = state?.attackers || {};
  const blocked = state?.blockedIPs || [];
  const ksActive = state?.killSwitch?.active || false;

  return (
    <div className="min-h-screen bg-[#06080e] text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldAlert size={28} className="text-red-400" />
            <h1 className="text-2xl font-mono font-bold text-red-400 tracking-wider">SECURITY COMMAND CENTER</h1>
            {ksActive && (
              <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-red-500/30 text-red-300 animate-pulse border border-red-500/50">
                KILL SWITCH ACTIVE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${autoRefresh ? 'border-green-500/40 text-green-400 bg-green-500/10' : 'border-white/10 text-slate-500 bg-white/5'}`}
            >
              <Activity size={12} className="inline mr-1" />
              AUTO {autoRefresh ? 'ON' : 'OFF'}
            </button>
            {ksActive ? (
              <button onClick={deactivateKillSwitch} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-green-500/40 text-green-400 bg-green-500/10 hover:bg-green-500/20">
                <Power size={12} className="inline mr-1" /> KILL SWITCH OFF
              </button>
            ) : (
              <button onClick={activateKillSwitch} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20">
                <Power size={12} className="inline mr-1" /> KILL SWITCH
              </button>
            )}
            <button onClick={killAllSessions} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-yellow-500/40 text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20">
              <Ban size={12} className="inline mr-1" /> KILL SESSIONS
            </button>
            <button onClick={panicWipe} className="px-3 py-1.5 rounded-lg text-xs font-mono border border-red-600/60 text-red-300 bg-red-600/20 hover:bg-red-600/30">
              <Trash2 size={12} className="inline mr-1" /> PANIC WIPE
            </button>
            <button onClick={refresh} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
              <RefreshCw size={16} />
            </button>
            <button onClick={logoutDash} className="p-2 rounded-lg border border-white/10 hover:bg-white/5">
              <ArrowLeft size={16} />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
          <StatBox label="TOTAL THREATS" value={s?.total ?? 0} color="#ff3333" icon={<AlertTriangle size={16} />} />
          <StatBox label="LAST 1H" value={s?.last1h ?? 0} color="#ff8800" icon={<Activity size={16} />} />
          <StatBox label="CRITICAL 1H" value={s?.critical1h ?? 0} color="#ff0000" icon={<ShieldAlert size={16} />} />
          <StatBox label="BLOCKED IPs" value={s?.blockedIPs ?? 0} color="#ff4488" icon={<Ban size={16} />} />
          <StatBox label="ACTIVE ATTACKERS" value={s?.activeAttackers?.length ?? 0} color="#ffcc00" icon={<Eye size={16} />} />
          <StatBox label="ICEWALL QUARANTINE" value={state?.icewall?.quarantineCount ?? 0} color="#00ccff" icon={<Shield size={16} />} />
          <StatBox label="FIREBALL FIRED" value={state?.fireball?.totalFired ?? 0} color="#ff6600" icon={<Wifi size={16} />} />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {(['live', 'attackers', 'blocked', 'stats', 'fortress'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-wider border transition-all ${tab === t ? 'border-red-500/60 text-red-400 bg-red-500/10' : 'border-white/10 text-slate-500 hover:bg-white/5'}`}
            >
              {t === 'live' ? 'LIVE FEED' : t === 'attackers' ? 'ATTACKERS' : t === 'blocked' ? 'BLOCKED' : t === 'fortress' ? 'FORTRESS' : 'STATS'}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={clearAll} className="px-3 py-2 rounded-lg text-xs font-mono border border-red-500/20 text-red-500/60 hover:bg-red-500/10 transition-all">
            <Trash2 size={12} className="inline mr-1" /> CLEAR ALL
          </button>
        </div>

        <AnimatePresence mode="wait">
          {tab === 'live' && (
            <motion.div key="live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-[#0b0f1a] border border-white/10 rounded-xl overflow-hidden">
                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-xs font-mono">
                    <thead className="sticky top-0 bg-[#0d1220]">
                      <tr className="text-left text-slate-500 border-b border-white/10">
                        <th className="p-3">WAKTU</th>
                        <th className="p-3">IP</th>
                        <th className="p-3">TYPE</th>
                        <th className="p-3">SEVERITY</th>
                        <th className="p-3">DETAIL</th>
                        <th className="p-3">SCORE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {threats.map((t, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                          <td className="p-3 text-slate-400 whitespace-nowrap">{new Date(t.time).toLocaleTimeString()}</td>
                          <td className="p-3 text-cyan-400">{t.ip}</td>
                          <td className="p-3">{t.type}</td>
                          <td className="p-3" style={{ color: SEVERITY_COLORS[t.severity] || '#888' }}>
                            <span className="uppercase font-bold">{t.severity}</span>
                          </td>
                          <td className="p-3 text-slate-400 max-w-xs truncate">{t.detail}</td>
                          <td className="p-3 text-yellow-400">{t.score}</td>
                        </tr>
                      ))}
                      {threats.length === 0 && (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-600">Tidak ada ancaman tercatat</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'attackers' && (
            <motion.div key="attackers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="space-y-3">
                {Object.entries(attackers).sort((a, b) => (b[1].maxScore || 0) - (a[1].maxScore || 0)).map(([ip, p]) => (
                  <div key={ip} className="bg-[#0b0f1a] border border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Shield size={16} style={{ color: p.maxScore >= 50 ? '#ff3333' : p.maxScore >= 25 ? '#ff8800' : '#00cc88' }} />
                        <span className="font-mono text-cyan-400 font-bold">{ip}</span>
                        <span className="text-xs text-slate-500">{p.totalEvents} events</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/5 text-yellow-400">SCORE: {p.maxScore}</span>
                        <button onClick={() => blockIP(ip)} className="px-2 py-1 text-xs rounded border border-red-500/30 text-red-400 hover:bg-red-500/10">
                          BLOCK
                        </button>
                        <button onClick={() => blockIP(ip, true)} className="px-2 py-1 text-xs rounded border border-red-500/50 text-red-500 hover:bg-red-500/20">
                          BAN
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {Object.entries(p.threatTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                        <span key={type} className="px-2 py-0.5 text-[10px] rounded-full bg-white/5 text-slate-400">
                          {type} × {count}
                        </span>
                      ))}
                    </div>
                    {p.userAgents?.length > 0 && (
                      <div className="mt-2 text-[10px] text-slate-600 truncate">
                        UA: {p.userAgents[0]}
                      </div>
                    )}
                  </div>
                ))}
                {Object.keys(attackers).length === 0 && (
                  <div className="text-center text-slate-600 py-12 font-mono">Tidak ada attacker terprofil</div>
                )}
              </div>
            </motion.div>
          )}

          {tab === 'blocked' && (
            <motion.div key="blocked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="bg-[#0b0f1a] border border-white/10 rounded-xl p-4 mb-4">
                <div className="flex gap-2">
                  <input
                    placeholder="IP address..."
                    value={blockInput}
                    onChange={(e) => setBlockInput(e.target.value)}
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-white focus:outline-none focus:border-red-500/40"
                  />
                  <NeonButton variant="danger" onClick={() => { if (blockInput) blockIP(blockInput, false); setBlockInput(''); }} className="text-sm">
                    BLOCK
                  </NeonButton>
                  <NeonButton variant="danger" onClick={() => { if (blockInput) blockIP(blockInput, true); setBlockInput(''); }} className="text-sm">
                    BAN
                  </NeonButton>
                </div>
              </div>
              <div className="space-y-2">
                {blocked.map((b) => (
                  <div key={b.ip} className="flex items-center justify-between bg-[#0b0f1a] border border-white/10 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Ban size={14} className={b.perm ? 'text-red-500' : 'text-yellow-500'} />
                      <span className="font-mono text-sm">{b.ip}</span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${b.perm ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {b.perm ? 'PERMANENT' : `TEMP (score: ${b.score})`}
                      </span>
                    </div>
                    <button onClick={() => unblockIP(b.ip)} className="px-3 py-1 text-xs rounded border border-green-500/30 text-green-400 hover:bg-green-500/10">
                      UNBLOCK
                    </button>
                  </div>
                ))}
                {blocked.length === 0 && (
                  <div className="text-center text-slate-600 py-12 font-mono">Tidak ada IP yang diblock</div>
                )}
              </div>
            </motion.div>
          )}

          {tab === 'stats' && (
            <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#0b0f1a] border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm font-mono text-slate-400 mb-4 uppercase tracking-wider">Top Threat Types (24h)</h3>
                  <div className="space-y-2">
                    {s?.topThreats.map(([type, count]) => (
                      <div key={type} className="flex items-center gap-3">
                        <span className="font-mono text-xs text-cyan-400 w-40 truncate">{type}</span>
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-red-500 to-orange-500 rounded-full"
                            style={{ width: `${Math.min(100, (count / (s.topThreats[0]?.[1] || 1)) * 100)}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-slate-400 w-8 text-right">{count}</span>
                      </div>
                    ))}
                    {(!s?.topThreats || s.topThreats.length === 0) && (
                      <div className="text-center text-slate-600 py-8">Belum ada data</div>
                    )}
                  </div>
                </div>

                <div className="bg-[#0b0f1a] border border-white/10 rounded-xl p-5">
                  <h3 className="text-sm font-mono text-slate-400 mb-4 uppercase tracking-wider">Active Attackers</h3>
                  <div className="space-y-2">
                    {s?.activeAttackers.map((a) => (
                      <div key={a.ip} className="flex items-center justify-between">
                        <span className="font-mono text-xs text-cyan-400">{a.ip}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] text-slate-500">{a.events} events</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${a.blocked ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            SCORE {a.score}
                          </span>
                        </div>
                      </div>
                    ))}
                    {(!s?.activeAttackers || s.activeAttackers.length === 0) && (
                      <div className="text-center text-slate-600 py-8">Tidak ada attacker aktif</div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {tab === 'fortress' && (
            <motion.div key="fortress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-[#0b0f1a] border border-cyan-500/20 rounded-xl p-5">
                  <h3 className="text-sm font-mono text-cyan-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Shield size={16} /> ICEWALL — Tembok Es
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-black/30 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-slate-500">QUARANTINED IPs</div>
                      <div className="text-xl font-mono font-bold text-cyan-400">{state?.icewall?.quarantineCount ?? 0}</div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-slate-500">STATUS</div>
                      <div className="text-sm font-mono text-green-400">ACTIVE</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                    {(state?.icewall?.quarantined || []).map((ip) => (
                      <div key={ip} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                        <span className="font-mono text-xs text-cyan-400">{ip}</span>
                        <div className="flex gap-2">
                          <button onClick={() => unquarantineIP(ip)} className="px-2 py-1 text-[10px] rounded border border-green-500/30 text-green-400 hover:bg-green-500/10">
                            UNQUARANTINE
                          </button>
                          <button onClick={() => banIP(ip)} className="px-2 py-1 text-[10px] rounded border border-red-500/50 text-red-400 hover:bg-red-500/10">
                            BAN
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!state?.icewall?.quarantined || state.icewall.quarantined.length === 0) && (
                      <div className="text-center text-slate-600 py-6 text-xs font-mono">Tidak ada IP yang diquarantine</div>
                    )}
                  </div>
                </div>

                <div className="bg-[#0b0f1a] border border-orange-500/20 rounded-xl p-5">
                  <h3 className="text-sm font-mono text-orange-400 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <Wifi size={16} /> FIREBALL — Counter-Attack
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-black/30 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-slate-500">TOTAL FIRED</div>
                      <div className="text-xl font-mono font-bold text-orange-400">{state?.fireball?.totalFired ?? 0}</div>
                    </div>
                    <div className="bg-black/30 rounded-lg p-3">
                      <div className="text-[10px] font-mono text-slate-500">STATUS</div>
                      <div className="text-sm font-mono text-green-400">ARMED</div>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-[30vh] overflow-y-auto">
                    {(state?.fireball?.active || []).reverse().map((fb, i) => (
                      <div key={i} className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-orange-400">{fb.ip}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            fb.type.includes('drop') ? 'bg-red-500/20 text-red-400' :
                            fb.type.includes('timeout') ? 'bg-yellow-500/20 text-yellow-400' :
                            fb.type.includes('fake') ? 'bg-purple-500/20 text-purple-400' :
                            'bg-orange-500/20 text-orange-400'
                          }`}>
                            {fb.type}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{new Date(fb.firedAt).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {(!state?.fireball?.active || state.fireball.active.length === 0) && (
                      <div className="text-center text-slate-600 py-6 text-xs font-mono">Tidak ada fireball yang aktif</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[#0b0f1a] border border-white/10 rounded-xl p-5">
                <h3 className="text-sm font-mono text-slate-400 mb-4 uppercase tracking-wider">Fortress Layer Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { name: 'Layer 1-100', desc: 'Signature Engine', status: 'ACTIVE', color: '#ff3333' },
                    { name: 'Layer 101-200', desc: 'Behavioral Analysis', status: 'ACTIVE', color: '#ff8800' },
                    { name: 'Layer 201-300', desc: 'Honeypot Network', status: 'ACTIVE', color: '#ffcc00' },
                    { name: 'Layer 301-500', desc: 'Session Fortress', status: 'ACTIVE', color: '#00cc88' },
                    { name: 'Layer 501-1000', desc: 'Network + Kill Switch', status: 'ACTIVE', color: '#00ccff' },
                  ].map((l) => (
                    <div key={l.name} className="bg-black/30 rounded-lg p-3 border border-white/5">
                      <div className="text-[10px] font-mono text-slate-500 mb-1">{l.name}</div>
                      <div className="text-xs font-mono font-bold mb-1" style={{ color: l.color }}>{l.desc}</div>
                      <div className="text-[10px] font-mono text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        {l.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatBox({ label, value, color, icon }: { label: string; value: number; color: string; icon: React.ReactNode }) {
  return (
    <div className="bg-[#0b0f1a] border border-white/10 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1" style={{ color }}>
        {icon}
        <span className="text-[10px] font-mono uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
