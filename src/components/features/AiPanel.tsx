import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Sparkles, ShieldCheck, RefreshCw } from 'lucide-react';
import { memorySummary, getAiPrefs, setAiPrefs, aiModel } from '../../lib/ai';
import { brainAssistantReply, brainStats, brainReset } from '../../lib/brain';

type ChatMsg = { role: 'user' | 'ai'; text: string };

export default function AiPanel({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([
    { role: 'ai', text: 'Halo! Aku NEXUS AI, asisten yang tinggal di perangkatmu. Otakku belajar dari chat yang kamu baca & tulis, lalu tersinkron privat ke semua perangkatmu — jadi kepintaranku sama di mana pun. Bilang "ingat bahwa ..." untuk membuatku belajar, atau tanya apa saja.' },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [prefs, setPrefs] = useState(getAiPrefs());
  const [memVer, setMemVer] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, thinking]);

  const mem = memorySummary();
  const bstats = brainStats();

  function send() {
    const t = input.trim();
    if (!t || thinking) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text: t }]);
    setThinking(true);
    setTimeout(async () => {
      const remote = await aiModel(t).catch(() => null);
      const reply = remote ?? brainAssistantReply(t);
      setMsgs((m) => [...m, { role: 'ai', text: reply }]);
      setThinking(false);
      setMemVer((v) => v + 1);
    }, 350);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 80 }}
      transition={{ type: 'spring', damping: 28, stiffness: 300 }}
      className="fixed inset-0 z-[90] sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[420px] sm:max-h-[94vh] sm:rounded-2xl glass hud-corner flex flex-col overflow-hidden"
    >
      <header className="flex items-center gap-2 px-4 py-3 border-b border-white/10 shrink-0">
        <Sparkles size={17} className="text-lime" />
        <div className="flex-1 min-w-0">
          <div className="font-mono font-bold tracking-widest text-lime">NEXUS AI</div>
          <div className="font-mono text-[10px] text-slate-500 truncate">
            <ShieldCheck size={10} className="inline mr-1 text-lime" />offline • privat • belajar dari feedback-mu
          </div>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-virus" title="Tutup">
          <X size={18} />
        </button>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed border whitespace-pre-wrap break-words ${
                m.role === 'user'
                  ? 'bg-neon/10 border-neon/40 text-neon-foreground rounded-br-md'
                  : 'bg-white/5 border-white/10 rounded-bl-md text-slate-200'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl px-3.5 py-2.5 bg-white/5 border border-white/10 flex items-center gap-2 text-slate-400 text-xs">
              <RefreshCw size={12} className="animate-spin" /> berpikir...
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-2 shrink-0">
        <div className="mb-2 flex flex-wrap gap-2 text-[11px] font-mono">
          <button
            onClick={() => {
              const next = { ...prefs, smartReply: !prefs.smartReply };
              setPrefs(next);
              setAiPrefs(next);
            }}
            className={`px-2.5 py-1 rounded-full border ${prefs.smartReply ? 'border-lime/50 bg-lime/10 text-lime' : 'border-white/10 text-slate-500'}`}
          >
            smart reply {prefs.smartReply ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => {
              const next = { ...prefs, spamFilter: !prefs.spamFilter };
              setPrefs(next);
              setAiPrefs(next);
            }}
            className={`px-2.5 py-1 rounded-full border ${prefs.spamFilter ? 'border-lime/50 bg-lime/10 text-lime' : 'border-white/10 text-slate-500'}`}
          >
            filter spam {prefs.spamFilter ? 'ON' : 'OFF'}
          </button>
          <span className="px-2.5 py-1 rounded-full border border-white/10 text-slate-500">
            belajar: {bstats.trained} chat • {bstats.turns} pengalaman
          </span>
          {mem.length > 0 && (
            <button
              onClick={() => {
                try {
                  localStorage.removeItem('nexus:ai:memory');
                } catch {
                }
                setMemVer((v) => v + 1);
              }}
              className="px-2.5 py-1 rounded-full border border-virus/40 bg-virus/10 text-virus"
            >
              hapus ingatan ({mem.length})
            </button>
          )}
          <button
            onClick={() => {
              if (!window.confirm('HAPUS semua pembelajaran otak AI di perangkat ini?\nRiwayat chat tidak terpengaruh.')) return;
              brainReset();
              setMemVer((v) => v + 1);
            }}
            className="px-2.5 py-1 rounded-full border border-white/15 text-slate-400 hover:text-virus hover:border-virus/40"
          >
            reset otak AI
          </button>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Tanya NEXUS AI / ingatkan sesuatu..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-lime/60 text-white placeholder-slate-500 text-sm"
          />
          <button
            onClick={send}
            disabled={!input.trim() || thinking}
            className="p-3 rounded-xl bg-lime/15 border border-lime/50 text-lime hover:bg-lime/25 disabled:opacity-30"
            title="Kirim"
          >
            <Send size={17} />
          </button>
        </div>
        <div className="mt-1.5 px-1 font-mono text-[10px] text-slate-600 flex items-center gap-2">
          <ShieldCheck size={10} className="text-lime shrink-0" /> Otak AI tersinkron privat antar perangkatmu (hanya kamu yang bisa baca). Reset otak di sini; spam & smart reply tetap jalan.
        </div>
      </div>
    </motion.div>
  );
}
