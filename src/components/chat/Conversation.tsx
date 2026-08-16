/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone, UserPlus, Lock, Info, Users, ChevronDown, Timer, Search, MoreVertical, Ban, Bell, BellOff, Forward, X, Sparkles, ShieldAlert } from 'lucide-react';
import { disappearLabel } from '../../lib/disappear';
import { chatBgCss, getChatBg, useChatBgVersion } from '../../lib/theme';
import { motion } from 'framer-motion';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import TypingDots from './TypingDots';
import Avatar, { avatarUrl } from '../Avatar';
import type { Msg, Reaction } from '../../types';
import { decodeMessage } from '../../lib/decrypt';
import { rpcGetMessage, rpcGetGroupMessage, rpcReportUser } from '../../lib/api';
import { useStore } from '../../lib/store';
import { antiSadapEnabled } from '../AntiSadapOverlay';
import { smartReplies, summarize, getAiPrefs } from '../../lib/ai';
import { brainLearn, brainSuggest } from '../../lib/brain';
import { appNotify } from '../../lib/notify';

export default function Conversation({
  kind,
  title,
  convKey,
  peerId,
  peerAvatar,
  online,
  messages,
  keyObj,
  reactions,
  typing,
  ghostOn,
  onSendText,
  onSendMedia,
  onReact,
  onEdit,
  onDelete,
  onRetry,
  onOpenCall,
  onOpenGroupCall,
  onAddMember,
  groupLocked,
  userNames,
  userAvatars,
  onBack,
  disappearSecs = 0,
  onCycleDisappear,
  onForward,
  peerBlocked = false,
  onToggleBlock,
  muted = false,
  onToggleMute,
  lastSeenLabel,
}: {
  kind: 'dm' | 'group';
  title: string;
  convKey: string;
  peerId?: string;
  peerAvatar?: string | null;
  online?: boolean;
  messages: Msg[];
  keyObj: CryptoKey;
  reactions: Record<string, Reaction[]>;
  typing: string[];
  ghostOn: boolean;
  onSendText: (t: string, replyToId?: string | null) => void;
  onSendMedia: (f: File, replyToId?: string | null) => void;
  onReact: (msgId: string, emoji: string) => void;
  onEdit: (msgId: string, text: string) => void;
  onDelete: (msgId: string) => void;
  onRetry: (m: Msg) => void;
  onOpenCall?: () => void;
  onOpenGroupCall?: () => void;
  onAddMember?: () => void;
  groupLocked?: boolean;
  userNames: Record<string, string>;
  userAvatars?: Record<string, string | null>;
  onBack: () => void;
  disappearSecs?: number;
  onCycleDisappear?: () => void;
  onForward?: (m: Msg) => void;
  peerBlocked?: boolean;
  onToggleBlock?: () => void;
  muted?: boolean;
  onToggleMute?: () => void;
  lastSeenLabel?: string;
}) {
  const me = useStore((s) => s.me);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; preview: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [groupInfo, setGroupInfo] = useState(false);
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState('');
  const [searchMap, setSearchMap] = useState<Map<string, string>>(new Map());
  const [menuOpen, setMenuOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  useChatBgVersion();

  useEffect(() => {
    let live = true;
    const prefs = getAiPrefs();
    if (!prefs.smartReply) {
      setSuggestions([]);
      return;
    }
    const incoming = [...messages]
      .reverse()
      .find((m) => m.msg_type === 'text' && m.sender_id !== me?.id && !m.deleted);
    if (!incoming) {
      setSuggestions([]);
      return;
    }
    decodeMessage(incoming, keyObj)
      .then((d) => {
        if (live) setSuggestions(brainSuggest(d.text));
      })
      .catch(() => {
        if (live) setSuggestions([]);
      });
    return () => {
      live = false;
    };
  }, [messages, keyObj, me?.id]);

  const lastTrainedRef = useRef<string | null>(null);
  useEffect(() => {
    let live = true;
    const run = async () => {
      let start = 0;
      const li = lastTrainedRef.current;
      if (li) {
        const i = messages.findIndex((m) => m.id === li);
        if (i >= 0) start = i;
      }
      for (let i = start; i < messages.length; i++) {
        const m = messages[i];
        if (!live) return;
        if (m.msg_type !== 'text' || m.deleted || !m.ciphertext) continue;
        try {
          const d = await decodeMessage(m, keyObj);
          if (!live) return;
          brainLearn(d.text, m.id, m.sender_id === me?.id);
        } catch {
        }
      }
      if (messages.length) lastTrainedRef.current = messages[messages.length - 1].id;
    };
    run();
    return () => {
      live = false;
    };
  }, [messages, keyObj, convKey, me?.id]);

  async function doSummarize() {
    setSummarizing(true);
    try {
      const texts: string[] = [];
      for (const m of messages) {
        if (m.msg_type !== 'text' || !m.ciphertext || m.deleted) continue;
        try {
          const d = await decodeMessage(m, keyObj);
          if (d.text) texts.push(d.text);
        } catch {
        }
      }
      setSummary(summarize(texts) || 'Belum ada pesan teks untuk dirangkum.');
    } catch {
      appNotify('RINGKAS GAGAL', 'Terjadi kesalahan saat merangkum.', { icon: '⚠️' });
    } finally {
      setSummarizing(false);
    }
  }

  useEffect(() => {
    if (!searching || !q.trim()) {
      setSearchMap(new Map());
      return;
    }
    const needle = q.trim().toLowerCase();
    let live = true;
    const t = window.setTimeout(async () => {
      const map = new Map<string, string>();
      for (const m of messages) {
        if (m.msg_type !== 'text' || !m.ciphertext || m.deleted) continue;
        try {
          const d = await decodeMessage(m, keyObj);
          if (!live) return;
          if (d.text.toLowerCase().includes(needle)) map.set(m.id, d.text);
        } catch {
        }
      }
      if (live) setSearchMap(map);
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [searching, q, messages, keyObj]);

  const displayList = searching && q.trim() ? messages.filter((m) => searchMap.has(m.id)) : messages;
  const bgCss = chatBgCss(getChatBg());

  useEffect(() => {
    pinnedRef.current = true;
    setShowJump(false);
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [convKey]);

  useEffect(() => {
    if (pinnedRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, typing.length]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80;
    pinnedRef.current = atBottom;
    setShowJump(!atBottom);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    pinnedRef.current = true;
    setShowJump(false);
  }

  useEffect(() => {
    let live = true;
    const need = messages.filter((m) => m.reply_to);
    const run = async () => {
      const map: Record<string, string> = {};
      for (const m of need) {
        const target = messages.find((x) => x.id === m.reply_to);
        const raw = target ?? (await (kind === 'dm' ? rpcGetMessage(m.reply_to!, me?.id ?? null) : rpcGetGroupMessage(m.reply_to!, me?.id ?? null)));
        if (!raw || !live) continue;
        const who = userNames[raw.sender_id] || raw.username ? `@${userNames[raw.sender_id] ?? raw.username}: ` : '';
        if (raw.msg_type === 'text' && raw.ciphertext) {
          try {
            const d = await decodeMessage(raw, keyObj);
            map[m.id] = who + d.text.slice(0, 120);
          } catch {
            map[m.id] = who + '[🔒]';
          }
        } else {
          map[m.id] = who + (raw.msg_type === 'text' ? '[Pesan]' : `[${raw.msg_type}]`);
        }
      }
      if (live) setPreviews(map);
    };
    run();
    return () => {
      live = false;
    };
  }, [messages, keyObj, kind]);

  const displayTitle = title;

  return (
    <div className="flex flex-col h-full flex-1 w-full min-w-0">
      {}
      <header className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/10 bg-panel/80 backdrop-blur-xl">
        <button className="md:hidden text-slate-400" onClick={onBack} title="Kembali">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <Avatar id={kind === 'dm' ? peerId! : `group:${title}`} name={title} size={40} online={kind === 'dm' ? online : undefined} src={kind === 'dm' ? avatarUrl(peerAvatar) : undefined} />
          {kind === 'group' && (
            <span className="absolute -bottom-0.5 -right-0.5 bg-arc rounded-md p-0.5">
              <Users size={9} className="text-white" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white truncate flex items-center gap-2">
            {displayTitle}
            {groupLocked && <Lock size={12} className="text-lime" />}
          </div>
          <div className="text-xs font-mono">
            {typing.length > 0 ? (
              <span className="text-lime">{typing.join(', ')} lagi ngetik...</span>
            ) : kind === 'dm' && online ? (
              <span className="text-lime">online</span>
            ) : kind === 'dm' ? (
              <span className="text-slate-500">{peerBlocked ? 'terblokir' : lastSeenLabel || 'offline'}</span>
            ) : (
              <span className="text-slate-500 flex items-center gap-1">
                <Lock size={10} className="text-lime" /> {groupLocked ? 'E2E aktif' : 'membuka kunci...'}
              </span>
            )}
          </div>
        </div>
        <button className="p-2 rounded-lg text-slate-400 hover:text-neon" onClick={() => { setSearching((v) => !v); if (searching) setQ(''); }} title="Cari pesan">
          <Search size={18} />
        </button>
        <button
          className="p-2 rounded-lg text-slate-400 hover:text-lime disabled:opacity-40"
          onClick={doSummarize}
          disabled={summarizing || messages.length === 0}
          title="Ringkas percakapan (AI offline)"
        >
          <Sparkles size={18} className={summarizing ? 'animate-pulse text-lime' : ''} />
        </button>
        {kind === 'group' && (
          <button className="p-2 rounded-lg text-slate-400 hover:text-neon" onClick={() => setGroupInfo((v) => !v)} title="Info grup">
            <Info size={18} />
          </button>
        )}
        {kind === 'group' && (
          <button className="p-2 rounded-lg text-slate-400 hover:text-lime" onClick={onAddMember} title="Tambah member">
            <UserPlus size={18} />
          </button>
        )}
        {kind === 'group' && onOpenGroupCall && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="p-2.5 rounded-lg bg-arc/15 border border-arc/40 hover:shadow-[0_0_18px_rgba(167,139,250,0.4)]"
            style={{ color: '#a78bfa' }}
            onClick={onOpenGroupCall}
            title="Video call grup"
          >
            <Phone size={17} />
          </motion.button>
        )}
        {kind === 'dm' && onOpenCall && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            className="p-2.5 rounded-lg bg-virus/15 border border-virus/40 text-virus hover:shadow-[0_0_18px_rgba(255,46,166,0.4)]"
            onClick={onOpenCall}
            title="Video call"
          >
            <Phone size={17} />
          </motion.button>
        )}
        {kind === 'dm' && (
          <div className="relative">
            <button
              className={`p-2 rounded-lg ${muted ? 'text-amber' : 'text-slate-400 hover:text-white'}`}
              onClick={() => setMenuOpen((v) => !v)}
              title="Opsi percakapan"
            >
              <MoreVertical size={18} />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onPointerDown={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-30 glass hud-corner rounded-xl py-1.5 w-52">
                  <button
                    onClick={() => { setMenuOpen(false); onToggleBlock?.(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 text-slate-200"
                  >
                    <Ban size={14} className={peerBlocked ? 'text-lime' : 'text-virus'} />
                    {peerBlocked ? 'Buka blokir' : 'Blokir pengguna'}
                  </button>
                  <button
                    onClick={() => { setMenuOpen(false); onToggleMute?.(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 text-slate-200"
                  >
                    {muted ? <BellOff size={14} className="text-amber" /> : <Bell size={14} className="text-amber" />}
                    {muted ? 'Aktifkan notif' : 'Bisukan'}
                  </button>
                  {peerId && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        const reason = window.prompt('Alasan lapor (mis. spam / pelecehan / ujaran kebencian):')?.trim();
                        if (!reason) return;
                        void (async () => {
                          try {
                            await rpcReportUser(peerId, reason);
                            appNotify('LAPORAN TERKIRIM', 'Master akan meninjau laporan ini.', { icon: '🚨' });
                          } catch (e) {
                            appNotify('GAGAL LAPOR', e instanceof Error ? e.message : String(e), { icon: '⚠️' });
                          }
                        })();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10 text-virus"
                    >
                      <ShieldAlert size={14} />
                      Lapor ke Master
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {searching && (
        <div className="px-3 py-2 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="cari di percakapan ini..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 focus:border-neon/60 text-sm text-white placeholder-slate-500"
            />
            <span className="text-xs font-mono text-slate-500 shrink-0">
              {q.trim() ? `${searchMap.size} hasil` : ''}
            </span>
            <button className="p-1.5 text-slate-400 hover:text-white shrink-0" onClick={() => { setQ(''); setSearching(false); }} title="Tutup">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {groupInfo && (
        <div className="px-4 py-2 text-xs font-mono text-slate-400 bg-arc/10 border-b border-arc/30">
          Grup {messages.length} pesan • semua pesan dienkripsi dengan group-key AES-256 (kunci dibagikan antar
          member via ECDH).
        </div>
      )}

      {}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onContextMenu={antiSadapEnabled() ? (e) => e.preventDefault() : undefined}
        className={`flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-1 relative ${antiSadapEnabled() ? 'anti-sadap-copy' : ''}`}
        style={bgCss ? { background: bgCss, backgroundAttachment: 'fixed' } : undefined}
      >
        {messages.length === 0 && !searching && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <div className="text-4xl mb-3">🔐</div>
            <div className="font-mono text-sm">Kanal terenkripsi. Kirim pesan pertama.</div>
            <div className="font-mono text-xs text-neon/60 mt-2">AES-256-GCM // E2E</div>
          </div>
        )}
        {searching && q.trim() && searchMap.size === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <div className="font-mono text-sm">Tidak ada pesan cocok untuk "{q}".</div>
          </div>
        )}
        {displayList.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            keyObj={keyObj}
            isMine={m.sender_id === me?.id}
            senderName={m.username ?? 'user'}
            senderId={m.sender_id}
            senderAvatar={userAvatars?.[m.sender_id]}
            replyPreview={previews[m.id]}
            reactions={reactions[m.id] ?? []}
            ghostOn={ghostOn}
            readAt={m.read_at ?? null}
            userNames={userNames}
            onReply={() =>
              setReplyingTo({
                id: m.id,
                preview: previews[m.id] ?? (m.msg_type === 'text' ? '[🔒]' : `[${m.msg_type}]`),
              })
            }
            onReact={(emoji) => onReact(m.id, emoji)}
            onEdit={(text) => onEdit(m.id, text)}
            onDelete={() => onDelete(m.id)}
            onRetry={() => onRetry(m)}
            onForward={onForward ? () => onForward(m) : undefined}
          />
        ))}
        {typing.length > 0 && !searching && (
          <div className="px-3">
            <TypingDots label={`${typing.join(', ')}`} />
          </div>
        )}
        {showJump && (
          <button
            onClick={jumpToBottom}
            className="absolute bottom-4 right-4 z-10 p-2.5 rounded-full bg-neon/90 text-black border border-neon shadow-[0_0_16px_rgba(0,240,255,0.5)]"
            title="Ke pesan terbaru"
          >
            <ChevronDown size={18} />
          </button>
        )}
      </div>

      {onCycleDisappear && (
        <div className="px-2 pt-1 flex justify-end">
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono transition ${
              disappearSecs > 0
                ? 'border-amber/40 bg-amber/10 text-amber hover:bg-amber/20'
                : 'border-white/10 text-slate-500 hover:text-white'
            }`}
            onClick={onCycleDisappear}
            title={`Pesan sementara: ${disappearLabel(disappearSecs)}`}
          >
            <Timer size={12} />
            {disappearSecs > 0 ? `hilang ${disappearLabel(disappearSecs)}` : 'pesan sementara: off'}
          </button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="px-2 pt-2 flex gap-2 flex-wrap">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => onSendText(s)}
              className="px-3 py-1.5 rounded-full border border-lime/40 bg-lime/10 text-lime text-xs hover:bg-lime/20 transition-colors"
              title="Balasan cerdas (AI offline)"
            >
              ✦ {s}
            </button>
          ))}
        </div>
      )}

      <ChatInput
        conversationKey={convKey}
        isGroup={kind === 'group'}
        onSend={(text, rid) => {
          onSendText(text, rid);
          setReplyingTo(null);
        }}
        onMedia={(file, rid) => {
          onSendMedia(file, rid);
          setReplyingTo(null);
        }}
        replyingTo={replyingTo}
        cancelReply={() => setReplyingTo(null)}
        disabled={groupLocked === true}
      />

      {summary !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSummary(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative glass hud-corner rounded-2xl p-5 max-w-lg w-full max-h-[72vh] overflow-y-auto"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={15} className="text-lime" />
              <span className="font-mono text-xs tracking-widest text-lime">RINGKASAN AI // OFFLINE</span>
            </div>
            <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{summary}</div>
            <button
              onClick={() => setSummary(null)}
              className="mt-4 w-full py-2.5 rounded-lg bg-white/10 text-slate-200 text-sm font-mono hover:bg-white/20"
            >
              TUTUP
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
}
