import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CornerUpLeft, Smile, Pencil, Trash2, Lock, Clock, Music, RotateCcw } from 'lucide-react';
import { decodeMessage, evictCache } from '../../lib/decrypt';
import type { Msg, Reaction } from '../../types';
import Avatar from '../Avatar';
import EmojiPicker from './EmojiPicker';

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.18 }}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 my-1 group`}
    >
      <div className={`max-w-[94%] sm:max-w-[85%] lg:max-w-[78%] relative`}>
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
              className="block w-full text-left mb-1.5 px-2 py-1 rounded-md bg-black/30 border-l-2 border-neon/60 text-xs text-slate-400 truncate"
              title={replyPreview}
            >
              ↳ {replyPreview}
            </button>
          )}

          {decoded?.mediaUrl ? (
            decoded.mediaMime.startsWith('audio/') ? (
              <div className="flex items-center gap-2 py-1 min-w-[200px] max-w-full">
                <Music size={16} className="text-virus shrink-0" />
                <audio
                  src={decoded.mediaUrl}
                  controls
                  className="h-10 rounded-lg min-w-0 flex-1"
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
                  className="w-full bg-black/40 border border-neon/50 rounded-lg px-2 py-1 text-white resize-none"
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

        {/* hover menu */}
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
