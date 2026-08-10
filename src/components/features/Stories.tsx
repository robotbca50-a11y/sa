import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Eye } from 'lucide-react';
import { rpcAddStory, rpcGetStories, rpcGetMyStories, rpcViewStory, rpcStoryViews, rpcDeleteStory, uploadMedia, mediaUrl } from '../../lib/api';
import { subscribeStories } from '../../lib/realtime';
import { useStore } from '../../lib/store';
import Avatar from '../Avatar';
import type { Story } from '../../types';

export default function Stories() {
  const me = useStore((s) => s.me);
  const [stories, setStories] = useState<Story[]>([]);
  const [mine, setMine] = useState<Story[]>([]);
  const [viewer, setViewer] = useState<{ owner: string; ownerName: string; list: Story[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
    const sub = subscribeStories(() => refresh());
    return () => {
      sub.unsubscribe();
    };
  }, []);

  async function refresh() {
    const [all, my] = await Promise.all([rpcGetStories(), rpcGetMyStories(me!.id)]);
    setStories(all);
    setMine(my);
  }

  async function addStory(file: File) {
    const kind = file.type.startsWith('video/') ? 'video' : 'image';
    const path = `stories/${crypto.randomUUID()}`;
    await uploadMedia('chat-media', path, file, me!.id);
    await rpcAddStory(me!.id, path, '', kind);
    refresh();
  }

  const grouped = new Map<string, Story[]>();
  stories.forEach((s) => {
    if (s.user_id === me?.id) return;
    const arr = grouped.get(s.user_id) ?? [];
    arr.push(s);
    grouped.set(s.user_id, arr);
  });

  return (
    <div className="p-3">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addStory(f);
          e.target.value = '';
        }}
      />
      <div className="flex gap-3 overflow-x-auto py-1 px-1">
        <div className="flex flex-col items-center gap-1 shrink-0">
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-[64px] h-[64px] rounded-full border-2 border-dashed border-neon/60 flex items-center justify-center text-neon hover:bg-neon/10 transition-colors"
            title="Buat story"
          >
            <Plus size={26} />
          </button>
          <span className="text-[10px] font-mono text-slate-500">KAMU</span>
        </div>

        {mine.length > 0 && (
          <button
            onClick={() => setViewer({ owner: me!.id, ownerName: 'Kamu', list: mine })}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <Avatar id={me!.id} name={me!.username} size={64} story />
            <span className="text-[10px] font-mono text-neon">{mine.length}</span>
          </button>
        )}

        {[...grouped.entries()].map(([uid, list]) => (
          <button
            key={uid}
            onClick={() => setViewer({ owner: uid, ownerName: list[0].username ?? 'user', list })}
            className="flex flex-col items-center gap-1 shrink-0"
          >
            <Avatar id={uid} name={list[0].username ?? 'user'} size={64} story />
            <span className="text-[10px] font-mono text-slate-400 max-w-[64px] truncate">
              {list[0].username}
            </span>
          </button>
        ))}
      </div>

      {viewer && (
        <StoryViewer
          owner={viewer.owner}
          ownerName={viewer.ownerName}
          list={viewer.list}
          onClose={() => setViewer(null)}
          onChanged={refresh}
          isMine={viewer.owner === me!.id}
        />
      )}
    </div>
  );
}

function StoryViewer({
  owner,
  ownerName,
  list,
  onClose,
  onChanged,
  isMine,
}: {
  owner: string;
  ownerName: string;
  list: Story[];
  onClose: () => void;
  onChanged: () => void;
  isMine: boolean;
}) {
  const me = useStore((s) => s.me);
  const [idx, setIdx] = useState(0);
  const [views, setViews] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const story = list[idx];
  const isVideo = story?.kind === 'video';

  useEffect(() => {
    setProgress(0);
    if (isMine) {
      rpcStoryViews(story.id).then(setViews).catch(() => {});
    } else {
      rpcViewStory(story.id, me!.id).catch(() => {});
    }
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [idx, story.id]);

  useEffect(() => {
    if (isVideo) return;
    const iv = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(iv);
          setTimeout(next, 250);
          return 100;
        }
        return p + 1;
      });
    }, 60);
    return () => clearInterval(iv);
  }, [idx, isVideo]);

  function next() {
    if (idx < list.length - 1) setIdx(idx + 1);
    else onClose();
  }
  function prev() {
    if (idx > 0) setIdx(idx - 1);
  }

  function deleteStory() {
    rpcDeleteStory(story.id, me!.id)
      .then(() => {
        onChanged();
        onClose();
      })
      .catch(() => {});
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="relative w-full max-w-md h-full max-h-[92vh] flex flex-col overflow-x-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-1 p-3 pt-4">
          {list.map((_, i) => (
            <div key={i} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full bg-neon"
                style={{ width: i < idx ? '100%' : i === idx ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-3">
          <Avatar id={owner} name={ownerName} size={34} />
          <div className="text-sm text-white font-medium">{isMine ? 'Story kamu' : ownerName}</div>
          <div className="ml-auto flex items-center gap-2">
            {isMine && (
              <>
                <button onClick={deleteStory} className="text-virus" title="Hapus">
                  <Trash2 size={17} />
                </button>
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                  <Eye size={13} /> {views.length}
                </span>
              </>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-3 min-h-0">
          {story && isVideo ? (
            <video
              ref={videoRef}
              src={mediaUrl('chat-media', story.media_path)}
              autoPlay
              loop
              playsInline
              onTimeUpdate={(e) => {
                const v = e.currentTarget;
                if (v.duration) setProgress((v.currentTime / v.duration) * 100);
              }}
              onEnded={next}
              className="max-h-full max-w-full rounded-xl"
            />
          ) : story ? (
            <img src={mediaUrl('chat-media', story.media_path)} alt="" className="max-h-full max-w-full rounded-xl" />
          ) : null}
        </div>

        {story?.caption && <div className="px-4 pb-3 text-center text-slate-300">{story.caption}</div>}

        <div className="absolute inset-x-0 bottom-0 top-0 grid grid-cols-2">
          <button onClick={prev} className="w-full" />
          <button onClick={next} className="w-full" />
        </div>
      </div>
    </motion.div>
  );
}
