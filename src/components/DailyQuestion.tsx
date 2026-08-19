import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, CheckCircle, Send, Trophy, Flame, ChevronRight } from 'lucide-react';
import NeonButton from './NeonButton';
import {
  getProgress, ensureQuestion, submitAnswer, getState, chatWithAi,
} from '../lib/nexus-ai';

export default function DailyQuestion() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dayDone, setDayDone] = useState(false);
  const [progress, setProgress] = useState({ day: 1, totalDays: 730, topic: '', sessions: 0, maxSessions: 10, streak: 0, historyCount: 0, percent: 0 });
  const [chatMode, setChatMode] = useState(false);
  const [chatMsg, setChatMsg] = useState('');
  const [chatResp, setChatResp] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    setProgress(getProgress());
  }, [open, dayDone]);

  async function loadQuestion() {
    setLoading(true);
    try {
      const q = await ensureQuestion();
      setQuestion(q);
      setAnswer('');
      setFeedback('');
      setScore(0);
      setDayDone(false);
      setProgress(getProgress());
    } catch {}
    setLoading(false);
  }

  async function handleSubmit() {
    if (!answer.trim() || loading) return;
    setLoading(true);
    try {
      const r = await submitAnswer(answer.trim());
      setFeedback(r.feedback);
      setScore(r.score);
      setDayDone(r.dayComplete);
      setAnswer('');
      setProgress(getProgress());
    } catch {}
    setLoading(false);
  }

  async function handleChat() {
    if (!chatMsg.trim() || chatLoading) return;
    setChatLoading(true);
    try {
      const r = await chatWithAi(chatMsg.trim());
      setChatResp(r);
      setChatMsg('');
    } catch {}
    setChatLoading(false);
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); loadQuestion(); }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs tracking-wider border border-neon/30 text-neon hover:bg-neon/10 transition-colors"
        title="Daily Challenge — belajar 10 menit per hari"
      >
        <Brain size={14} />
        <span className="hidden sm:inline">DAILY</span>
        <span className="text-[10px] text-slate-500">D{progress.day}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="glass hud-corner rounded-2xl p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Brain size={20} className="text-neon" />
                  <h2 className="font-mono font-bold text-neon tracking-widest">DAILY CHALLENGE</h2>
                </div>
                <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-white text-xl">&times;</button>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-500">HARI</div>
                  <div className="text-lg font-mono font-bold text-neon">{progress.day}/{progress.totalDays}</div>
                </div>
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-500">SESI</div>
                  <div className="text-lg font-mono font-bold text-amber">{progress.sessions}/{progress.maxSessions}</div>
                </div>
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <div className="text-[10px] font-mono text-slate-500 flex items-center justify-center gap-1"><Flame size={10} />STREAK</div>
                  <div className="text-lg font-mono font-bold text-virus">{progress.streak}</div>
                </div>
              </div>

              {progress.topic && (
                <div className="mb-3 px-3 py-1.5 rounded-lg bg-neon/5 border border-neon/20 text-xs font-mono text-neon">
                  TOPIK: {progress.topic}
                </div>
              )}

              <div className="w-full h-1.5 bg-white/5 rounded-full mb-4 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-neon to-lime rounded-full transition-all" style={{ width: `${(progress.sessions / progress.maxSessions) * 100}%` }} />
              </div>

              {!chatMode ? (
                <>
                  {dayDone ? (
                    <div className="text-center py-6">
                      <Trophy size={40} className="text-lime mx-auto mb-3" />
                      <div className="text-lime font-mono font-bold mb-2">HARI SELESAI!</div>
                      <div className="text-xs text-slate-400 mb-4">Topik ini sudah tuntas. Besok ada topik baru.</div>
                      <NeonButton variant="lime" onClick={() => { setDayDone(false); loadQuestion(); }}>
                        <ChevronRight size={14} /> NEXT DAY
                      </NeonButton>
                    </div>
                  ) : (
                    <>
                      {feedback && (
                        <div className="mb-3 p-3 rounded-lg bg-lime/5 border border-lime/20">
                          <div className="flex items-center gap-2 mb-1">
                            <CheckCircle size={14} className="text-lime" />
                            <span className="text-xs font-mono text-lime">SKOR: {score}/10</span>
                          </div>
                          <div className="text-xs text-slate-300">{feedback}</div>
                        </div>
                      )}

                      {loading && !question ? (
                        <div className="text-center py-8 text-xs font-mono text-slate-500 animate-pulse">MEMUAT PERTANYAAN...</div>
                      ) : question ? (
                        <>
                          <div className="mb-3 p-3 rounded-lg bg-black/30 border border-white/10">
                            <div className="text-[10px] font-mono text-slate-500 mb-1">PERTANYAAN HARI INI (SESI {progress.sessions + 1}/{progress.maxSessions})</div>
                            <div className="text-sm text-white leading-relaxed">{question}</div>
                          </div>
                          <textarea
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            placeholder="Tulis jawabanmu di sini..."
                            rows={4}
                            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono mb-3 focus:border-neon resize-none"
                          />
                          <NeonButton variant="primary" className="w-full" onClick={handleSubmit} disabled={!answer.trim() || loading}>
                            {loading ? 'MENILAI...' : <><Send size={14} /> KIRIM JAWABAN</>}
                          </NeonButton>
                        </>
                      ) : (
                        <NeonButton variant="primary" className="w-full" onClick={loadQuestion}>
                          MULAI SEKARANG
                        </NeonButton>
                      )}
                    </>
                  )}

                  <div className="mt-3 text-center">
                    <button onClick={() => setChatMode(true)} className="text-[11px] font-mono text-slate-500 hover:text-neon transition-colors">
                      tanya bebas ke AI →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-neon">FREE CHAT</span>
                    <button onClick={() => setChatMode(false)} className="text-[11px] font-mono text-slate-500 hover:text-neon">← back to challenge</button>
                  </div>
                  {chatResp && (
                    <div className="mb-3 p-3 rounded-lg bg-neon/5 border border-neon/20 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{chatResp}</div>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={chatMsg}
                      onChange={(e) => setChatMsg(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleChat()}
                      placeholder="Tanya apa saja..."
                      className="flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono focus:border-neon"
                    />
                    <NeonButton variant="primary" onClick={handleChat} disabled={!chatMsg.trim() || chatLoading}>
                      {chatLoading ? '...' : <Send size={14} />}
                    </NeonButton>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
