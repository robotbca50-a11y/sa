/*
  nexus://o8.2 build
  author & every line: OKTAGRAM
  OKTAGRAM YANG MENULIS INI JIKA BERANI BONGKAR BONGKAR
  sig://oktagram
*/

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Ghost, Bell, LogOut, MessageSquare, MonitorPlay,
  Music, Download, Send, Sparkles,
} from 'lucide-react';
import { useStore } from '../../lib/store';
import {
  rpcListUsers, rpcMyConversations, rpcMyGroups, rpcGetOrCreateConversation,
  rpcGetMessages, rpcGetGroupMessages, rpcSendMessage, rpcGroupSend,
  rpcAddReaction, rpcRemoveReaction, rpcGroupAddReaction, rpcGroupRemoveReaction,
  rpcEditMessage, rpcDeleteMessage, rpcGroupEditMessage, rpcGroupDeleteMessage,
  rpcGroupCreate, rpcGroupAddMember, rpcGroupMembers, rpcGetGroupKey, rpcSaveGroupKey,
  rpcSaveGroupKeyBackup, rpcGetGroupKeyBackup, rpcGetAllUserKeys,
  rpcMarkMessagesRead, rpcMarkGroupMessagesRead,
  rpcLogout, rpcLogAccess, uploadMedia, uploadBigMedia, planBigMedia, rpcSetMediaStatus, toastErr,
  rpcGetSessionEpoch, rpcAiBrainGet, rpcAiBrainSave,
  rpcMaybeCleanup, downloadMedia,
} from '../../lib/api';
import {
  deriveSharedKey, encryptText, decryptText, randomAESKey, exportAESKey, encryptToRecipient,
  decryptFromSender, importAESKey, bufToB64, encryptForKeys, getPasswordKey, setPasswordKey,
  exportPublicRaw,
} from '../../lib/crypto';
import { savePrivateKey } from '../../lib/keystore';
import { initPresence, stopPresence } from '../../lib/realtime';
import { subscribeMessages, subscribeGroupMessages, subscribeReactions, subscribeGroupReactions, onTyping, onCall, onGroupCall } from '../../lib/realtime';
import { initNotifications, ensurePush, unsubscribePush, persistPushSub, appNotify, updateTitle, triggerPush, testPushSelf, warmPush, needsIOSInstall } from '../../lib/notify';
import {
  brainLearn, brainMerge, brainExport, brainDirty, brainMarkPushed,
} from '../../lib/brain';
import { initNativePush, unregisterNativePush, testNativePushSelf, isNativeApp } from '../../lib/nativePush';
import { decodeMessage, evictCache, clearCache, setDecryptPrivateKey } from '../../lib/decrypt';
import { clearSession, readMsgCache, writeMsgCache, clearChatCache, saveSession } from '../../lib/session';
import { prepareMedia } from '../../lib/media';
import { getDisappearSeconds, cycleDisappear } from '../../lib/disappear';
import { isPinned, togglePin } from '../../lib/pins';
import { isBlocked, isMuted, noteLastSeen, getNotifPrivacy, toggleBlocked, toggleMuted, usePrivacyVersion, getLastSeen, formatLastSeen } from '../../lib/privacy';
import Conversation from '../chat/Conversation';
import ConversationList from '../chat/ConversationList';
import { NewChatModal, NewGroupModal, AddMemberModal, GhostSettingsModal, ProfileModal, ForwardPicker } from '../chat/modals';
import Avatar, { avatarUrl } from '../Avatar';
import Stories from '../features/Stories';
import Reels from '../features/Reels';
import WatchParty from '../features/WatchParty';
import VideoCall, { IncomingCallOverlay } from '../features/VideoCall';
import GroupVideoCall, { IncomingGroupCallOverlay } from '../features/GroupVideoCall';
import AiPanel from '../features/AiPanel';
import InstallBanner from '../InstallBanner';
import { showInstallBanner } from '../../lib/install';
import CyberBg from './CyberBg';
import type { ConversationItem, Group, Msg, Reaction, User } from '../../types';

const DMK = (id: string) => `dm:${id}`;
const GRK = (id: string) => `grp:${id}`;

async function rpcRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw lastErr;
}

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, ttl, v } = JSON.parse(raw) as { t: number; ttl?: number; v: T };
    if (Date.now() - t > (ttl ?? 24 * 60 * 60 * 1000)) {
      localStorage.removeItem(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, v: T, ttl: number) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), ttl, v }));
  } catch {
  }
}

export default function ChatApp() {
  const me = useStore((s) => s.me);
  const privateKey = useStore((s) => s.privateKey);
  const patchMe = useStore((s) => s.patchMe);
  const ghostMode = useStore((s) => s.ghostMode);
  const onlineSet = useStore((s) => s.onlineSet);
  const unread = useStore((s) => s.unread);
  const setView = useStore((s) => s.setView);
  const setSession = useStore((s) => s.setSession);
  const setIncoming = useStore((s) => s.setIncoming);
  const incoming = useStore((s) => s.incoming);

  const [users, setUsers] = useState<User[]>([]);
  const [dms, setDms] = useState<ConversationItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState<{ key: string; kind: 'dm' | 'group' } | null>(null);
  const [msgMap, setMsgMap] = useState<Record<string, Msg[]>>({});
  const [keyMap, setKeyMap] = useState<Record<string, CryptoKey>>({});
  const [reactMap, setReactMap] = useState<Record<string, Reaction[]>>({});
  const [typing, setTyping] = useState<Record<string, string[]>>({});
  const [tab, setTab] = useState<'chats' | 'reels' | 'watch'>('chats');
  const [modal, setModal] = useState<null | 'newchat' | 'newgroup' | 'ghost' | 'profile' | 'ai'>(null);
  const [addMemberFor, setAddMemberFor] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<string, User[]>>({});
  const [call, setCall] = useState<{ mode: 'caller' | 'callee'; peer: User } | null>(null);
  const [groupCall, setGroupCall] = useState<{ mode: 'caller' | 'callee'; callId: string; groupId: string; groupName: string; initiator: string; members: User[] } | null>(null);
  const [incomingGroupCall, setIncomingGroupCall] = useState<{ callId: string; groupId: string; groupName: string; initiator: string; members: User[] } | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Msg | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);

  const meRef = useRef(me);
  const keyRef = useRef(privateKey);
  const activeRef = useRef(active);
  const dmsRef = useRef(dms);
  const groupsRef = useRef(groups);
  const msgMapRef = useRef(msgMap);
  const keyMapRef = useRef(keyMap);
  const userMapRef = useRef<Record<string, string>>({});
  const userKeysRef = useRef<Record<string, string[]>>({});
  const lastKeyFetchRef = useRef(0);
  const incomingFromRef = useRef<string | null>(null);
  const inCallRef = useRef(false);
  const groupCallRef = useRef<typeof groupCall>(null);
  const incomingGroupCallRef = useRef<typeof incomingGroupCall>(null);
  const mediaRetryRef = useRef(new Map<string, { file: File; replyTo: string | null }>());
  const expiryRef = useRef<Record<string, { at: number; key: string }>>({});
  const tombRef = useRef<Set<string>>(new Set(JSON.parse(localStorage.getItem('nexus:expired') || '[]')));
  const [nowTick, setNowTick] = useState(0);
  const [seenVer, setSeenVer] = useState(0);

  meRef.current = me;
  keyRef.current = privateKey;
  activeRef.current = active;
  dmsRef.current = dms;
  groupsRef.current = groups;
  msgMapRef.current = msgMap;
  keyMapRef.current = keyMap;
  userMapRef.current = Object.fromEntries(users.map((u) => [u.id, u.username]));
  groupCallRef.current = groupCall;
  incomingGroupCallRef.current = incomingGroupCall;

  useEffect(() => {
    setDecryptPrivateKey(privateKey ?? null);
  }, [privateKey]);

  useEffect(() => {
    const iv = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const lastSeenWrittenRef = useRef<Record<string, number>>({});
  useEffect(() => {
    const now = Date.now();
    let changed = false;
    for (const id of Object.keys(onlineSet)) {
      if (onlineSet[id] && (lastSeenWrittenRef.current[id] ?? 0) + 30_000 < now) {
        lastSeenWrittenRef.current[id] = now;
        noteLastSeen(id);
        changed = true;
      }
    }
    if (changed) setSeenVer((v) => v + 1);
  }, [onlineSet]);

  useEffect(() => {
    if (!me || !privateKey) return;
    initPresence();
    initNotifications().catch(() => {});
    persistPushSub().catch(() => {});
    rpcLogAccess(me.id, 'open').catch(() => {});
    warmPush();
    const warmIv = setInterval(() => warmPush().catch(() => {}), 5 * 60_000);

    let epoch = 0;
    rpcGetSessionEpoch()
      .then((e) => (epoch = e))
      .catch(() => {});
    const epochIv = setInterval(() => {
      rpcGetSessionEpoch()
        .then((e) => {
          if (epoch > 0 && e > epoch) window.dispatchEvent(new Event('nexus:logout'));
          epoch = e;
        })
        .catch(() => {});
    }, 60_000);

    initNativePush(
      (m) => appNotify(m.title, m.body, { icon: '📲' }),
      (m) => {
        const item = m.convId ? dmsRef.current.find((d) => d.id === m.convId) : undefined;
        if (item) openDm(item);
        else setTab('chats');
      },
    ).catch(() => {});

    if (me?.is_admin) {
      rpcMaybeCleanup()
        .then((cleaned) => {
          if (cleaned) {
            clearCache();
            clearChatCache();
          }
        })
        .catch(() => {});
    }

    const cached = readCache<{ users: User[]; dms: any[] }>(`nexus:cache:${me.id}`);
    if (cached) {
      setUsers(cached.users);
      const cachedAvatars: Record<string, string | null> = {};
      for (const u of cached.users ?? []) cachedAvatars[u.id] = u.avatar ?? null;
      setDms(
        (cached.dms ?? []).map((r) => ({
          key: DMK(r.id),
          kind: 'dm' as const,
          id: r.id,
          peerId: r.peer_id,
          name: r.peer_username ?? 'unknown',
          public_key: r.peer_public_key,
          avatar: r.peer_avatar ?? cachedAvatars[r.peer_id] ?? null,
          online: false,
          lastAt: r.last_at,
          lastType: r.last_type,
          lastCiphertext: r.last_ciphertext,
          lastIv: r.last_iv,
          lastMsg: r.last_type === 'text' ? '🔒 enkripsi...' : `[${r.last_type}]`,
        })),
      );
    }

    Promise.all([rpcListUsers(), rpcMyConversations(me.id), rpcMyGroups(me.id), rpcGetAllUserKeys()])
      .then(([us, cv, gr, keys]) => {
        const dbMe = (us ?? []).find((u) => u.id === me.id);
        if (dbMe && (dbMe.username !== me.username || dbMe.avatar !== me.avatar)) {
          const next = { ...me, username: dbMe.username ?? me.username, avatar: dbMe.avatar ?? null };
          patchMe({ username: next.username, avatar: next.avatar });
          saveSession(next);
          if (dbMe.username && dbMe.username !== me.username && privateKey) {
            savePrivateKey(privateKey, dbMe.username).catch(() => {});
          }
        }
        const keyMapById: Record<string, string[]> = {};
        for (const k of keys ?? []) {
          (keyMapById[k.user_id] ??= []).push(k.public_key);
        }
        userKeysRef.current = keyMapById;
        setUsers(us);
        setGroups(gr);
        writeCache(`nexus:cache:${me.id}`, { users: us, dms: cv }, 5 * 60 * 1000);
        const avatarById: Record<string, string | null> = {};
        for (const u of us ?? []) avatarById[u.id] = u.avatar ?? null;
        const items: ConversationItem[] = (cv as any[]).map((r) => ({
          key: DMK(r.id),
          kind: 'dm',
          id: r.id,
          peerId: r.peer_id,
          name: r.peer_username ?? 'unknown',
          public_key: r.peer_public_key,
          avatar: r.peer_avatar ?? avatarById[r.peer_id] ?? null,
          online: false,
          lastAt: r.last_at,
          lastType: r.last_type,
          lastCiphertext: r.last_ciphertext,
          lastIv: r.last_iv,
          lastMsg: r.last_type === 'text' ? '🔒 enkripsi...' : `[${r.last_type}]`,
        }));
        setDms(items);
        items.forEach((it) => decryptPreview(it).catch(() => {}));
      })
      .catch((e) => appNotify('GAGAL MUAT DATA', toastErr(e), { icon: '⚠️' }));

    const subs = [
      subscribeMessages((m, kind) => onDmEvent(m as Msg, kind)),
      subscribeGroupMessages((m, kind) => onGroupEvent(m as Msg, kind)),
      subscribeReactions((r, k) => onReactEvent(r, k)),
      subscribeGroupReactions((r, k) => onReactEvent(r, k)),
    ];

    const offTyping = onTyping((key, isGroup, userId) => {
      const uname = userMapRef.current[userId] ?? 'seseorang';
      setTyping((t) => ({ ...t, [key]: Array.from(new Set([...(t[key] ?? []), uname])) }));
      setTimeout(() => {
        setTyping((t) => ({ ...t, [key]: (t[key] ?? []).filter((n) => n !== uname) }));
      }, 4000);
    });

    const offCall = onCall((event, data) => {
      if (event === 'call-invite' && data.to === meRef.current?.id && !inCallRef.current) {
        const from = data.from;
        const fromUser = users.find((u) => u.id === from);
        if (fromUser) {
          if (incomingFromRef.current === from) return;
          incomingFromRef.current = from;
          setIncoming(fromUser);
          appNotify('Panggilan masuk', `${fromUser.username} nelpon kamu`, {
            icon: '📞',
            onClick: () => setIncoming(fromUser),
          });
        }
      }
      if (event === 'call-cancel' && data.to === meRef.current?.id) {
        incomingFromRef.current = null;
        setIncoming(null);
      }
    });

    const offGCall = onGroupCall((event, data) => {
      const meId = meRef.current?.id;
      if (!meId) return;
      if (event === 'start') {
        if (data.from === meId) return;
        if (call || groupCallRef.current || inCallRef.current) return;
        if (!groupsRef.current.some((g) => g.id === data.groupId)) return;
        if (incomingGroupCallRef.current?.callId === data.callId) return;
        const g = groupsRef.current.find((x) => x.id === data.groupId);
        const mems: User[] = (data.members ?? []).map((id: string) => {
          const u = users.find((x) => x.id === id);
          return u ?? { id, username: id.slice(0, 8) };
        });
        const inc = { callId: data.callId, groupId: data.groupId, groupName: g?.name ?? 'Grup', initiator: data.from, members: mems };
        incomingGroupCallRef.current = inc;
        setIncomingGroupCall(inc);
        appNotify('Video call grup', `${inc.groupName} — ada panggilan masuk`, { icon: '📞' });
      }
      if (event === 'hangup') {
        if (incomingGroupCallRef.current && data.from === incomingGroupCallRef.current.initiator) {
          incomingGroupCallRef.current = null;
          setIncomingGroupCall(null);
        }
      }
    });

    const syncAll = () => {
      refreshDms();
      const meId = meRef.current?.id;
      if (meId) rpcMyGroups(meId).then(setGroups).catch(() => {});
      const a = activeRef.current;
      if (a && !(msgMapRef.current[a.key] ?? []).some((m) => m.pending)) {
        refetchActive();
      }
    };
    const syncIv = setInterval(syncAll, 15_000);
    const keyIv = setInterval(() => {
      freshUserKeys();
      syncAll();
    }, 300_000);
    const onFocus = () => syncAll();
    window.addEventListener('focus', onFocus);

    return () => {
      subs.forEach((s) => s.unsubscribe());
      offTyping();
      offCall();
      offGCall();
      clearInterval(syncIv);
      clearInterval(keyIv);
      clearInterval(warmIv);
      clearInterval(epochIv);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    let deb: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const remote = await rpcAiBrainGet();
        if (!active) return;
        if (remote && remote.payload) {
          brainMerge({
            payload: remote.payload,
            trained: remote.trained,
            updatedAt: new Date(remote.updated_at ?? 0).getTime(),
          });
        }
        if (brainDirty()) {
          const ex = brainExport();
          await rpcAiBrainSave(ex.payload, ex.trained);
          if (active) brainMarkPushed();
        }
      } catch {
      }
    };
    const schedule = () => {
      if (deb) clearTimeout(deb);
      deb = setTimeout(() => void tick(), 4000);
    };
    tick();
    const iv = setInterval(tick, 60_000);
    const onLearn = () => schedule();
    window.addEventListener('nexus:brain-learn', onLearn);
    window.addEventListener('focus', onLearn);
    return () => {
      active = false;
      clearInterval(iv);
      if (deb) clearTimeout(deb);
      window.removeEventListener('nexus:brain-learn', onLearn);
      window.removeEventListener('focus', onLearn);
    };
  }, [me?.id]);

  async function decryptPreview(it: ConversationItem) {
    if (!keyRef.current || !it.public_key) return;
    try {
      const k = await deriveSharedKey(keyRef.current, it.public_key);
      keyMapRef.current[it.key] = k;
      setKeyMap({ ...keyMapRef.current });
      if (it.lastType === 'text' && it.lastCiphertext && it.lastIv) {
        const text = await decryptText(k, it.lastCiphertext, it.lastIv);
        setDms((d) => d.map((x) => (x.key === it.key ? { ...x, lastMsg: text.slice(0, 80) } : x)));
      }
    } catch {
    }
  }

  async function refreshDms() {
    const meId = meRef.current?.id;
    if (!meId) return;
    try {
      const cv = await rpcMyConversations(meId);
      const items: ConversationItem[] = (cv as any[]).map((r) => {
        const existing = dmsRef.current.find((x) => x.key === DMK(r.id));
        return {
          key: DMK(r.id),
          kind: 'dm' as const,
          id: r.id,
          peerId: r.peer_id,
          name: r.peer_username ?? 'unknown',
          public_key: r.peer_public_key,
          avatar: r.peer_avatar,
          online: false,
          lastAt: r.last_at,
          lastType: r.last_type,
          lastCiphertext: r.last_ciphertext,
          lastIv: r.last_iv,
          lastMsg: existing?.lastMsg ?? (r.last_type === 'text' ? '🔒 enkripsi...' : `[${r.last_type}]`),
        };
      });
      dmsRef.current = items;
      setDms(items);
      items.forEach((it) => decryptPreview(it).catch(() => {}));
    } catch {
    }
  }

  function mergeMsg(key: string, m: Msg) {
    const list = msgMapRef.current[key];
    if (!list) {
      if (activeRef.current?.key === key) refetchActive();
      return;
    }
    const idx = list.findIndex((x) => x.id === m.id);
    if (idx === -1) {
      if (activeRef.current?.key === key) refetchActive();
      return;
    }
    const merged = { ...list[idx] };
    (Object.keys(m) as (keyof Msg)[]).forEach((k) => {
      const v = m[k];
      if (v !== undefined && v !== null) (merged as any)[k] = v;
    });
    const next = [...list];
    next[idx] = merged;
    msgMapRef.current = { ...msgMapRef.current, [key]: next };
    setMsgMap(msgMapRef.current);
    writeMsgCache(key, next);
  }

  function markRead(key: string) {
    if (!meRef.current) return;
    if (key.startsWith('dm:')) rpcMarkMessagesRead(meRef.current.id, key.replace('dm:', '')).catch(() => {});
    else rpcMarkGroupMessagesRead(meRef.current.id, key.replace('grp:', '')).catch(() => {});
  }

  async function onDmEvent(m: Msg, kind: string) {
    if (!m) return;
    const key = DMK(m.conversation_id ?? '');
    if (kind === 'UPDATE' || kind === 'DELETE') {
      evictCache(m.id);
      mergeMsg(key, m);
      refreshDms();
      if (activeRef.current?.key === key) markRead(key);
      return;
    }
    if (m.sender_id === meRef.current?.id) {
      appendRaw(key, m);
      previewDm(key, m);
      scheduleExpiry(key, m.id);
      return;
    }
    const isActive = activeRef.current?.key === key;
    if (isActive) {
      appendRaw(key, m);
      previewDm(key, m);
      scheduleExpiry(key, m.id);
      const st = useStore.getState();
      st.clearUnread(key);
      markRead(key);
    } else {
      useStore.getState().addUnread(key);
      updateTitle(Object.values(useStore.getState().unread).reduce((a, b) => a + b, 0));
      previewDm(key, m);
      scheduleExpiry(key, m.id);
      if (!dmsRef.current.some((d) => d.key === key)) refreshDms();
      const peerName = dmsRef.current.find((d) => d.key === key)?.name ?? 'Pesan baru';
      if (!isMuted(key)) decryptForNotify(key, m, peerName);
    }
  }

  async function onGroupEvent(m: Msg, kind: string) {
    if (!m) return;
    const key = GRK(m.group_id ?? '');
    if (kind === 'UPDATE' || kind === 'DELETE') {
      evictCache(m.id);
      mergeMsg(key, m);
      if (activeRef.current?.key === key) markRead(key);
      return;
    }
    if (m.sender_id === meRef.current?.id) {
      appendRaw(key, m);
      scheduleExpiry(key, m.id);
      return;
    }
    const isActive = activeRef.current?.key === key;
    if (isActive) {
      appendRaw(key, m);
      scheduleExpiry(key, m.id);
      useStore.getState().clearUnread(key);
      markRead(key);
    } else {
      useStore.getState().addUnread(key);
      updateTitle(Object.values(useStore.getState().unread).reduce((a, b) => a + b, 0));
      scheduleExpiry(key, m.id);
      const gName = groupsRef.current.find((g) => GRK(g.id) === key)?.name ?? 'Grup';
      if (!isMuted(key)) decryptForNotify(key, m, gName);
    }
  }

  async function decryptForNotify(key: string, m: Msg, who: string) {
    if (getNotifPrivacy()) {
      appNotify(who, '🔒 Pesan baru', { icon: '💬' });
      return;
    }
    if (m.msg_type !== 'text') {
      appNotify(who, `📎 ${m.msg_type}`, { icon: '💬' });
      return;
    }
    const k = keyMapRef.current[key];
    if (!k || !m.ciphertext) {
      appNotify(who, '🔒 Pesan terenkripsi', { icon: '💬' });
      return;
    }
    try {
      const d = await decodeMessage(m, k);
      const body = d.text || `[${m.msg_type}]`;
      appNotify(who, body, { icon: '💬' });
    } catch {
      appNotify(who, '🔒 Pesan terenkripsi', { icon: '💬' });
    }
  }

  function onReactEvent(r: Reaction, kind: string) {
    if (!r) return;
    setReactMap((map) => {
      const arr = map[r.message_id] ?? [];
      const filtered = kind === 'DELETE' ? arr.filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)) : arr;
      if (kind === 'INSERT' && !filtered.some((x) => x.user_id === r.user_id && x.emoji === r.emoji)) {
        filtered.push(r);
      }
      return { ...map, [r.message_id]: filtered };
    });
  }

  function appendRaw(key: string, m: Msg) {
    const enriched: Msg = m.username ? m : { ...m, username: userMapRef.current[m.sender_id] ?? 'user' };
    const prev = msgMapRef.current[key] ?? [];
    const base = enriched.sender_id === meRef.current?.id ? prev.filter((x) => !x.pending) : prev;
    msgMapRef.current = {
      ...msgMapRef.current,
      [key]: [...base.filter((x) => x.id !== enriched.id), enriched].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    };
    setMsgMap(msgMapRef.current);
    writeMsgCache(key, msgMapRef.current[key]);
  }

  function cycleDisappearFor(key: string) {
    cycleDisappear(key);
    setNowTick((t) => t + 1);
  }

  function togglePinFor(key: string) {
    togglePin(key);
    setNowTick((t) => t + 1);
  }

  async function ensureDmKey(peerId: string): Promise<string> {
    const key = DMK(peerId);
    if (keyMapRef.current[key]) return key;
    const peer =
      users.find((u) => u.id === peerId) ??
      dmsRef.current.find((d) => d.peerId === peerId);
    const pub = peer?.public_key;
    if (!pub || !privateKey) throw new Error('Kontak tidak punya public key.');
    const k = await deriveSharedKey(privateKey, pub);
    keyMapRef.current[key] = k;
    setKeyMap({ ...keyMapRef.current });
    if (!dmsRef.current.some((d) => d.key === key)) {
      const convId = await rpcGetOrCreateConversation(me!.id, peerId).catch(() => undefined);
      if (convId) {
        const peerName = peer && 'username' in peer ? peer.username : (peer as ConversationItem | undefined)?.name;
        dmsRef.current = [
          {
            key,
            kind: 'dm',
            id: convId,
            peerId,
            name: peerName ?? 'user',
            public_key: pub,
            online: false,
            lastAt: undefined,
            lastMsg: undefined,
          },
          ...dmsRef.current,
        ];
        setDms(dmsRef.current);
      }
    }
    return key;
  }

  async function forwardTo(msg: Msg, targetKey: string) {
    const a: { key: string; kind: 'dm' | 'group' } = {
      key: targetKey,
      kind: targetKey.startsWith('grp:') ? 'group' : 'dm',
    };
    const srcKey = activeRef.current?.key;
    const srcK = srcKey ? keyMapRef.current[srcKey] : undefined;
    if (!srcK) return;
    try {
      if (msg.msg_type === 'text') {
        const d = await decodeMessage(msg, srcK);
        await sendTextTo(a, d.text, null);
      } else if (msg.media_path) {
        const blob = await downloadMedia('chat-media', msg.media_path);
        const ext = msg.msg_type === 'video' ? 'mp4' : msg.msg_type === 'gif' ? 'gif' : msg.msg_type === 'voice' ? 'webm' : 'jpg';
        const mime = msg.msg_type === 'video' ? 'video/mp4' : msg.msg_type === 'gif' ? 'image/gif' : msg.msg_type === 'voice' ? 'audio/webm' : 'image/jpeg';
        const file = new File([blob], `forward.${ext}`, { type: mime });
        await sendMediaTo(a, file, null);
      }
      appNotify('DI-FORWARD', 'Pesan diteruskan ke percakapan lain.', { icon: '↪️' });
    } catch (e) {
      appNotify('GAGAL FORWARD', toastErr(e), { icon: '⚠️' });
    }
  }

  async function broadcastTo(ids: string[], text: string) {
    const t = text.trim();
    if (!t || ids.length === 0) return;
    let ok = 0;
    for (const id of ids) {
      try {
        if (isBlocked(id)) continue;
        const key = await ensureDmKey(id);
        await sendTextTo({ key, kind: 'dm' }, t, null);
        ok += 1;
      } catch {
      }
    }
    appNotify('BROADCAST', ok > 0 ? `Terkirim ke ${ok} kontak.` : 'Tidak ada yang terkirim.', { icon: '📣' });
  }

  function scheduleExpiry(key: string, msgId: string) {
    const secs = getDisappearSeconds(key);
    if (!secs) return;
    expiryRef.current[msgId] = { at: Date.now() + secs * 1000, key };
    setNowTick((t) => t + 1);
    window.setTimeout(() => {
      const list = msgMapRef.current[key] ?? [];
      const msg = list.find((x) => x.id === msgId);
      if (msg && msg.sender_id === meRef.current?.id) {
        try {
          if (key.startsWith('grp:')) rpcGroupDeleteMessage(msgId, meRef.current!.id).catch(() => {});
          else rpcDeleteMessage(msgId, meRef.current!.id).catch(() => {});
        } catch {
        }
        evictCache(msgId);
      } else {
        tombRef.current.add(msgId);
        const arr = Array.from(tombRef.current);
        if (arr.length > 500) arr.splice(0, arr.length - 500);
        try {
          localStorage.setItem('nexus:expired', JSON.stringify(arr));
        } catch {
        }
      }
      delete expiryRef.current[msgId];
      setMsgMap({ ...msgMapRef.current });
      setNowTick((t) => t + 1);
    }, secs * 1000);
  }

  async function previewDm(key: string, m: Msg) {
    let text = '';
    if (m.msg_type === 'text' && m.ciphertext) {
      const k = keyMapRef.current[key];
      if (k) {
        try {
          text = (await decodeMessage(m, k)).text.slice(0, 80);
        } catch {
          text = '[🔒]';
        }
      } else {
        text = '[🔒]';
      }
    } else {
      text = `[${m.msg_type}]`;
    }
    const upd = {
      lastMsg: text,
      lastType: m.msg_type,
      lastCiphertext: m.ciphertext || undefined,
      lastIv: m.iv ?? undefined,
      lastAt: m.created_at,
    };
    dmsRef.current = dmsRef.current
      .map((x) => (x.key === key ? { ...x, ...upd } : x))
      .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
    setDms(dmsRef.current);
  }

  async function fetchMsgs(key: string, force = false): Promise<Msg[]> {
    if (!force) {
      const cached = readMsgCache(key);
      if (cached) return cached;
    }
    const id = key.startsWith('dm:') ? key.replace('dm:', '') : key.replace('grp:', '');
    const rows = key.startsWith('dm:')
      ? await rpcGetMessages(id, me?.id ?? null)
      : await rpcGetGroupMessages(id, me?.id ?? null);
    writeMsgCache(key, rows);
    return rows;
  }

  function storeMsgs(key: string, rows: Msg[]) {
    if (tombRef.current.size > 0) rows = rows.filter((m) => !tombRef.current.has(m.id));
    msgMapRef.current = { ...msgMapRef.current, [key]: rows };
    setMsgMap(msgMapRef.current);
    writeMsgCache(key, rows);
  }

  const refetchActive = useCallback(async () => {
    const a = activeRef.current;
    if (!a || !keyRef.current) return;
    try {
      const rows = await fetchMsgs(a.key, true);
      storeMsgs(a.key, rows);
    } catch {
    }
  }, []);

  async function openDm(item: ConversationItem) {
    setTab('chats');
    const key = item.key;
    const peer = users.find((u) => u.id === item.peerId) ?? {
      id: item.peerId ?? '',
      username: item.name,
      public_key: item.public_key,
    };
    if (!keyMapRef.current[key] && privateKey && peer.public_key) {
      try {
        const k = await deriveSharedKey(privateKey, peer.public_key);
        keyMapRef.current[key] = k;
        setKeyMap({ ...keyMapRef.current });
      } catch {
        appNotify('GAGAL BUKA', 'Public key tidak valid.', { icon: '⚠️' });
        return;
      }
    }
    setActive({ key, kind: 'dm' });
    useStore.getState().clearUnread(key);
    updateTitle(Object.values(useStore.getState().unread).reduce((a, b) => a + b, 0));
    markRead(key);
    if (!msgMapRef.current[key]) {
      try {
        const rows = await fetchMsgs(key);
        storeMsgs(key, rows);
      } catch {
      }
    }
  }

  async function openGroup(item: ConversationItem) {
    setTab('chats');
    const key = item.key;
    const gid = key.replace('grp:', '');
    setActive({ key, kind: 'group' });
    useStore.getState().clearUnread(key);
    markRead(key);

    const members = groupMembers[gid] ?? (await rpcGroupMembers(gid).catch(() => []));
    if (!groupMembers[gid]) setGroupMembers((m) => ({ ...m, [gid]: members }));

    if (!keyMapRef.current[key]) {
      let groupKey: CryptoKey | null = null;
      try {
        const rows = await rpcGetGroupKey(gid, me!.id);
        if (rows?.length && keyRef.current) {
          const creator = members.find((u) => u.id === groupsRef.current.find((g) => g.id === gid)?.created_by);
          for (const row of rows) {
            const saver = row.public_key ? row.public_key : creator?.public_key;
            if (!saver) continue;
            try {
              const raw = await decryptFromSender(keyRef.current, saver, row.enc_key, row.iv);
              groupKey = await importAESKey(raw);
              break;
            } catch {
            }
          }
        }
      } catch {
      }

      if (!groupKey && me) {
        try {
          const pkey = getPasswordKey();
          const bk = pkey ? await rpcGetGroupKeyBackup(gid).catch(() => null) : null;
          if (bk) {
            const raw = await decryptText(pkey!, bk.enc_key, bk.iv);
            groupKey = await importAESKey(raw);
          }
        } catch {
        }
      }

      if (groupKey) {
        keyMapRef.current[key] = groupKey;
        setKeyMap({ ...keyMapRef.current });
        if (keyRef.current && me) {
          try {
            const myPub = await exportPublicRaw(keyRef.current);
            const raw = await exportAESKey(groupKey);
            const self = await encryptToRecipient(keyRef.current, myPub, raw);
            await rpcSaveGroupKey(gid, me.id, self.ciphertext, self.iv, myPub, myPub);
          } catch {
          }
          try {
            const pkey = getPasswordKey();
            if (pkey) {
              const raw = await exportAESKey(groupKey);
              const enc = await encryptText(pkey, raw);
              await rpcSaveGroupKeyBackup(gid, enc.ciphertext, enc.iv);
            }
          } catch {
          }
        }
      }
    }

    if (!msgMapRef.current[key]) {
      const rows = await fetchMsgs(key).catch(() => [] as Msg[]);
      storeMsgs(key, rows);
    }
  }

  function peerKeys(userId: string, fallback?: string | null): string[] {
    const keys = userKeysRef.current[userId] ?? [];
    const set = new Set(keys);
    if (fallback) set.add(fallback);
    return Array.from(set).filter(Boolean);
  }

  async function freshUserKeys() {
    const now = Date.now();
    if (now - lastKeyFetchRef.current < 30_000) return;
    lastKeyFetchRef.current = now;
    try {
      const keys = await rpcGetAllUserKeys();
      const merged: Record<string, string[]> = { ...userKeysRef.current };
      for (const k of keys ?? []) {
        const arr = merged[k.user_id] ?? [];
        if (!arr.includes(k.public_key)) arr.push(k.public_key);
        merged[k.user_id] = arr;
      }
      userKeysRef.current = merged;
    } catch {
    }
  }

  async function dmCiphertexts(
    text: string | Uint8Array,
    peerId: string,
    peerPub?: string | null,
  ): Promise<Record<string, { ct: string; iv: string }> | undefined> {
    if (!privateKey) return undefined;
    await freshUserKeys();
    const myPub = await exportPublicRaw(privateKey).catch(() => '');
    if (!myPub) return undefined;
    const recipients = [
      ...peerKeys(peerId, peerPub),
      ...peerKeys(me?.id ?? '', me?.public_key),
    ];
    return encryptForKeys(privateKey, myPub, recipients, text).catch(() => undefined);
  }

  function patchLocalMsg(key: string, id: string, patch: Partial<Msg>) {
    const list = msgMapRef.current[key] ?? [];
    const idx = list.findIndex((x) => x.id === id);
    if (idx === -1) return;
    const next = [...list];
    next[idx] = { ...next[idx], ...patch };
    msgMapRef.current = { ...msgMapRef.current, [key]: next };
    setMsgMap(msgMapRef.current);
    writeMsgCache(key, next);
  }

  async function pushAfterSend(a: { key: string; kind: 'dm' | 'group' }, title: string, body: string) {
    try {
      if (getNotifPrivacy()) body = '🔒 Pesan baru';
      if (a.kind === 'dm') {
        const conv = dmsRef.current.find((d) => d.key === a.key);
        if (conv?.peerId) await triggerPush([conv.peerId], title, body, '/', conv.id);
      } else {
        const gid = a.key.replace('grp:', '');
        const members = await rpcGroupMembers(gid).catch(() => []);
        const ids = members.map((m) => m.id).filter((id) => id !== meRef.current?.id);
        if (ids.length) await triggerPush(ids, title, body);
      }
    } catch {
    }
  }

  async function resendMsg(m: Msg) {
    const a = activeRef.current;
    if (!a || !me) return;
    const key = a.key;
    if (m.msg_type !== 'text') {
      const media = mediaRetryRef.current.get(m.id);
      if (media) {
        await retryMedia(m, media.file, media.replyTo);
        return;
      }
    }
    patchLocalMsg(key, m.id, { pending: true, failed: false });
    try {
      if (a.kind === 'dm') {
        await rpcRetry(() =>
          rpcSendMessage({
            conversationId: key.replace('dm:', ''),
            senderId: me.id,
            ct: m.ciphertext,
            iv: m.iv ?? '',
            type: m.msg_type,
            path: m.media_path ?? null,
            replyTo: m.reply_to ?? null,
            id: m.id,
            cts: m.ciphertexts ?? null,
          }),
        );
      } else {
        await rpcRetry(() =>
          rpcGroupSend({
            groupId: key.replace('grp:', ''),
            senderId: me.id,
            ct: m.ciphertext,
            iv: m.iv ?? '',
            type: m.msg_type,
            path: m.media_path ?? null,
            replyTo: m.reply_to ?? null,
            id: m.id,
          }),
        );
      }
      refetchActive();
    } catch (e) {
      patchLocalMsg(key, m.id, { pending: false, failed: true });
      appNotify('GAGAL KIRIM ULANG', toastErr(e), { icon: '⚠️' });
    }
  }

  async function sendText(text: string, replyTo?: string | null) {
    const a = activeRef.current;
    if (!a) return;
    if (a.kind === 'dm' && isBlocked(a.key.replace('dm:', ''))) {
      appNotify('TERBLOKIR', 'Kontak ini diblokir. Buka blokir dulu dari header chat.', { icon: '🚫' });
      return;
    }
    await sendTextTo(a, text, replyTo);
  }

  async function sendTextTo(a: { key: string; kind: 'dm' | 'group' }, text: string, replyTo?: string | null) {
    const k = keyMapRef.current[a.key];
    if (!k) return;
    const enc = await encryptText(k, text).catch((e) => {
      appNotify('GAGAL ENKRIPSI', toastErr(e), { icon: '⚠️' });
      return null;
    });
    if (!enc) return;
    const { ciphertext, iv } = enc;
    const peer = a.kind === 'dm' ? a.key.replace('dm:', '') : undefined;
    const peerUser = users.find((u) => u.id === peer);
    const cts =
      a.kind === 'dm'
        ? await dmCiphertexts(text, peer ?? '', peerUser?.public_key)
        : undefined;
    const localId = crypto.randomUUID();
    const localMsg: Msg = {
      id: localId,
      conversation_id: a.kind === 'dm' ? a.key.replace('dm:', '') : undefined,
      group_id: a.kind === 'group' ? a.key.replace('grp:', '') : undefined,
      sender_id: me!.id,
      username: me!.username,
      ciphertext,
      iv,
      ciphertexts: cts,
      msg_type: 'text',
      reply_to: replyTo ?? null,
      deleted: false,
      pending: true,
      created_at: new Date().toISOString(),
    };
    appendRaw(a.key, localMsg);
    previewDm(a.key, localMsg);
    try {
      if (a.kind === 'dm') {
        await rpcRetry(() =>
          rpcSendMessage({
            conversationId: a.key.replace('dm:', ''),
            senderId: me!.id,
            ct: ciphertext,
            iv,
            type: 'text',
            replyTo,
            id: localId,
            cts,
          }),
        );
      } else {
        await rpcRetry(() =>
          rpcGroupSend({
            groupId: a.key.replace('grp:', ''),
            senderId: me!.id,
            ct: ciphertext,
            iv,
            type: 'text',
            replyTo,
            id: localId,
          }),
        );
      }
      refetchActive();
      scheduleExpiry(a.key, localId);
      void pushAfterSend(
        a,
        a.kind === 'dm' ? me!.username : (groupsRef.current.find((g) => g.id === a.key.replace('grp:', ''))?.name ?? 'Grup'),
        a.kind === 'dm' ? text.slice(0, 140) : `${me!.username}: ${text.slice(0, 120)}`,
      );
    } catch (e) {
      patchLocalMsg(a.key, localId, { pending: false, failed: true });
      appNotify('GAGAL KIRIM', toastErr(e), { icon: '⚠️' });
    }
  }

  async function sendMedia(file: File, replyTo?: string | null) {
    const a = activeRef.current;
    if (!a) return;
    if (a.kind === 'dm' && isBlocked(a.key.replace('dm:', ''))) {
      appNotify('TERBLOKIR', 'Kontak ini diblokir. Buka blokir dulu dari header chat.', { icon: '🚫' });
      return;
    }
    await sendMediaTo(a, file, replyTo);
  }

  async function sendMediaTo(a: { key: string; kind: 'dm' | 'group' }, file: File, replyTo?: string | null) {
    const BIG_MAX = 1024 * 1024 * 1024;
    if (file.size > BIG_MAX) {
      appNotify('FILE TERLALU BESAR', 'Maksimal 1 GB per kirim.', { icon: '⚠️' });
      return;
    }
    const k = keyMapRef.current[a.key];
    if (!k) return;
    const type = file.type.startsWith('video/')
      ? 'video'
      : file.type === 'image/gif'
        ? 'gif'
        : file.type.startsWith('audio/')
          ? 'voice'
          : 'image';
    const localId = crypto.randomUUID();
    mediaRetryRef.current.set(localId, { file, replyTo: replyTo ?? null });
    const dummyHeader = '{"p":1}';
    const localMsg: Msg = {
      id: localId,
      conversation_id: a.kind === 'dm' ? a.key.replace('dm:', '') : undefined,
      group_id: a.kind === 'group' ? a.key.replace('grp:', '') : undefined,
      sender_id: me!.id,
      username: me!.username,
      ciphertext: dummyHeader,
      iv: '',
      msg_type: type,
      media_path: null,
      media_status: 'uploading',
      uploadPct: 0,
      uploadPhase: 'compress',
      reply_to: replyTo ?? null,
      deleted: false,
      pending: true,
      created_at: new Date().toISOString(),
    };
    appendRaw(a.key, localMsg);
    previewDm(a.key, localMsg);
    try {
      if (a.kind === 'dm') {
        await rpcRetry(() =>
          rpcSendMessage({
            conversationId: a.key.replace('dm:', ''),
            senderId: me!.id,
            ct: dummyHeader,
            iv: '',
            type,
            replyTo,
            id: localId,
            mediaStatus: 'uploading',
          }),
        );
      } else {
        await rpcRetry(() =>
          rpcGroupSend({
            groupId: a.key.replace('grp:', ''),
            senderId: me!.id,
            ct: dummyHeader,
            iv: '',
            type,
            replyTo,
            id: localId,
            mediaStatus: 'uploading',
          }),
        );
      }
    } catch (e) {
      mediaRetryRef.current.delete(localId);
      patchLocalMsg(a.key, localId, { pending: false, failed: true, media_status: 'failed' });
      appNotify('GAGAL KIRIM MEDIA', toastErr(e), { icon: '⚠️' });
      return;
    }
    try {
      await deliverMedia(a, k, file, type, localId, replyTo ?? null);
      void pushAfterSend(
        a,
        a.kind === 'dm' ? me!.username : (groupsRef.current.find((g) => g.id === a.key.replace('grp:', ''))?.name ?? 'Grup'),
        a.kind === 'dm' ? `📎 ${type}` : `📎 ${type} dari ${me!.username}`,
      );
    } catch {
    }
  }

  async function deliverMedia(
    a: { key: string; kind: 'dm' | 'group' },
    k: CryptoKey,
    file: File,
    type: string,
    localId: string,
    replyTo: string | null,
  ) {
    try {
      const blob = await prepareMedia(file, type, (pct) => {
        patchLocalMsg(a.key, localId, { uploadPct: pct, uploadPhase: 'compress' });
      });
      let mediaKey = k;
      let cts: Record<string, { ct: string; iv: string }> | undefined;
      if (a.kind === 'dm' && privateKey && me) {
        try {
          await freshUserKeys();
          const mk = await randomAESKey();
          const raw = await exportAESKey(mk);
          const myPub = await exportPublicRaw(privateKey).catch(() => '');
          const peerId = a.key.replace('dm:', '');
          const item = dmsRef.current.find((d) => d.key === a.key);
          const recipients = [
            ...peerKeys(peerId, item?.public_key),
            ...peerKeys(me.id, me.public_key),
          ];
          if (myPub) {
            cts = await encryptForKeys(privateKey, myPub, recipients, raw).catch(() => undefined);
            if (cts && Object.keys(cts).length > 0) mediaKey = mk;
          }
        } catch {
        }
      }
      const plan = planBigMedia(blob);
      patchLocalMsg(a.key, localId, { uploadPct: 0, uploadPhase: 'upload' });
      const { path } = await uploadBigMedia(blob, mediaKey, plan, (sent, total) => {
        patchLocalMsg(a.key, localId, {
          uploadPct: total ? Math.round((sent / total) * 100) : 0,
          uploadPhase: 'upload',
        });
      });
      await rpcRetry(() => rpcSetMediaStatus(localId, 'ready', path, plan.header, plan.iv, cts ?? null));
      mediaRetryRef.current.delete(localId);
      evictCache(localId);
      patchLocalMsg(a.key, localId, {
        pending: false,
        media_status: 'ready',
        media_path: path,
        ciphertext: plan.header,
        iv: plan.iv,
        ciphertexts: cts ?? null,
        uploadPct: 100,
      });
      scheduleExpiry(a.key, localId);
      refetchActive();
    } catch (e) {
      try {
        await rpcRetry(() => rpcSetMediaStatus(localId, 'failed'));
      } catch {
      }
      patchLocalMsg(a.key, localId, { pending: false, failed: true, media_status: 'failed' });
      appNotify('GAGAL KIRIM MEDIA', toastErr(e), { icon: '⚠️' });
      throw e;
    }
  }

  async function retryMedia(m: Msg, file: File, replyTo: string | null) {
    const a = activeRef.current;
    if (!a) return;
    const k = keyMapRef.current[a.key];
    if (!k) return;
    patchLocalMsg(a.key, m.id, { pending: true, failed: false, media_status: 'uploading', uploadPct: 0, uploadPhase: 'compress' });
    try {
      await rpcRetry(() => rpcSetMediaStatus(m.id, 'uploading'));
    } catch {
    }
    await deliverMedia(a, k, file, m.msg_type, m.id, replyTo);
  }

  async function toggleReact(msgId: string, emoji: string) {
    const a = activeRef.current;
    if (!a || !me) return;
    const mine = (reactMap[msgId] ?? []).find((r) => r.user_id === me.id && r.emoji === emoji);
    try {
      if (a.kind === 'dm') {
        if (mine) await rpcRemoveReaction(msgId, me.id, emoji);
        else await rpcAddReaction(msgId, me.id, emoji);
      } else {
        if (mine) await rpcGroupRemoveReaction(msgId, me.id, emoji);
        else await rpcGroupAddReaction(msgId, me.id, emoji);
      }
    } catch {
    }
  }

  async function editMsg(msgId: string, newText: string) {
    const a = activeRef.current;
    if (!a) return;
    const k = keyMapRef.current[a.key];
    if (!k) return;
    try {
      const { ciphertext, iv } = await encryptText(k, newText);
      if (a.kind === 'dm') {
        const peer = dmsRef.current.find((d) => d.key === a.key)?.peerId;
        const peerUser = users.find((u) => u.id === peer);
        const cts = await dmCiphertexts(newText, peer ?? '', peerUser?.public_key);
        await rpcEditMessage(msgId, me!.id, ciphertext, iv, cts);
      } else {
        await rpcGroupEditMessage(msgId, me!.id, ciphertext, iv);
      }
      evictCache(msgId);
      refetchActive();
    } catch (e) {
      appNotify('GAGAL EDIT', toastErr(e), { icon: '⚠️' });
    }
  }

  async function delMsg(msgId: string) {
    const a = activeRef.current;
    if (!a || !me) return;
    try {
      if (a.kind === 'dm') await rpcDeleteMessage(msgId, me.id);
      else await rpcGroupDeleteMessage(msgId, me.id);
      evictCache(msgId);
      refetchActive();
    } catch (e) {
      appNotify('GAGAL HAPUS', toastErr(e), { icon: '⚠️' });
    }
  }

  async function startDm(u: User) {
    setModal(null);
    if (!me) return;
    const id = await rpcGetOrCreateConversation(me.id, u.id).catch((e) => {
      appNotify('GAGAL', toastErr(e), { icon: '⚠️' });
      return null;
    });
    if (!id) return;
    const item: ConversationItem = {
      key: DMK(id),
      kind: 'dm',
      id: id,
      peerId: u.id,
      name: u.username,
      public_key: u.public_key ?? undefined,
      online: !!onlineSet[u.id],
    };
    setDms((d) => [item, ...d.filter((x) => x.key !== item.key)]);
    openDm(item);
  }

  async function createGroup(name: string, memberIds: string[]) {
    setModal(null);
    if (!me || !privateKey) return;
    try {
      const gid = await rpcGroupCreate(name, me.id, [me.id, ...memberIds]);
      const groupKey = await randomAESKey();
      const rawKey = await exportAESKey(groupKey);
      const all = [me, ...users.filter((u) => memberIds.includes(u.id))];
      const myPub = await exportPublicRaw(privateKey).catch(() => '');
      await Promise.all(
        all.map(async (u) => {
          if (!u.public_key) return;
          const memberKeys = peerKeys(u.id, u.public_key);
          await Promise.all(
            memberKeys.map(async (mk) => {
              const { ciphertext, iv } = await encryptToRecipient(privateKey, mk, rawKey);
              await rpcSaveGroupKey(gid, u.id, ciphertext, iv, myPub, mk);
            }),
          );
        }),
      );
      if (myPub && getPasswordKey()) {
        try {
          const enc = await encryptText(getPasswordKey()!, rawKey);
          await rpcSaveGroupKeyBackup(gid, enc.ciphertext, enc.iv);
        } catch {
        }
      }
      keyMapRef.current[GRK(gid)] = groupKey;
      setKeyMap({ ...keyMapRef.current });
      const g: Group = { id: gid, name, created_by: me.id, created_at: new Date().toISOString() };
      setGroups((gs) => [g, ...gs]);
      openGroup({ key: GRK(gid), kind: 'group', name });
    } catch (e) {
      appNotify('GAGAL BUAT GRUP', toastErr(e), { icon: '⚠️' });
    }
  }

  async function addMember(gid: string, uid: string) {
    const key = GRK(gid);
    const k = keyMapRef.current[key];
    if (!me || !privateKey || !k) return;
    try {
      await rpcGroupAddMember(gid, uid);
      const u = users.find((x) => x.id === uid);
      const myPub = await exportPublicRaw(privateKey).catch(() => '');
      if (u?.public_key && myPub) {
        const raw = await exportAESKey(k);
        const memberKeys = peerKeys(uid, u.public_key);
        await Promise.all(
          memberKeys.map(async (mk) => {
            const { ciphertext, iv } = await encryptToRecipient(privateKey, mk, raw);
            await rpcSaveGroupKey(gid, uid, ciphertext, iv, myPub, mk);
          }),
        );
      }
      const members = await rpcGroupMembers(gid);
      setGroupMembers((m) => ({ ...m, [gid]: members }));
      appNotify('MEMBER DITAMBAH', `${u?.username ?? uid} masuk grup, kunci E2E dibagikan.`, { icon: '🔑' });
    } catch (e) {
      appNotify('GAGAL', toastErr(e), { icon: '⚠️' });
    }
  }

  function startCall() {
    if (!active || !me || active.kind !== 'dm') return;
    const item = dms.find((d) => d.key === active.key);
    if (!item?.peerId) return;
    const peer = users.find((u) => u.id === item.peerId) ?? { id: item.peerId, username: item.name };
    setCall({ mode: 'caller', peer });
    inCallRef.current = true;
  }

  function acceptCall() {
    if (!incoming) return;
    setCall({ mode: 'callee', peer: incoming });
    inCallRef.current = true;
    setIncoming(null);
  }
  function declineCall() {
    if (incoming) {
      import('../../lib/realtime').then(({ sendCall }) =>
        sendCall({ event: 'call-cancel', data: { from: me!.id, to: incoming.id } }),
      );
    }
    setIncoming(null);
  }

  async function startGroupCall() {
    if (!active || !me || active.kind !== 'group') return;
    const gid = active.key.replace('grp:', '');
    const g = groups.find((x) => x.id === gid);
    let mems = groupMembers[gid];
    if (!mems || mems.length === 0) {
      mems = await rpcGroupMembers(gid).catch(() => []);
      if (mems.length > 0) setGroupMembers((m) => ({ ...m, [gid]: mems }));
    }
    if (!mems || mems.length < 2) {
      appNotify('Video call grup', 'Butuh minimal 2 anggota grup.', { icon: '⚠️' });
      return;
    }
    const gc = {
      mode: 'caller' as const,
      callId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId: gid,
      groupName: g?.name ?? 'Grup',
      initiator: me.id,
      members: mems,
    };
    groupCallRef.current = gc;
    setGroupCall(gc);
    inCallRef.current = true;
  }

  function acceptGroupCall() {
    const inc = incomingGroupCallRef.current;
    if (!inc || !me) return;
    incomingGroupCallRef.current = null;
    setIncomingGroupCall(null);
    const gc = {
      mode: 'callee' as const,
      callId: inc.callId,
      groupId: inc.groupId,
      groupName: inc.groupName,
      initiator: inc.initiator,
      members: inc.members,
    };
    groupCallRef.current = gc;
    setGroupCall(gc);
    inCallRef.current = true;
  }
  function declineGroupCall() {
    incomingGroupCallRef.current = null;
    setIncomingGroupCall(null);
  }
  function closeGroupCall() {
    groupCallRef.current = null;
    setGroupCall(null);
    inCallRef.current = false;
  }

  async function logout() {
    if (me) rpcLogAccess(me.id, 'logout').catch(() => {});
    stopPresence();
    clearCache();
    clearChatCache();
    unregisterNativePush().catch(() => {});
    await unsubscribePush().catch(() => {});
    rpcLogout();
    keyMapRef.current = {};
    setKeyMap({});
    setDecryptPrivateKey(null);
    setPasswordKey(null);
    clearSession();
    setSession(null, null);
    setView('landing');
  }

  const allItems = useMemo(() => {
    const d = dms.map((it) => ({
      ...it,
      online: !!onlineSet[it.peerId ?? ''],
      lastMsg: it.lastMsg,
      unread: unread[it.key] ?? 0,
    }));
    const g = groups.map((gr) => ({
      key: GRK(gr.id),
      kind: 'group' as const,
      name: gr.name,
      lastMsg: undefined,
      unread: unread[GRK(gr.id)] ?? 0,
    }));
    return [...d, ...g];
  }, [dms, groups, onlineSet, unread]);

  const activeMsgs = (active ? msgMap[active.key] ?? [] : []).filter((m) => {
    const ex = expiryRef.current[m.id];
    if (ex && Date.now() > ex.at) return false;
    if (tombRef.current.has(m.id)) return false;
    return true;
  });
  const activeKeyObj = active ? keyMap[active.key] : undefined;
  const activePeer = active?.kind === 'dm' ? dms.find((d) => d.key === active.key) : undefined;
  const privacyVer = usePrivacyVersion();
  const activePeerBlocked = activePeer?.peerId ? isBlocked(activePeer.peerId) : false;
  const activeMuted = active ? isMuted(active.key) : false;
  const activeLastSeen = activePeer?.peerId ? formatLastSeen(getLastSeen()[activePeer.peerId]) : '';
  const groupLocked = active?.kind === 'group' ? !keyMap[active.key] : false;
  const activeTyper = active ? typing[active.key] ?? [] : [];
  const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
  const userNames = useMemo(() => {
    const m: Record<string, string> = {};
    users.forEach((u) => (m[u.id] = u.username));
    return m;
  }, [users]);

  const userAvatars = useMemo(() => {
    const m: Record<string, string | null> = {};
    users.forEach((u) => (m[u.id] = u.avatar ?? null));
    return m;
  }, [users]);

  return (
    <div className="app-height relative w-full max-w-full flex flex-col bg-abyss scanlines overflow-hidden">
      <CyberBg />

      {}
      <header className="pt-safe-2 relative z-20 flex items-center gap-2 px-3 sm:px-5 pb-3 border-b border-white/10 bg-panel/80 backdrop-blur-xl w-full max-w-full min-w-0">
        <div className="flex items-center gap-2 font-mono mr-auto">
          <span className="w-2.5 h-2.5 rounded-full bg-neon animate-pulseglow" />
          <span className="text-neon font-bold tracking-widest hidden sm:inline">NEXUS</span>
          <span className="text-slate-500 text-[10px] hidden md:inline">E2E // {me?.username}</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setModal('profile')}
            className="p-0.5 rounded-full border border-white/10 hover:border-neon/60 transition-colors"
            title="Foto profil"
          >
            <Avatar id={me!.id} name={me!.username} size={28} src={avatarUrl(me!.avatar)} />
          </button>
          <button
            onClick={() => setModal('ghost')}
            className={`p-2 rounded-lg border transition-colors ${ghostMode ? 'text-neon border-neon/60 bg-neon/10 animate-pulse' : 'text-slate-400 border-white/10 hover:text-neon'}`}
            title="Ghost mode"
          >
            <Ghost size={17} />
          </button>
          <button
            onClick={() => setModal('ai')}
            className="p-2 rounded-lg text-slate-400 hover:text-lime border border-white/10"
            title="NEXUS AI — asisten privat offline"
          >
            <Sparkles size={17} />
          </button>
          <button
            onClick={async () => {
              const ok = await ensurePush();
              if (ok) {
                appNotify('NOTIFIKASI AKTIF', 'Push notification aktif di perangkat ini.', { icon: '🔔' });
              } else {
              const denied = Notification.permission === 'denied';
              if (needsIOSInstall()) {
                appNotify(
                  'BUTUH DI-PASANG DULU',
                  'Di iPhone/iPad: ketuk ikon Bagikan (⬆️) di Safari → "Tambah ke Layar Utama", buka NEXUS dari ikon itu, baru ketuk 🔔 lagi.',
                  { icon: '📲' },
                );
              } else {
                appNotify(
                  'NOTIFIKASI DIBLOKIR',
                  denied
                    ? 'Browser memblokir izin. Buka pengaturan situs di browser lalu izinkan notifikasi, kemudian ketuk 🔔 lagi.'
                    : 'Notifikasi tidak aktif. Ketuk lagi untuk minta izin, atau pasang app lewat tombol PASANG di atas.',
                  { icon: '🚫' },
                );
              }
              }
            }}
            className="relative p-2 rounded-lg text-slate-400 hover:text-neon border border-white/10"
            title="Notifikasi"
          >
            <Bell size={17} />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-virus text-white text-[9px] font-mono flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </button>
          <button
            onClick={async () => {
              if (!me) return;
              appNotify('UJI NOTIF', 'Mengirim notif tes ke perangkat ini…', { icon: '⏳' });
              if (isNativeApp()) {
                const r = await testNativePushSelf(me.id);
                if (r.ok && r.sent > 0) {
                  appNotify('✅ NOTIF TES TERKIRIM', `Push diterima server & dikirim ke ${r.sent} perangkat. Cek layar perangkat ini!`, { icon: '✅' });
                } else if (r.err) {
                  appNotify('❌ UJI NOTIF GAGAL', r.err, { icon: '❌' });
                } else {
                  const detail = (r.results ?? []).map((x) => `${x.ok ? 'OK' : 'GAGAL'}: ${x.err ?? x.endpoint}`).join('\n');
                  appNotify('❌ UJI NOTIF GAGAL', `Tidak ada perangkat yang menerima.\n${detail || 'Perangkat belum terdaftar — ketuk 🔔 dulu.'}`, { icon: '❌' });
                }
                return;
              }
              const pushOk = await ensurePush();
              if (!pushOk) {
                appNotify('❌ UJI NOTIF GAGAL', 'Push web belum aktif. Ketuk 🔔 dan izinkan notifikasi, lalu coba lagi.', { icon: '❌' });
                return;
              }
              const r = await testPushSelf(me.id);
              if (r.ok && r.sent > 0) {
                appNotify('✅ NOTIF TES TERKIRIM', `Push diterima server & dikirim ke ${r.sent} perangkat. Cek layar perangkat ini!`, { icon: '✅' });
              } else if (r.err) {
                appNotify('❌ UJI NOTIF GAGAL', r.err, { icon: '❌' });
              } else {
                const detail = (r.results ?? []).map((x) => `${x.ok ? 'OK' : 'GAGAL'}: ${x.err ?? x.endpoint}`).join('\n');
                appNotify('❌ UJI NOTIF GAGAL', `Tidak ada perangkat yang menerima.\n${detail || 'Perangkat belum terdaftar — ketuk 🔔 dulu.'}`, { icon: '❌' });
              }
            }}
            className="relative p-2 rounded-lg text-slate-400 hover:text-neon border border-white/10"
            title="Uji notifikasi (kirim push tes ke perangkat ini)"
          >
            <Send size={17} />
          </button>
          <button
            onClick={showInstallBanner}
            className="p-2 rounded-lg text-slate-400 hover:text-neon border border-white/10"
            title="Pasang aplikasi"
          >
            <Download size={17} />
          </button>
          <button
            onClick={logout}
            className="p-2 rounded-lg text-slate-400 hover:text-virus border border-white/10"
            title="Keluar"
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      {}
      <div className="relative z-20 flex border-b border-white/10 bg-black/30">
        {[
          { id: 'chats', label: 'CHATS', icon: MessageSquare },
          { id: 'reels', label: 'REELS', icon: Music },
          { id: 'watch', label: 'NOBAR', icon: MonitorPlay },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 font-mono text-xs tracking-widest border-b-2 transition-colors ${
              tab === t.id ? 'border-neon text-neon bg-neon/5' : 'border-transparent text-slate-500 hover:text-white'
            }`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {}
      <div className="relative z-10 flex-1 flex min-h-0 min-w-0">
        {}
        <aside
          className={`${tab === 'chats' ? (active ? 'hidden md:flex' : 'flex') : 'hidden'} w-full md:w-[360px] min-w-0 flex-col border-r border-white/10 bg-panel/50 min-h-0`}
        >
          <div className="border-b border-white/10">
            <Stories />
          </div>
          <ConversationList
            items={allItems}
            activeKey={active?.key ?? null}
            onSelect={(it) => (it.kind === 'dm' ? openDm(it) : openGroup(it))}
            onNewChat={() => setModal('newchat')}
            onNewGroup={() => setModal('newgroup')}
            ghostOn={ghostMode}
          />
        </aside>

        {}
        <main className={`flex-1 min-h-0 min-w-0 max-w-full ${tab === 'chats' ? (active ? 'flex' : 'hidden md:flex') : 'hidden'}`}>
          {active && activeKeyObj ? (
            <Conversation
              kind={active.kind}
              title={activePeer?.name ?? groups.find((g) => GRK(g.id) === active.key)?.name ?? ''}
              convKey={active.key}
              peerId={activePeer?.peerId}
              peerAvatar={activePeer?.avatar}
              online={activePeer?.peerId ? !!onlineSet[activePeer.peerId] : undefined}
              messages={activeMsgs}
              keyObj={activeKeyObj}
              reactions={reactMap}
              typing={activeTyper}
              ghostOn={ghostMode}
              onSendText={sendText}
              onSendMedia={sendMedia}
              onReact={toggleReact}
              onEdit={editMsg}
              onDelete={delMsg}
              onRetry={resendMsg}
              onOpenCall={active.kind === 'dm' ? startCall : undefined}
              onOpenGroupCall={active.kind === 'group' ? startGroupCall : undefined}
              onAddMember={active.kind === 'group' ? () => setAddMemberFor(active.key.replace('grp:', '')) : undefined}
              groupLocked={active.kind === 'group' ? groupLocked : false}
              userNames={userNames}
              userAvatars={userAvatars}
              onBack={() => setActive(null)}
              disappearSecs={getDisappearSeconds(active.key)}
              onCycleDisappear={() => cycleDisappearFor(active.key)}
              onForward={(m) => setForwardMsg(m)}
              peerBlocked={activePeerBlocked}
              onToggleBlock={() => {
                if (activePeer?.peerId) toggleBlocked(activePeer.peerId);
              }}
              muted={activeMuted}
              onToggleMute={() => toggleMuted(active.key)}
              lastSeenLabel={activeLastSeen}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
              <div className="text-5xl mb-4 neon-text">◆</div>
              <div className="font-mono text-sm">Pilih percakapan</div>
              <div className="font-mono text-xs text-slate-600 mt-2">semua kanal terenkripsi end-to-end</div>
            </div>
          )}
        </main>

        {}
        <div className={`flex-1 min-h-0 min-w-0 ${tab === 'reels' ? 'flex lg:flex' : 'hidden'}`}>
          <Reels />
        </div>
        <div className={`flex-1 min-h-0 min-w-0 ${tab === 'watch' ? 'flex lg:flex' : 'hidden'}`}>
          <WatchParty />
        </div>
      </div>

      {}
      <AnimatePresence>
        {modal === 'newchat' && (
          <NewChatModal users={users} meId={me!.id} onPick={startDm} onClose={() => setModal(null)} />
        )}
        {modal === 'newgroup' && (
          <NewGroupModal users={users} meId={me!.id} onCreate={createGroup} onClose={() => setModal(null)} />
        )}
        {modal === 'ghost' && <GhostSettingsModal onClose={() => setModal(null)} />}
        {modal === 'profile' && <ProfileModal onClose={() => setModal(null)} />}
        {modal === 'ai' && <AiPanel onClose={() => setModal(null)} />}
      </AnimatePresence>

      {addMemberFor && (
        <AddMemberModal
          users={users}
          meId={me!.id}
          existing={(groupMembers[addMemberFor] ?? []).map((m) => m.id)}
          onAdd={(uid) => addMember(addMemberFor, uid)}
          onClose={() => setAddMemberFor(null)}
        />
      )}

      {forwardMsg && (
        <ForwardPicker
          dms={dms.map((d) => ({ key: d.key, name: d.name, peerId: d.peerId }))}
          groups={groups.map((g) => ({ id: g.id, name: g.name }))}
          excludeKey={active?.key ?? ''}
          onPick={(targetKey) => {
            forwardTo(forwardMsg, targetKey).finally(() => setForwardMsg(null));
          }}
          onClose={() => setForwardMsg(null)}
        />
      )}

      {incoming && <IncomingCallOverlay peer={incoming} onAccept={acceptCall} onDecline={declineCall} />}

      {incomingGroupCall && !groupCall && (
        <IncomingGroupCallOverlay
          groupName={incomingGroupCall.groupName}
          members={incomingGroupCall.members}
          initiator={incomingGroupCall.initiator}
          callId={incomingGroupCall.callId}
          me={me!}
          onAccept={acceptGroupCall}
          onDecline={declineGroupCall}
        />
      )}

      {call && (
        <VideoCall mode={call.mode} peer={call.peer} onClose={() => { setCall(null); inCallRef.current = false; }} />
      )}

      {groupCall && (
        <GroupVideoCall
          callId={groupCall.callId}
          groupId={groupCall.groupId}
          groupName={groupCall.groupName}
          initiator={groupCall.initiator}
          members={groupCall.members}
          mode={groupCall.mode}
          me={me!}
          onClose={closeGroupCall}
        />
      )}

      <InstallBanner />
    </div>
  );
}
