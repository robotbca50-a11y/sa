import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Phone, UserPlus, Lock, Info, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import TypingDots from './TypingDots';
import Avatar from '../Avatar';
import type { Msg, Reaction } from '../../types';
import { decodeMessage } from '../../lib/decrypt';
import { rpcGetMessage, rpcGetGroupMessage } from '../../lib/api';
import { useStore } from '../../lib/store';

export default function Conversation({
  kind,
  title,
  convKey,
  peerId,
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
  onAddMember,
  groupLocked,
  userNames,
  onBack,
}: {
  kind: 'dm' | 'group';
  title: string;
  convKey: string;
  peerId?: string;
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
  onAddMember?: () => void;
  groupLocked?: boolean;
  userNames: Record<string, string>;
  onBack: () => void;
}) {
  const me = useStore((s) => s.me);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; preview: string } | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [groupInfo, setGroupInfo] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, typing.length]);

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
      {/* header */}
      <header className="flex items-center gap-3 px-3 sm:px-4 py-3 border-b border-white/10 bg-panel/80 backdrop-blur-xl">
        <button className="lg:hidden text-slate-400" onClick={onBack} title="Kembali">
          <ArrowLeft size={20} />
        </button>
        <div className="relative">
          <Avatar id={kind === 'dm' ? peerId! : `group:${title}`} name={title} size={40} online={kind === 'dm' ? online : undefined} />
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
              <span className="text-slate-500">offline</span>
            ) : (
              <span className="text-slate-500 flex items-center gap-1">
                <Lock size={10} className="text-lime" /> {groupLocked ? 'E2E aktif' : 'membuka kunci...'}
              </span>
            )}
          </div>
        </div>
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
      </header>

      {groupInfo && (
        <div className="px-4 py-2 text-xs font-mono text-slate-400 bg-arc/10 border-b border-arc/30">
          Grup {messages.length} pesan • semua pesan dienkripsi dengan group-key AES-256 (kunci dibagikan antar
          member via ECDH).
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-3 space-y-1 relative">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-slate-600">
            <div className="text-4xl mb-3">🔐</div>
            <div className="font-mono text-sm">Kanal terenkripsi. Kirim pesan pertama.</div>
            <div className="font-mono text-xs text-neon/60 mt-2">AES-256-GCM // E2E</div>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            msg={m}
            keyObj={keyObj}
            isMine={m.sender_id === me?.id}
            senderName={m.username ?? 'user'}
            senderId={m.sender_id}
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
          />
        ))}
        {typing.length > 0 && (
          <div className="px-3">
            <TypingDots label={`${typing.join(', ')}`} />
          </div>
        )}
      </div>

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
    </div>
  );
}
