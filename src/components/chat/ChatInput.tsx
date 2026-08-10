import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Smile, X, ImagePlus, Paperclip, Mic, MicOff } from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import { useTypingPing } from './TypingDots';

function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
}

export default function ChatInput({
  onSend,
  onMedia,
  replyingTo,
  cancelReply,
  disabled,
  conversationKey,
  isGroup,
}: {
  onSend: (text: string, replyToId?: string | null) => void;
  onMedia: (file: File, replyToId?: string | null) => void;
  replyingTo?: { id: string; preview: string } | null;
  cancelReply: () => void;
  disabled?: boolean;
  conversationKey: string;
  isGroup: boolean;
}) {
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recErr, setRecErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recIvRef = useRef<number | null>(null);
  const recStartRef = useRef(0);

  useTypingPing(conversationKey, isGroup, text.length > 0 && !disabled);

  useEffect(() => {
    return () => {
      if (recIvRef.current) clearInterval(recIvRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRec() {
    if (disabled || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const dur = (Date.now() - recStartRef.current) / 1000;
        if (dur < 0.4) return;
        const ext = type.includes('mp4') ? 'm4a' : 'webm';
        onMedia(new File([blob], `voice-${Date.now()}.${ext}`, { type }), replyingTo?.id ?? null);
      };
      mr.start();
      mediaRecRef.current = mr;
      recStartRef.current = Date.now();
      setRecSec(0);
      setRecording(true);
      recIvRef.current = window.setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      setRecErr('Mikrofon/izin audio tidak tersedia.');
      setTimeout(() => setRecErr(''), 3000);
    }
  }

  function stopRec() {
    if (!recording) return;
    if (recIvRef.current) {
      clearInterval(recIvRef.current);
      recIvRef.current = null;
    }
    setRecording(false);
    mediaRecRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            onMedia(f, replyingTo?.id ?? null);
          }
        }
      }
    };
    const ta = taRef.current;
    ta?.addEventListener('paste', onPaste);
    return () => ta?.removeEventListener('paste', onPaste);
  }, [onMedia]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(140, ta.scrollHeight) + 'px';
  }, [text]);

  function submit() {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t, replyingTo?.id ?? null);
    setText('');
    cancelReply();
  }

  return (
    <div className="pb-safe relative border-t border-white/10 bg-panel/70 backdrop-blur-xl px-3 pt-2.5">
      {replyingTo && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 rounded-lg bg-neon/10 border border-neon/30">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-mono text-neon tracking-widest">MEMBALAS</div>
            <div className="text-sm text-slate-300 truncate">{replyingTo.preview}</div>
          </div>
          <button className="text-slate-400 hover:text-virus" onClick={cancelReply}>
            <X size={16} />
          </button>
        </div>
      )}

      {(recording || recErr) && (
        <div className="mb-2 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-virus/10 border border-virus/30 font-mono text-xs">
          {recording ? (
            <>
              <span className="w-2 h-2 rounded-full bg-virus animate-pulse" />
              <span className="text-virus">Merekam {recSec}s — lepas untuk kirim</span>
            </>
          ) : (
            <span className="text-slate-400">{recErr}</span>
          )}
        </div>
      )}

      <div className="flex items-end gap-2 min-w-0">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onMedia(f);
            e.target.value = '';
          }}
        />
        <button
          className={`shrink-0 p-2.5 rounded-lg transition-colors ${
            recording
              ? 'bg-virus/25 text-virus border border-virus/60 shadow-[0_0_18px_rgba(255,46,166,0.5)]'
              : 'text-slate-400 hover:text-virus hover:bg-white/5'
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            startRec();
          }}
          onPointerUp={stopRec}
          onPointerLeave={stopRec}
          onPointerCancel={stopRec}
          disabled={disabled || text.trim().length > 0}
          title="Tahan untuk rekam voice note"
        >
          {recording ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <button
          className="shrink-0 p-2.5 rounded-lg text-slate-400 hover:text-neon hover:bg-white/5 transition-colors"
          onClick={() => fileRef.current?.click()}
          title="Kirim foto/video/GIF"
        >
          <ImagePlus size={20} />
        </button>
        <button
          className="shrink-0 p-2.5 rounded-lg text-slate-400 hover:text-neon hover:bg-white/5 transition-colors"
          onClick={() => fileRef.current?.click()}
          title="File"
        >
          <Paperclip size={19} />
        </button>

        <textarea
          ref={taRef}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={disabled ? '🔒 Pilih chat dulu...' : 'Ketik pesan... (Ctrl+V buat gambar)'}
          className="flex-1 min-w-0 resize-none bg-black/40 border border-white/10 focus:border-neon/60 rounded-xl px-4 py-2.5 text-white placeholder-slate-500 transition-colors max-h-[140px]"
        />

        <div className="relative shrink-0">
          <button
            className="p-2.5 rounded-lg text-slate-400 hover:text-lime hover:bg-white/5 transition-colors"
            onClick={() => setEmoji((v) => !v)}
          >
            <Smile size={20} />
          </button>
          {emoji && (
            <EmojiPicker
              onPick={(e) => {
                setText((t) => t + e);
                setEmoji(false);
                taRef.current?.focus();
              }}
              onClose={() => setEmoji(false)}
            />
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={submit}
          disabled={!text.trim() || disabled}
          className="shrink-0 p-3 rounded-xl bg-neon/15 border border-neon/50 text-neon hover:bg-neon/25 hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send size={19} />
        </motion.button>
      </div>
      <div className="mt-1 px-1 font-mono text-[10px] text-slate-600 flex items-center gap-2">
        <span>AES-256-GCM E2E</span>
        <span>•</span>
        <span className="text-neon/70">realtime</span>
      </div>
    </div>
  );
}
