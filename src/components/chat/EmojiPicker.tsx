const REACT = ['👍', '❤️', '😂', '😮', '😢', '🔥', '💀', '😭', '🥵', '👀', '🤝', '🥳'];
const FULL = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤩', '😇', '😜', '🤪', '🤔', '🤨',
  '😴', '😭', '😤', '😡', '🤯', '🥺', '😳', '🫠', '🫡', '💀', '👻', '🤖', '👽', '💩',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '👀', '🫶', '❤️', '🧡', '💛', '💚', '💙', '💜',
  '🔥', '⚡', '✨', '🎉', '🚀', '🛸', '💾', '🔒', '📸', '🎥', '🎮', '🍕', '☕', '🍻',
  '🤍', '🖤', '🐺', '🦅', '🐉', '🌙', '⭐', '🎬', '📡', '🧠',
];

export default function EmojiPicker({
  onPick,
  reaction,
  onClose,
  align = 'right',
}: {
  onPick: (e: string) => void;
  reaction?: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
}) {
  const list = reaction ? REACT : FULL;
  return (
    <div
      className={`absolute bottom-full mb-2 ${align === 'left' ? 'left-0' : 'right-0'} z-40 glass rounded-xl p-2 w-72 max-w-[calc(100vw-1.5rem)] hud-corner`}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="font-mono text-[10px] text-neon tracking-widest">
          {reaction ? 'REACT //' : 'EMOJI //'}
        </span>
        <button className="text-slate-500 hover:text-neon text-xs" onClick={onClose}>x</button>
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
        {list.map((e) => (
          <button
            key={e}
            className="text-xl hover:bg-white/10 rounded-md p-0.5 transition-colors"
            onClick={() => onPick(e)}
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
