/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { onGroupCall, sendGroupCall } from '../../lib/realtime';
import { triggerPush } from '../../lib/notify';
import type { User } from '../../types';
import Avatar from '../Avatar';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

export default function GroupVideoCall({
  callId,
  groupId,
  groupName,
  initiator,
  members,
  mode,
  me,
  onClose,
}: {
  callId: string;
  groupId: string;
  groupName: string;
  initiator: string;
  members: User[];
  mode: 'caller' | 'callee';
  me: User;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<'ringing' | 'active'>(mode === 'caller' ? 'ringing' : 'ringing');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [remotes, setRemotes] = useState<Record<string, MediaStream>>({});
  const localRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remotesRef = useRef<Record<string, MediaStream>>({});
  const stageRef = useRef(stage);
  stageRef.current = stage;

  useEffect(() => {
    let closed = false;
    let beat: number | null = null;
    const pcs = pcsRef.current;
    const meId = me.id;
    const known: string[] = members.map((m) => m.id);

    const refresh = () => {
      if (closed) return;
      remotesRef.current = { ...remotesRef.current };
      setRemotes({ ...remotesRef.current });
    };

    const send = (event: string, data: any) =>
      sendGroupCall({ event, data: { callId, groupId, from: meId, ...data } });

    const getPC = (uid: string) => {
      let pc = pcs.get(uid);
      if (pc) return pc;
      pc = new RTCPeerConnection(RTC_CONFIG);
      pc.onicecandidate = (e) => {
        if (e.candidate) send('ice', { to: uid, cand: e.candidate });
      };
      pc.ontrack = (e) => {
        const s = e.streams[0];
        if (s) {
          remotesRef.current[uid] = s;
          refresh();
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc && ['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          pcs.delete(uid);
          delete remotesRef.current[uid];
          refresh();
        }
      };
      streamRef.current?.getTracks().forEach((t) => pc!.addTrack(t, streamRef.current!));
      pcs.set(uid, pc);
      return pc;
    };

    const connectTo = (uid: string) => {
      if (uid === meId || pcs.has(uid)) return;
      const pc = getPC(uid);
      if (meId < uid) {
        pc.createOffer()
          .then((o) => pc.setLocalDescription(o))
          .then(() => send('offer', { to: uid, sdp: pc.localDescription }))
          .catch(() => {});
      }
    };

    const unsub = onGroupCall((event, data) => {
      if (data.callId !== callId) return;
      if (event === 'join') {
        connectTo(data.from);
      } else if (event === 'offer' && data.to === meId) {
        const pc = getPC(data.from);
        pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
          .then(() => pc.createAnswer())
          .then((a) => pc.setLocalDescription(a))
          .then(() => send('answer', { to: data.from, sdp: pc.localDescription }))
          .catch(() => {});
        if (stage === 'ringing') setStage('active');
      } else if (event === 'answer' && data.to === meId) {
        const pc = pcs.get(data.from);
        if (pc) pc.setRemoteDescription(new RTCSessionDescription(data.sdp)).catch(() => {});
        if (stage === 'ringing') setStage('active');
      } else if (event === 'ice' && data.to === meId) {
        const pc = pcs.get(data.from);
        if (pc) pc.addIceCandidate(new RTCIceCandidate(data.cand)).catch(() => {});
      } else if (event === 'hangup') {
        if (data.from === meId) return;
        if (data.from === initiator) {
          endCall(false);
          return;
        }
        pcs.get(data.from)?.close();
        pcs.delete(data.from);
        delete remotesRef.current[data.from];
        refresh();
      }
    });

    function endCall(notify: boolean) {
      if (notify) send('hangup', {});
      pcs.forEach((pc) => pc.close());
      pcs.clear();
      remotesRef.current = {};
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (!closed) onClose();
    }

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (closed) return;
        streamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        if (mode === 'caller') {
          send('start', { members: known, initiator: meId });
          const others = known.filter((id) => id !== meId);
          if (others.length) {
            triggerPush(
              others,
              `${me.username} memanggil grup`,
              `📞 Video call grup: ${groupName}`,
              `/#gcall:${groupId}`,
            ).catch(() => {});
          }
          beat = window.setInterval(() => {
            if (stageRef.current !== 'ringing') return;
            send('start', { members: known, initiator: meId });
          }, 5000);
        } else {
          send('join', {});
          known.forEach((uid) => connectTo(uid));
          setStage('active');
        }
      })
      .catch(() => {
        if (!closed) endCall(true);
      });

    return () => {
      closed = true;
      unsub();
      if (beat) window.clearInterval(beat);
      pcs.forEach((pc) => pc.close());
      pcs.clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.username ?? id.slice(0, 8);
  const remoteIds = Object.keys(remotes);

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
  function endCall() {
    sendGroupCall({ event: 'hangup', data: { callId, from: me.id } });
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onClose();
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[85] bg-black/95 flex flex-col">
      <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
        <div className="font-mono text-neon text-xs tracking-widest">GRUP CALL</div>
        <div className="text-white font-medium text-sm truncate flex-1">{groupName}</div>
        <div className="font-mono text-[10px] text-slate-500">{remoteIds.length + 1} peserta</div>
      </div>

      <div className="flex-1 overflow-y-auto grid gap-2 p-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {remoteIds.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center gap-4 text-center py-10">
            <Avatar id={initiator} name={nameOf(initiator)} size={80} />
            <div className="text-white">{groupName}</div>
            <div className="font-mono text-xs text-neon animate-pulse">
              {stage === 'ringing' ? 'MENUNGGU PESERTA LAIN...' : 'MENGHUBUNGI...'}
            </div>
          </div>
        )}
        {remoteIds.map((uid) => (
          <div key={uid} className="relative rounded-xl overflow-hidden bg-black border border-white/10 aspect-video">
            <video
              autoPlay playsInline className="w-full h-full object-cover"
              ref={(el) => {
                if (el) el.srcObject = remotes[uid];
              }}
            />
            <div className="absolute bottom-1.5 left-2 text-[11px] text-white bg-black/50 px-2 py-0.5 rounded font-mono">
              {nameOf(uid)}
            </div>
          </div>
        ))}
        <div className="relative rounded-xl overflow-hidden bg-black border border-neon/50 aspect-video">
          <video ref={localRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
          <div className="absolute bottom-1.5 left-2 text-[11px] text-neon bg-black/50 px-2 py-0.5 rounded font-mono">kamu</div>
        </div>
      </div>

      <div className="flex justify-center gap-4 bg-black/50 backdrop-blur px-4 py-3 border-t border-white/10">
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
      <div className="py-1.5 text-center font-mono text-[11px] text-slate-600">
        mesh WebRTC // end-to-end • media tidak lewat server
      </div>
    </motion.div>
  );
}

export function IncomingGroupCallOverlay({
  groupName,
  members,
  initiator,
  callId,
  me,
  onAccept,
  onDecline,
}: {
  groupName: string;
  members: User[];
  initiator: string;
  callId: string;
  me: User;
  onAccept: (initiator: string, callId: string) => void;
  onDecline: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -40 }}
      animate={{ opacity: 1, y: 0 }}
      className="pt-safe fixed top-0 inset-x-0 z-[86] glass border-b border-virus/40 p-4 flex items-center gap-4"
    >
      <div className="p-2.5 rounded-full bg-virus/20 border border-virus/50">
        <Video size={18} className="text-virus" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{groupName}</div>
        <div className="font-mono text-xs text-virus animate-pulse">PANGGILAN VIDEO GRUP MASUK...</div>
      </div>
      <button onClick={() => onAccept(initiator, callId)} className="p-3 rounded-full bg-lime text-black shadow-[0_0_20px_rgba(182,255,46,0.5)]">
        <Phone size={18} />
      </button>
      <button onClick={onDecline} className="p-3 rounded-full bg-virus text-white">
        <PhoneOff size={18} />
      </button>
    </motion.div>
  );
}
