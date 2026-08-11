import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CornerUpLeft, Smile, Pencil, Trash2, Lock, Clock, Music, RotateCcw, Upload, AlertTriangle } from 'lucide-react';
import { decodeMessage, evictCache } from '../../lib/decrypt';
import type { Msg, Reaction } from '../../types';
import Avatar from '../Avatar';
import EmojiPicker from './EmojiPicker';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Reaksi cepat ala WhatsApp/IG: tahan lama pesan → muncul bar ini.
const REACT_QUICK = ['❤️', '👍', '😂', '😮', '😢', '😭', '🔥', '🥳'];

export default function MessageBubble({
  msg,
  keyObj,
  isMine,
  senderName,
  senderId,
  replyPreview,
  reactions,
  ghostOn,
  readAt,
  userNames,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onRetry,
}: {
  msg: Msg;
  keyObj: CryptoKey;
  isMine: boolean;
  senderName: string;
  senderId: string;
  replyPreview?: string | null;
  reactions: Reaction[];
  ghostOn: boolean;
  readAt?: string | null;
  userNames: Record<string, string>;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onRetry: () => void;
}) {
  const [decoded, setDecoded] = useState<{ text: string; mediaUrl: string | null; mediaMime: string } | null>(null);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [swipe, setSwipe] = useState(0);
  const [quick, setQuick] = useState(false);

  // gesture state
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);
  const longFiredRef = useRef(false);
  const swipeDoneRef = useRef(false);
  const longTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef(0);

  useEffect(() => {
    if (msg.deleted) return;
    let live = true;
    setDecodeFailed(false);
    decodeMessage(msg, keyObj).then(
      (d) => live && setDecoded(d),
      () => live && setDecodeFailed(true),
    );
    return () => {
      live = false;
    };
  }, [msg, keyObj]);

  useEffect(() => {
    return () => {
      if (longTimerRef.current) window.clearTimeout(longTimerRef.current);
    };
  }, []);

  // ---------- GESTURE: swipe kanan = balas, tahan = reaksi, dobel tap = ❤️ ----------
  function gDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button, a, textarea, input, video, audio, .no-gesture')) return;
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    longFiredRef.current = false;
    swipeDoneRef.current = false;
    setSwipe(0);
    if (longTimerRef.current) window.clearTimeout(longTimerRef.current);
    longTimerRef.current = window.setTimeout(() => {
      if (startRef.current && !movedRef.current) {
        longFiredRef.current = true;
        setQuick(true);
      }
    }, 420);
  }

  function gMove(e: React.PointerEvent) {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dy) > Math.abs(dx) + 6 && Math.abs(dy) > 8) {
      if (longTimerRef.current) {
        window.clearTimeout(longTimerRef.current);
        longTimerRef.current = null;
      }
      startRef.current = null;
      setSwipe(0);
      return;
    }
    if (Math.abs(dx) > 8) {
      movedRef.current = true;
      if (longTimerRef.current) {
        window.clearTimeout(longTimerRef.current);
        longTimerRef.current = null;
      }
    }
    if (dx > 12 && !swipeDoneRef.current) {
      setSwipe(Math.min(64, dx * 0.5));
      if (dx > 56) {
        swipeDoneRef.current = true;
        setSwipe(0);
        onReply();
      }
    }
  }

  function gUp() {
    const hadStart = startRef.current != null;
    const wasLong = longFiredRef.current;
    if (longTimerRef.current) {
      window.clearTimeout(longTimerRef.current);
      longTimerRef.current = null;
    }
    startRef.current = null;
    setSwipe(0);
    if (swipeDoneRef.current) {
      swipeDoneRef.current = false;
      return;
    }
    if (wasLong || !hadStart || movedRef.current) return;
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      onReact('❤️');
    } else {
      lastTapRef.current = now;
    }
  }

  if (msg.deleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 my-1`}>
        <div className="text-xs font-mono text-slate-600 italic border border-white/5 rounded-lg px-3 py-1.5 bg-black/20">
          🗑 Pesan dihapus
        </div>
      </div>
    );
  }

  const groupedReactions = reactions.reduce<Record<string, { count: number; names: string[] }>>((acc, r) => {
    acc[r.emoji] = acc[r.emoji] ?? { count: 0, names: [] };
    acc[r.emoji].count += 1;
    const n = userNames[r.user_id] ?? r.user_id.slice(0, 6);
    if (!acc[r.emoji].names.includes(n)) acc[r.emoji].names.push(n);
    return acc;
  }, {});

  const reactorNames = Array.from(new Set(reactions.map((r) => userNames[r.user_id] ?? r.user_id.slice(0, 6))));
  const showName = !isMine && senderName;
  const displayName = senderName;
  const status = isMine ? (msg.pending ? 'sending' : msg.failed ? 'failed' : readAt ? 'read' : 'sent') : 'none';
  const isMedia = msg.msg_type !== 'text';
  const mediaState: 'uploading' | 'failed' | 'ready' | 'missing' | null = isMedia
    ? (msg.media_status === 'uploading'
        ? 'uploading'
        : msg.media_status === 'failed'
          ? 'failed'
          : msg.media_path
            ? 'ready'
            : 'missing')
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={`relative flex ${isMine ? 'justify-end' : 'justify-start'} px-3 my-1 group select-none`}
      style={{ touchAction: 'pan-y' }}
    >
      {swipe > 8 && (
        <div
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 glass rounded-full px-2.5 py-1.5 text-neon font-mono text-xs pointer-events-none whitespace-nowrap"
          style={{ opacity: Math.min(1, swipe / 40) }}
        >
          <CornerUpLeft size={13} /> Balas
        </div>
      )}

      {quick && (
        <div className="fixed inset-0 z-30" onPointerDown={() => setQuick(false)} />
      )}

      <div
        className={`max-w-[94%] sm:max-w-[85%] lg:max-w-[78%] relative transition-transform duration-150`}
        style={swipe ? { transform: `translateX(${swipe}px)`, transition: 'none' } : undefined}
        onPointerDown={gDown}
        onPointerMove={gMove}
        onPointerUp={gUp}
        onPointerCancel={gUp}
        onPointerLeave={() => {
          if (longTimerRef.current) {
            window.clearTimeout(longTimerRef.current);
            longTimerRef.current = null;
          }
          startRef.current = null;
          setSwipe(0);
        }}
      >
        {quick && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 glass rounded-full px-2 py-1.5 hud-corner whitespace-nowrap max-w-[calc(100vw-1rem)] overflow-x-auto">
            {REACT_QUICK.map((e) => (
              <button
                key={e}
                className="text-2xl hover:scale-125 transition-transform shrink-0"
                onClick={() => {
                  onReact(e);
                  setQuick(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {!isMine && (
          <div className="flex items-center gap-1.5 mb-0.5 pl-1">
            <Avatar id={senderId} name={senderName} size={16} />
            <span className="text-[10px] font-mono text-slate-400">{displayName}</span>
          </div>
        )}

        <div
          className={`relative bubble rounded-2xl px-3.5 py-2.5 border ${
            isMine
              ? 'bg-neon/10 border-neon/30 text-neon-foreground rounded-br-md'
              : 'bg-white/5 border-white/10 rounded-bl-md'
          }`}
        >
          {replyPreview && (
            <button
              className="block w-full text-left mb-1.5 px-2 py-1 rounded-md bg-black/30 border-l-2 border-neon/60 text-xs text-slate-400 truncate no-gesture"
              title={replyPreview}
            >
              ↳ {replyPreview}
            </button>
          )}

          {mediaState === 'uploading' ? (
            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono min-w-[200px]">
              <Upload size={13} className="animate-pulse text-neon shrink-0" />
              <span className="truncate">
                {isMine ? `Mengirim media${msg.uploadPct != null ? `… ${msg.uploadPct}%` : '…'}` : 'Menerima media…'}
              </span>
              {isMine && msg.uploadPct != null && msg.uploadPct > 0 && (
                <span className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden min-w-[70px]">
                  <span
                    className="block h-full bg-neon rounded-full transition-all"
                    style={{ width: `${msg.uploadPct}%` }}
                  />
                </span>
              )}
            </div>
          ) : mediaState === 'failed' ? (
            <div className="flex items-center gap-2 text-xs text-virus/80 font-mono">
              <AlertTriangle size={13} />
              {isMine ? 'Gagal mengirim media' : 'Media tidak tersedia'}
            </div>
          ) : mediaState === 'missing' ? (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <Lock size={12} /> Media belum tersedia
            </div>
          ) : decoded?.mediaUrl ? (
            decoded.mediaMime.startsWith('audio/') ? (
              <div className="flex items-center gap-2 py-1 min-w-0 max-w-full">
                <Music size={16} className="text-virus shrink-0" />
                <audio
                  src={decoded.mediaUrl}
                  controls
                  className="h-10 rounded-lg min-w-0 flex-1 max-w-full"
                />
              </div>
            ) : decoded.mediaMime.startsWith('video/') ? (
              <video
                src={decoded.mediaUrl}
                autoPlay
                loop
                playsInline
                controls
                className="rounded-xl max-h-[340px] w-auto max-w-full cursor-pointer"
              />
            ) : (
              <img
                src={decoded.mediaUrl}
                alt=""
                className="rounded-xl max-h-[340px] w-auto max-w-full cursor-pointer"
              />
            )
          ) : decoded?.text ? (
            <div className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-white">
              {editing ? (
                <textarea
                  value={editText}
                  autoFocus
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onEdit(editText);
                      setEditing(false);
                    }
                  }}
                  className="w-full bg-black/40 border border-neon/50 rounded-lg px-2 py-1 text-white resize-none no-gesture"
                />
              ) : (
                decoded.text
              )}
            </div>
          ) : decodeFailed ? (
            <div className="flex items-center gap-2 text-xs text-virus/80 font-mono">
              <Lock size={12} /> [🔒 Tidak dapat dibaca]
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
              <Lock size={12} /> Mendekripsi...
            </div>
          )}

          <div className="flex items-center gap-1 justify-end mt-1">
            {msg.edited_at && <span className="text-[9px] text-slate-500 font-mono">EDIT</span>}
            <span className="text-[9px] text-slate-500 font-mono">{fmtTime(msg.created_at)}</span>
            {status === 'sending' && (
              <span className="flex items-center text-slate-400" title="Mengirim...">
                <Clock size={11} />
              </span>
            )}
            {status === 'sent' && (
              <span className="text-slate-400 font-mono text-[9px]" title="Terkirim">✓✓</span>
            )}
            {status === 'read' && (
              <span className="text-[#1dd1a1] font-mono text-[9px]" title="Dibaca">✓✓</span>
            )}
            {status === 'failed' && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1 text-[9px] font-mono text-virus hover:text-white"
                title="Kirim ulang"
              >
                <RotateCcw size={10} /> GAGAL
              </button>
            )}
          </div>
        </div>

        {Object.keys(groupedReactions).length > 0 && (
          <div className="-mt-2.5 relative z-10 px-1">
            <div className="flex gap-1">
              {Object.entries(groupedReactions).map(([emoji, g]) => (
                <button
                  key={emoji}
                  onClick={() => onReact(emoji)}
                  title={g.names.join(', ')}
                  className="flex items-center gap-0.5 text-xs bg-panel border border-neon/30 rounded-full px-1.5 py-0.5 hover:border-neon/70"
                >
                  {emoji} <span className="text-slate-400 font-mono">{g.count}</span>
                </button>
              ))}
            </div>
            <div className="text-[9px] text-slate-500 font-mono mt-0.5 px-1 truncate">
              {reactorNames.join(' • ')}
            </div>
          </div>
        )}

        {/* hover menu (desktop) */}
        <div
          className={`absolute ${isMine ? 'left-full' : 'right-full'} top-0 ml-2 mr-2 hidden group-hover:flex flex-col gap-0.5 glass rounded-lg p-1 z-20`}
        >
          <button className="p-1.5 rounded hover:bg-white/10 text-slate-300" onClick={() => setPicker((v) => !v)} title="React">
            <Smile size={14} />
          </button>
          <button className="p-1.5 rounded hover:bg-white/10 text-slate-300" onClick={onReply} title="Balas">
            <CornerUpLeft size={14} />
          </button>
          {isMine && !decoded?.mediaUrl && (
            <button
              className="p-1.5 rounded hover:bg-white/10 text-slate-300"
              onClick={() => {
                setEditing(true);
                setEditText(decoded?.text ?? '');
              }}
              title="Edit"
            >
              <Pencil size={14} />
            </button>
          )}
          {isMine && (
            <button className="p-1.5 rounded hover:bg-virus/20 text-virus" onClick={onDelete} title="Hapus">
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {picker && (
          <EmojiPicker
            reaction
            align={isMine ? 'right' : 'left'}
            onPick={(e) => {
              onReact(e);
              setPicker(false);
            }}
            onClose={() => setPicker(false)}
          />
        )}
      </div>
    </motion.div>
  );
}

export function clearMsgCache(id: string) {
  evictCache(id);
}
