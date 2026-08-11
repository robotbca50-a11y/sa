import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { SUPABASE_URL } from '../lib/supabase';

const PALETTE = [
  '#00f0ff', '#ff2ea6', '#7c3aed', '#b6ff2e', '#ff9f43', '#54a0ff', '#f368e0', '#1dd1a1',
];

export function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function ghostHandle(userId: string, username: string, ghostOn: boolean, ghostInterval: number, now = Date.now()) {
  if (!ghostOn) return username;
  const slot = Math.floor(now / 1000 / Math.max(5, ghostInterval));
  return `#${hashColor(userId + slot).replace('#', '')}`;
}

export function avatarUrl(path?: string | null) {
  if (!path) return undefined;
  return `${SUPABASE_URL}/storage/v1/object/public/${path}`;
}

export default function Avatar({
  id,
  name,
  size = 42,
  online,
  story,
  ghostOn,
  src,
}: {
  id: string;
  name: string;
  size?: number;
  online?: boolean;
  story?: boolean;
  ghostOn?: boolean;
  src?: string;
}) {
  const ghostInterval = useStore((s) => s.ghostInterval);
  const color = hashColor(id);

  const initials = useMemo(() => {
    const clean = ghostHandle(id, name, !!ghostOn, ghostInterval).replace(/[^a-z0-9#]/gi, '');
    return clean.slice(0, ghostOn ? 5 : 2).toUpperCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, name, ghostOn, ghostInterval]);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {story && (
        <span
          className="absolute -inset-[3px] rounded-full"
          style={{
            background: 'conic-gradient(#00f0ff,#ff2ea6,#7c3aed,#00f0ff)',
            filter: 'drop-shadow(0 0 6px rgba(0,240,255,.5))',
          }}
        />
      )}
      <div
        className="relative w-full h-full rounded-full flex items-center justify-center font-mono font-semibold overflow-hidden"
        style={{
          background: src ? '#0b0f14' : `linear-gradient(135deg, ${color}33, ${color}55)`,
          border: `1.5px solid ${color}aa`,
          color: color,
          fontSize: size * 0.36,
          textShadow: `0 0 8px ${color}88`,
          boxShadow: `0 0 14px ${color}44`,
        }}
      >
        {src ? (
          <img src={src} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {online !== undefined && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-abyss"
          style={{
            width: Math.max(10, size * 0.26),
            height: Math.max(10, size * 0.26),
            background: online ? '#1dd1a1' : '#48515f',
            boxShadow: online ? '0 0 8px #1dd1a1' : 'none',
          }}
        />
      )}
    </div>
  );
}
