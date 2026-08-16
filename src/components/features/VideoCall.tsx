/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { onCall, sendCall } from '../../lib/realtime';
import { triggerPush } from '../../lib/notify';
import { useStore } from '../../lib/store';
import type { User } from '../../types';
import Avatar from '../Avatar';

const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function VideoCall({ mode, peer, onClose }: { mode: 'caller' | 'callee'; peer: User; onClose: () => void }) {
  const me = useStore((s) => s.me);
  const [stage, setStage] = useState<'ringing' | 'active'>('ringing');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    let closed = false;
    let beat: number | null = null;
    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    const send = (event: string, data: any) => sendCall({ event, data: { from: me!.id, to: peer.id, ...data } });

    pc.onicecandidate = (e) => {
      if (e.candidate) send('call-ice', { cand: e.candidate });
    };
    pc.ontrack = (e) => {
      if (remoteRef.current) remoteRef.current.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (!closed) endCall();
      }
    };

    const unsub = onCall((event, data) => {
      if (data.to !== me!.id || data.from !== peer.id) return;
      if (event === 'call-ready' && mode === 'caller') {
        pc.createOffer()
          .then((o) => pc.setLocalDescription(o))
          .then(() => send('call-offer', { sdp: pc.localDescription }));
      } else if (event === 'call-offer' && mode === 'callee') {
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          .then(() => pc.createAnswer())
          .then((a) => pc.setLocalDescription(a))
          .then(() => send('call-answer', { sdp: pc.localDescription }));
        setStage('active');
      } else if (event === 'call-answer' && mode === 'caller') {
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        setStage('active');
      } else if (event === 'call-ice') {
        pc.addIceCandidate(new RTCIceCandidate(data.cand)).catch(() => {});
      } else if (event === 'call-hangup' || event === 'call-cancel') {
        endCall();
      }
    });

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (closed) return;
        streamRef.current = stream;
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        if (localRef.current) localRef.current.srcObject = stream;
        if (mode === 'caller') {
          send('call-invite', {});
          if (me) {
            triggerPush([peer.id], `${me.username} nelpon kamu`, '📞 Video call masuk', `/#call:${peer.id}`).catch(() => {});
          }
          beat = window.setInterval(() => {
            if (stageRef.current !== 'ringing') return;
            send('call-invite', {});
          }, 5000);
        } else {
          send('call-ready', {});
        }
      })
      .catch(() => {
        if (!closed) endCall();
      });

    return () => {
      closed = true;
      unsub();
      if (beat) window.clearInterval(beat);
      pc.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer.id]);

  function endCall() {
    sendCall({ event: 'call-hangup', data: { from: me!.id, to: peer.id } });
    pcRef.current?.close();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onClose();
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
  }
  function toggleCam() {
    const next = !camOff;
    setCamOff(next);
    streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[85] bg-black/95 flex flex-col"
    >
      <div className="relative flex-1 flex items-center justify-center">
        <video ref={remoteRef} autoPlay playsInline className="w-full h-full object-contain" />
        {stage === 'ringing' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
            <Avatar id={peer.id} name={peer.username} size={96} />
            <div className="text-xl text-white font-medium">{peer.username}</div>
            <div className="font-mono text-sm text-neon animate-pulse">
              {mode === 'caller' ? 'MENGHUBUNGI...' : 'PANGGILAN MASUK...'}
            </div>
            <div className="flex gap-6 mt-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                onClick={endCall}
                className="w-16 h-16 rounded-full bg-virus flex items-center justify-center text-white shadow-[0_0_30px_rgba(255,46,166,0.6)]"
              >
                <PhoneOff size={24} />
              </motion.button>
              {mode === 'callee' && (
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  onClick={() => setStage('active')}
                  className="w-16 h-16 rounded-full bg-lime flex items-center justify-center text-black shadow-[0_0_30px_rgba(182,255,46,0.6)]"
                >
                  <Phone size={24} />
                </motion.button>
              )}
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 w-32 h-48 sm:w-40 sm:h-56 rounded-xl overflow-hidden border-2 border-neon/60 bg-black">
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
        </div>

        {stage === 'active' && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4 bg-black/50 backdrop-blur rounded-full px-4 py-3">
            <button onClick={toggleMute} className={`p-3 rounded-full ${muted ? 'bg-virus text-white' : 'bg-white/10 text-white'}`}>
              {muted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button onClick={toggleCam} className={`p-3 rounded-full ${camOff ? 'bg-virus text-white' : 'bg-white/10 text-white'}`}>
              {camOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
            <button onClick={endCall} className="p-3 rounded-full bg-virus text-white">
              <PhoneOff size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="py-2 text-center font-mono text-[11px] text-slate-500">
        WebRTC // end-to-end • media tidak lewat server
      </div>
    </motion.div>
  );
}

export function IncomingCallOverlay({ peer, onAccept, onDecline }: { peer: User; onAccept: () => void; onDecline: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      className="pt-safe fixed top-0 inset-x-0 z-[86] glass border-b border-virus/40 p-4 flex items-center gap-4"
    >
      <Avatar id={peer.id} name={peer.username} size={46} />
      <div className="flex-1">
        <div className="text-white font-medium">{peer.username} memanggil kamu...</div>
        <div className="font-mono text-xs text-virus animate-pulse">VIDEO CALL</div>
      </div>
      <button onClick={onAccept} className="p-3 rounded-full bg-lime text-black shadow-[0_0_20px_rgba(182,255,46,0.5)]">
        <Phone size={18} />
      </button>
      <button onClick={onDecline} className="p-3 rounded-full bg-virus text-white">
        <PhoneOff size={18} />
      </button>
    </motion.div>
  );
}
