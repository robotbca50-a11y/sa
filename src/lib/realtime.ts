import { supabase } from './supabase';
import { useStore } from './store';
import type { Msg, Reaction, Story, LocRow } from '../types';
import { rpcUpsertLocation } from './api';

let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
let presenceKey = '';

export function initPresence() {
  const { me } = useStore.getState();
  if (!me || presenceChannel) return;

  presenceChannel = supabase.channel('nexus-presence', { config: { presence: { key: me.id } } });

  presenceChannel
    .on('presence', { event: 'sync' }, () => {
      const state = presenceChannel!.presenceState();
      const map: Record<string, boolean> = {};
      Object.keys(state).forEach((k) => {
        const s = state[k] as any[];
        const first = Array.isArray(s) ? s[0] : s;
        if (first?.user_id) map[first.user_id as string] = true;
      });
      useStore.getState().setOnlineAll(map);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      const first = newPresences?.[0] as any;
      if (first?.user_id) useStore.getState().setOnline(first.user_id, true);
    })
    .on('presence', { event: 'leave' }, ({ key }) => {
      if (key !== presenceKey) {
        // presenceState after leave is authoritative; sync event handles it.
      }
    });

  presenceChannel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      presenceKey = me.id;
      await presenceChannel!.track({ user_id: me.id, username: me.username, online_at: new Date().toISOString() });
    }
  });
}

export function stopPresence() {
  presenceChannel?.untrack?.();
  presenceChannel?.unsubscribe();
  presenceChannel = null;
}

// ---------- REALTIME: MESSAGES ----------
export function subscribeMessages(cb: (m: Msg, kind: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
  return supabase
    .channel('nexus-dm')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages' },
      (payload) => cb(payload.new as Msg, (payload.eventType || 'INSERT') as any),
    )
    .subscribe();
}

export function subscribeGroupMessages(cb: (m: Msg, kind: 'INSERT' | 'UPDATE' | 'DELETE') => void) {
  return supabase
    .channel('nexus-group')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_messages' },
      (payload) => cb(payload.new as Msg, (payload.eventType || 'INSERT') as any),
    )
    .subscribe();
}

export function subscribeReactions(cb: (r: Reaction, kind: 'INSERT' | 'DELETE') => void) {
  return supabase
    .channel('nexus-reactions')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'reactions' },
      (p) => cb((p.eventType === 'DELETE' ? p.old : p.new) as Reaction, (p.eventType === 'DELETE' ? 'DELETE' : 'INSERT') as any),
    )
    .subscribe();
}

export function subscribeGroupReactions(cb: (r: Reaction, kind: 'INSERT' | 'DELETE') => void) {
  return supabase
    .channel('nexus-group-reactions')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_reactions' },
      (p) => cb((p.eventType === 'DELETE' ? p.old : p.new) as Reaction, (p.eventType === 'DELETE' ? 'DELETE' : 'INSERT') as any),
    )
    .subscribe();
}

export function subscribeStories(cb: (s: Story, kind: 'INSERT' | 'DELETE') => void) {
  return supabase
    .channel('nexus-stories')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'stories' },
      (p) => cb(p.new as Story, (p.eventType === 'DELETE' ? 'DELETE' : 'INSERT') as any),
    )
    .subscribe();
}

export function subscribeLocations(cb: (l: LocRow) => void) {
  return supabase
    .channel('nexus-locations')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'user_locations' },
      (p) => cb(p.new as LocRow),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'user_locations' },
      (p) => cb(p.new as LocRow),
    )
    .subscribe();
}

// ---------- BROADCAST: TYPING / CALL / WATCH ----------
let liveChannel: ReturnType<typeof supabase.channel> | null = null;

function live() {
  if (!liveChannel) {
    liveChannel = supabase.channel('nexus-live');
    liveChannel.subscribe();
  }
  return liveChannel;
}

export function sendTyping(key: string, isGroup: boolean) {
  const { me } = useStore.getState();
  if (!me) return;
  live().send({ type: 'broadcast', event: 'typing', payload: { key, isGroup, user_id: me.id } });
}

export function onTyping(cb: (key: string, isGroup: boolean, userId: string) => void) {
  let active = true;
  live().on('broadcast', { event: 'typing' }, ({ payload }) => {
    if (active) cb(payload.key, payload.isGroup, payload.user_id);
  });
  return () => {
    active = false;
  };
}

export function sendCall(payload: any) {
  live().send({ type: 'broadcast', event: payload.event, payload: payload.data });
}

export function onCall(cb: (event: string, data: any) => void) {
  let active = true;
  const handler = ({ payload }: any) => {
    if (active) cb(payload.event, payload.data);
  };
  ['call-invite', 'call-offer', 'call-answer', 'call-ice', 'call-hangup', 'call-cancel'].forEach((ev) => {
    live().on('broadcast', { event: ev }, handler);
  });
  return () => {
    active = false;
  };
}

export function sendWatch(payload: any) {
  live().send({ type: 'broadcast', event: 'watch', payload });
}

export function onWatch(cb: (p: any) => void) {
  let active = true;
  live().on('broadcast', { event: 'watch' }, ({ payload }) => {
    if (active) cb(payload);
  });
  return () => {
    active = false;
  };
}

// ---------- LOCATION TRACKING (opt-in, update tiap 1 menit, lanjut saat logout) ----------
let locTimer: ReturnType<typeof setInterval> | null = null;
let locUserId: string | null = null;

export function startLocationSharing() {
  const { me } = useStore.getState();
  if (!me || !('geolocation' in navigator)) return;
  if (!localStorage.getItem('nexus:share-loc')) return;
  if (locTimer && locUserId === me.id) return;
  if (locTimer) {
    clearInterval(locTimer);
    locTimer = null;
  }
  locUserId = me.id;

  const report = () => {
    if (!locUserId) {
      stopLocationSharing();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rpcUpsertLocation(
          locUserId!,
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
        ).catch(() => {});
      },
      () => {
        localStorage.removeItem('nexus:share-loc');
        stopLocationSharing();
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
  };

  report();
  locTimer = setInterval(report, 60_000);
}

export function stopLocationSharing() {
  if (locTimer) {
    clearInterval(locTimer);
    locTimer = null;
  }
  locUserId = null;
}
