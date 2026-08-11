import { useState } from 'react';
import { Plus, Search, MessageSquarePlus, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import Avatar, { avatarUrl } from '../Avatar';
import type { ConversationItem } from '../../types';

function fmtTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

export default function ConversationList({
  items,
  activeKey,
  onSelect,
  onNewChat,
  onNewGroup,
  ghostOn,
}: {
  items: ConversationItem[];
  activeKey: string | null;
  onSelect: (i: ConversationItem) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  ghostOn: boolean;
}) {
  const [q, setQ] = useState('');
  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="cari percakapan..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:border-neon/60 text-sm text-white placeholder-slate-500 transition-colors"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onNewChat}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-neon/10 border border-neon/30 text-neon text-xs font-mono tracking-wider hover:bg-neon/20 transition-colors"
          >
            <MessageSquarePlus size={14} /> DM
          </button>
          <button
            onClick={onNewGroup}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-arc/15 border border-arc/40 text-arc-lighter text-xs font-mono tracking-wider hover:bg-arc/25 transition-colors"
            style={{ color: '#a78bfa' }}
          >
            <Users size={14} /> GRUP
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-slate-600 font-mono text-xs mt-10">tidak ada kanal</div>
        )}
        {filtered.map((it) => {
          const isActive = it.key === activeKey;
          return (
            <motion.button
              key={it.key}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(it)}
              className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors border-l-2 ${
                isActive ? 'bg-neon/10 border-neon' : 'border-transparent hover:bg-white/5'
              }`}
            >
              <div className="relative">
                <Avatar id={it.kind === 'dm' ? it.id! : `group:${it.name}`} name={it.name} size={46} online={it.kind === 'dm' ? it.online : undefined} ghostOn={it.kind === 'dm' ? ghostOn : false} src={it.kind === 'dm' ? avatarUrl(it.avatar) : undefined} />
                {it.kind === 'group' && (
                  <span className="absolute -bottom-1 -right-1 bg-arc rounded-md p-0.5 border border-abyss">
                    <Users size={8} className="text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white text-sm truncate">{it.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{fmtTime(it.lastAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className="text-xs text-slate-500 truncate flex items-center gap-1">
                    {it.kind === 'group' && <span className="text-arc-lighter" style={{ color: '#a78bfa' }}>#</span>}
                    {it.lastMsg || (it.kind === 'group' ? 'Grup terenkripsi' : 'Terhubung via ECDH')}
                  </span>
                  {it.unread ? (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-virus text-white text-[10px] font-mono flex items-center justify-center">
                      {it.unread}
                    </span>
                  ) : it.kind === 'dm' && it.online ? (
                    <span className="w-2 h-2 rounded-full bg-lime shrink-0 animate-pulse" />
                  ) : null}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
