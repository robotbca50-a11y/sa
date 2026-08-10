import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';
import { loadToken, saveToken, clearSession } from './session';
import type {
  User,
  Msg,
  Group,
  Story,
  Reel,
  Reaction,
  LocRow,
  AccessLog,
} from '../types';

function unwrap<T>(r: { data: T | null; error: any }, fallback: T): T {
  if (r.error) throw r.error;
  return (r.data ?? fallback) as T;
}

export function blockAlert() {
  alert('DASAR ANAK KONTOL 🤣🤣🤣🤣');
}

export function isBlockMessage(msg: string) {
  return /diblokir|diblock|terlalu banyak|terlalu cepat|sudah terdaftar|sudah daftar|tidak bisa mendaftar|rate limit|blokir/i.test(msg);
}

const FP_KEY = 'nexus:fingerprint';
const REGISTERED_KEY = 'nexus:registered';

export function deviceFingerprint(): string {
  try {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      fp = (crypto.randomUUID?.() ?? `fp-${Date.now()}-${Math.random()}`) as string;
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    return 'fp-unknown';
  }
}

export function markBrowserRegistered() {
  try {
    localStorage.setItem(REGISTERED_KEY, '1');
  } catch {
    /* noop */
  }
}

export function isBrowserRegistered(): boolean {
  try {
    return localStorage.getItem(REGISTERED_KEY) === '1';
  } catch {
    return false;
  }
}

export async function nxRpc(name: string, args: Record<string, unknown> = {}, retries = 3) {
  const headers: Record<string, string> = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  };
  const token = loadToken();
  if (token) headers['x-nexus-token'] = token;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(args),
    });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const bodyErr = (data && typeof data === 'object' && (data as { message?: unknown }).message) || text;
      const msg = String(bodyErr || `HTTP ${res.status}`);
      // Kalau server lagi kena rate-limit (burst sesaat / IP wifi bersama), tunggu
      // sebentar lalu coba lagi — jangan langsung menyerah & menampilkan error.
      if (retries > 0 && /terlalu banyak permintaan/i.test(msg)) {
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
        return nxRpc(name, args, retries - 1);
      }
      return { data: null, error: { message: msg } };
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

// ---------- AUTH / ADMIN (backend lama) ----------
export async function getClientIp(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.ip === 'string' && data.ip ? data.ip : null;
  } catch {
    return null;
  }
}

export async function rpcLogin(username: string, password: string): Promise<User> {
  const { data, error } = await nxRpc('login_user', {
    p_username: username,
    p_password: password,
  });
  if (error) {
    const msg = normalizeErr(error.message);
    if (isBlockMessage(msg)) blockAlert();
    throw new Error(msg);
  }
  const rows = data as unknown as (User & { token?: string })[];
  if (!rows || rows.length === 0) throw new Error('Username / password salah, atau belum di-ACC.');
  const row = rows[0];
  if (row.token) {
    saveToken(row.token);
    void row.token;
    delete (row as any).token;
  }
  return row;
}

export async function rpcRegister(username: string, password: string, publicKey: string, ip?: string | null) {
  if (isBrowserRegistered()) {
    blockAlert();
    throw new Error('Pendaftaran sudah terkunci untuk browser ini 🤣');
  }
  const fingerprint = deviceFingerprint();
  const run = (withFp: boolean) =>
    nxRpc('register_user', {
      p_username: username,
      p_password: password,
      p_public_key: publicKey,
      p_ip: ip ?? null,
      p_fingerprint: withFp ? fingerprint : undefined,
    });
  try {
    const { data, error } = await run(true);
    if (error) {
      const msg = normalizeErr(error.message);
      if (isBlockMessage(msg)) blockAlert();
      throw new Error(msg);
    }
    markBrowserRegistered();
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isFuncNotFound(msg)) throw e;
    const { data, error } = await run(false);
    if (error) {
      const m2 = normalizeErr(error.message);
      if (isBlockMessage(m2)) blockAlert();
      throw new Error(m2);
    }
    markBrowserRegistered();
    return data;
  }
}

export async function rpcLogout() {
  try {
    await nxRpc('logout_user', { p_token: loadToken() ?? '' });
  } catch {
    /* noop */
  }
  clearSession();
}

export async function rpcGetBlackout(userId: string): Promise<boolean> {
  const { data, error } = await nxRpc('get_blackout', { p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

export async function rpcGetBlackoutPublic(username: string): Promise<boolean> {
  const { data, error } = await nxRpc('get_blackout_public', { p_username: username });
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

export async function rpcGetBlackoutIp(): Promise<boolean> {
  const { data, error } = await nxRpc('get_blackout_ip', {});
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

export async function rpcSetBlackout(adminUser: string, adminPass: string, userId: string, active: boolean) {
  const { error } = await nxRpc('set_blackout', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
    p_target_user_id: userId,
    p_active: active,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcListBlackouts(
  adminUser: string,
  adminPass: string,
): Promise<{ target_user_id: string; updated_at: string }[]> {
  const { data, error } = await nxRpc('list_blackouts', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as { target_user_id: string; updated_at: string }[]) ?? [];
}

export async function rpcPendingUsers(adminUser: string, adminPass: string): Promise<User[]> {
  const { data, error } = await nxRpc('list_pending_users', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcSetUserStatus(
  adminUser: string,
  adminPass: string,
  targetId: string,
  status: 'approved' | 'rejected',
) {
  const { error } = await nxRpc('set_user_status', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
    p_target_id: targetId,
    p_status: status,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcAdminCheck(adminUser: string, adminPass: string) {
  const { data, error } = await nxRpc('admin_check', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

export async function rpcAllLocations(adminUser: string, adminPass: string): Promise<LocRow[]> {
  const { data, error } = await nxRpc('get_all_locations', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as LocRow[]) ?? [];
}

export async function rpcAccessLogs(adminUser: string, adminPass: string): Promise<AccessLog[]> {
  const { data, error } = await nxRpc('get_access_logs', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as AccessLog[]) ?? [];
}

export async function rpcUserStats(
  adminUser: string,
  adminPass: string,
): Promise<{ total: number; pending: number; online: number; today: number }> {
  const { data, error } = await nxRpc('get_user_stats', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  const r = (data as any) ?? {};
  return {
    total: r.total ?? 0,
    pending: r.pending ?? 0,
    online: r.online ?? 0,
    today: r.today ?? 0,
  };
}

export async function rpcAllUsers(adminUser: string, adminPass: string): Promise<User[]> {
  const { data, error } = await nxRpc('list_all_users', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcDeleteUser(adminUser: string, adminPass: string, targetId: string) {
  const { error } = await nxRpc('delete_user', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
    p_target_id: targetId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcPurgeAllUsers(adminUser: string, adminPass: string) {
  const { error } = await nxRpc('purge_all_users_except_master', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcUpdatePublicKey(username: string, password: string, newPublicKey: string) {
  const { error } = await nxRpc('update_public_key', {
    p_username: username,
    p_password: password,
    p_new_public_key: newPublicKey,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- DIRECTORY / DM ----------
export async function rpcListUsers(): Promise<User[]> {
  const { data, error } = await nxRpc('list_approved_users');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcGetOrCreateConversation(a: string, b: string): Promise<string> {
  const { data, error } = await nxRpc('get_or_create_conversation', {
    p_user_a: a,
    p_user_b: b,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return data as string;
}

export async function rpcMyConversations(me: string): Promise<any[]> {
  const { data, error } = await nxRpc('my_conversations', { p_user_id: me });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as any[]) ?? [];
}

function isFuncNotFound(msg: string) {
  return /could not find the function|does not exist|functions? .* was not found/i.test(msg);
}

export async function rpcSendMessage(p: {
  conversationId: string;
  senderId: string;
  ct: string;
  iv: string;
  type: string;
  path?: string | null;
  replyTo?: string | null;
  id?: string | null;
  cts?: Record<string, { ct: string; iv: string }> | null;
}) {
  try {
    const { error } = await nxRpc('send_message', {
      p_conversation_id: p.conversationId,
      p_sender_id: p.senderId,
      p_ciphertext: p.ct,
      p_iv: p.iv,
      p_msg_type: p.type,
      p_media_path: p.path ?? null,
      p_reply_to: p.replyTo ?? null,
      p_id: p.id ?? undefined,
      p_ciphertexts: p.cts ?? null,
    });
    if (error) throw new Error(normalizeErr(error.message));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isFuncNotFound(msg)) throw e;
    const { error } = await nxRpc('send_message', {
      p_conversation_id: p.conversationId,
      p_sender_id: p.senderId,
      p_ciphertext: p.ct,
      p_iv: p.iv,
      p_msg_type: p.type,
      p_media_path: p.path ?? null,
      p_reply_to: p.replyTo ?? null,
    });
    if (error) throw new Error(normalizeErr(error.message));
  }
}

export async function rpcGetMessages(convId: string, userId?: string | null): Promise<Msg[]> {
  const { data, error } = await nxRpc('get_messages', {
    p_conversation_id: convId,
    p_user_id: userId ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[]) ?? [];
}

export async function rpcMarkMessagesRead(userId: string, convId: string) {
  const { error } = await nxRpc('mark_messages_read', { p_user_id: userId, p_conversation_id: convId });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcMarkGroupMessagesRead(userId: string, groupId: string) {
  const { error } = await nxRpc('mark_group_messages_read', { p_user_id: userId, p_group_id: groupId });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetMessage(id: string, userId?: string | null): Promise<Msg | null> {
  const { data, error } = await nxRpc('get_message', { p_id: id, p_user_id: userId ?? null });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[])?.[0] ?? null;
}

export async function rpcEditMessage(
  id: string,
  sender: string,
  ct: string,
  iv: string,
  cts?: Record<string, { ct: string; iv: string }> | null,
) {
  const { error } = await nxRpc('edit_message', {
    p_message_id: id,
    p_sender_id: sender,
    p_ciphertext: ct,
    p_iv: iv,
    p_ciphertexts: cts ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcDeleteMessage(id: string, sender: string) {
  const { error } = await nxRpc('delete_message', {
    p_message_id: id,
    p_sender_id: sender,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcAddReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await nxRpc('add_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcRemoveReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await nxRpc('remove_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- GRUP ----------
export async function rpcGroupCreate(
  name: string,
  creator: string,
  members: string[],
): Promise<string> {
  const { data, error } = await nxRpc('group_create', {
    p_name: name,
    p_creator: creator,
    p_members: members,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return data as string;
}

export async function rpcMyGroups(userId: string): Promise<Group[]> {
  const { data, error } = await nxRpc('my_groups', { p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Group[]) ?? [];
}

export async function rpcGroupAddMember(groupId: string, userId: string) {
  const { error } = await nxRpc('group_add_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupMembers(groupId: string): Promise<User[]> {
  const { data, error } = await nxRpc('group_members', { p_group_id: groupId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcGroupSend(p: {
  groupId: string;
  senderId: string;
  ct: string;
  iv: string;
  type: string;
  path?: string | null;
  replyTo?: string | null;
  id?: string | null;
}) {
  try {
    const { error } = await nxRpc('group_send', {
      p_group_id: p.groupId,
      p_sender_id: p.senderId,
      p_ciphertext: p.ct,
      p_iv: p.iv,
      p_msg_type: p.type,
      p_media_path: p.path ?? null,
      p_reply_to: p.replyTo ?? null,
      p_id: p.id ?? undefined,
    });
    if (error) throw new Error(normalizeErr(error.message));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isFuncNotFound(msg)) throw e;
    const { error } = await nxRpc('group_send', {
      p_group_id: p.groupId,
      p_sender_id: p.senderId,
      p_ciphertext: p.ct,
      p_iv: p.iv,
      p_msg_type: p.type,
      p_media_path: p.path ?? null,
      p_reply_to: p.replyTo ?? null,
    });
    if (error) throw new Error(normalizeErr(error.message));
  }
}

export async function rpcGetGroupMessages(groupId: string, userId?: string | null): Promise<Msg[]> {
  const { data, error } = await nxRpc('get_group_messages', {
    p_group_id: groupId,
    p_user_id: userId ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[]) ?? [];
}

export async function rpcGetGroupMessage(id: string, userId?: string | null): Promise<Msg | null> {
  const { data, error } = await nxRpc('get_group_message', { p_id: id, p_user_id: userId ?? null });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[])?.[0] ?? null;
}

export async function rpcGroupEditMessage(id: string, sender: string, ct: string, iv: string) {
  const { error } = await nxRpc('group_edit_message', {
    p_message_id: id,
    p_sender_id: sender,
    p_ciphertext: ct,
    p_iv: iv,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupDeleteMessage(id: string, sender: string) {
  const { error } = await nxRpc('group_delete_message', {
    p_message_id: id,
    p_sender_id: sender,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupAddReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await nxRpc('group_add_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupRemoveReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await nxRpc('group_remove_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- GROUP KEY (E2E grup) ----------
// publicKey: kunci publik PEMBERI (saver). memberKey: kunci publik member yang dituju.
// Null = pakai kunci utama akun si pemanggil.
export async function rpcSaveGroupKey(
  groupId: string,
  userId: string,
  encKey: string,
  iv: string,
  publicKey?: string | null,
  memberKey?: string | null,
) {
  const { error } = await nxRpc('group_save_key', {
    p_group_id: groupId,
    p_user_id: userId,
    p_enc_key: encKey,
    p_iv: iv,
    p_public_key: publicKey ?? null,
    p_member_key: memberKey ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetGroupKey(
  groupId: string,
  userId: string,
): Promise<{ enc_key: string; iv: string; public_key: string | null }[] | null> {
  const { data, error } = await nxRpc('group_get_key', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as { enc_key: string; iv: string; public_key: string | null }[]) ?? null;
}

// Backup kunci grup (recovery device baru), dienkripsi kunci password akun.
export async function rpcSaveGroupKeyBackup(groupId: string, encKey: string, iv: string) {
  const { error } = await nxRpc('group_save_key_backup', {
    p_group_id: groupId,
    p_enc_key: encKey,
    p_iv: iv,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetGroupKeyBackup(
  groupId: string,
): Promise<{ enc_key: string; iv: string } | null> {
  const { data, error } = await nxRpc('group_get_key_backup', {
    p_group_id: groupId,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as { enc_key: string; iv: string }[])?.[0] ?? null;
}

// Semua kunci publik (utama + sekunder) user approved untuk enkripsi multi-key.
export async function rpcGetAllUserKeys(): Promise<{ user_id: string; public_key: string }[]> {
  const { data, error } = await nxRpc('get_all_user_keys');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as { user_id: string; public_key: string }[]) ?? [];
}

// ---------- STORY ----------
export async function rpcAddStory(userId: string, mediaPath: string, caption: string, kind: string) {
  const { error } = await nxRpc('story_add', {
    p_user_id: userId,
    p_media_path: mediaPath,
    p_caption: caption,
    p_kind: kind,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetStories(): Promise<Story[]> {
  const { data, error } = await nxRpc('get_stories');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Story[]) ?? [];
}

export async function rpcGetMyStories(userId: string): Promise<Story[]> {
  const { data, error } = await nxRpc('get_my_stories', { p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Story[]) ?? [];
}

export async function rpcViewStory(storyId: string, userId: string) {
  const { error } = await nxRpc('view_story', {
    p_story_id: storyId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcDeleteStory(storyId: string, userId: string) {
  const { error } = await nxRpc('delete_story', {
    p_story_id: storyId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcStoryViews(storyId: string): Promise<any[]> {
  const { data, error } = await nxRpc('get_story_views', { p_story_id: storyId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as any[]) ?? [];
}

// ---------- REELS ----------
export async function rpcAddReel(p: {
  userId: string;
  source: string;
  tiktokUrl?: string | null;
  mediaPath?: string | null;
  caption?: string;
}) {
  const { error } = await nxRpc('reel_add', {
    p_user_id: p.userId,
    p_source: p.source,
    p_tiktok_url: p.tiktokUrl ?? null,
    p_media_path: p.mediaPath ?? null,
    p_caption: p.caption ?? '',
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetReels(): Promise<Reel[]> {
  const { data, error } = await nxRpc('get_reels');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Reel[]) ?? [];
}

export async function rpcDeleteReel(id: string, userId: string) {
  const { error } = await nxRpc('delete_reel', { p_reel_id: id, p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- LOKASI & LOG ----------
export async function rpcUpsertLocation(userId: string, lat: number, lng: number, accuracy: number) {
  const { error } = await nxRpc('upsert_location', {
    p_user_id: userId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcLogAccess(userId: string, event: string, ip?: string, ua?: string) {
  const { error } = await nxRpc('log_access', {
    p_user_id: userId,
    p_event: event,
    p_ip: ip ?? null,
    p_user_agent: ua ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- STORAGE ----------
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

export async function uploadMedia(bucket: string, path: string, blob: Blob, userId?: string | null) {
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error('File terlalu besar — maksimal 200 MB per kirim.');
  }
  if (userId) {
    try {
      const { error } = await nxRpc('log_media_upload', {
        p_user_id: userId,
        p_bytes: blob.size,
      });
      if (error) throw new Error(normalizeErr(error.message));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isFuncNotFound(msg)) throw e;
    }
  }
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    upsert: true,
    contentType: blob.type,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export function mediaUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function downloadMedia(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw new Error(normalizeErr(error.message));
  return data;
}

// ---------- AUTO-CLEAN 24 JAM ----------
// Cek di database: kalau sudah lewat 24 jam, semua data chat/history dihapus
// otomatis (sisanya hanya data login). return true = data baru saja dibersihkan.
export async function rpcMaybeCleanup(): Promise<boolean> {
  const { data, error } = await nxRpc('maybe_cleanup', {});
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

// Hapus seluruh media di bucket chat-media (dipanggil setelah maybe_cleanup true).
export async function wipeMediaBucket() {
  try {
    const { data: list, error } = await supabase.storage.from('chat-media').list('', { limit: 1000 });
    if (error) throw error;
    if (list && list.length) {
      await supabase.storage.from('chat-media').remove(list.map((f) => f.name));
    }
  } catch {
    /* noop */
  }
}

export function normalizeErr(msg: string) {
  if (!msg) return 'Terjadi kesalahan';
  if (/unauthorized|akses ditolak|tidak cocok|token (tidak valid|invalid|kadalu|expired)/i.test(msg)) {
    try {
      clearSession();
      window.dispatchEvent(new Event('nexus:logout'));
    } catch {
      /* noop */
    }
  }
  const m = msg.replace(/^.*?\b(error|exception)\b[:\s]*/i, '');
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function toastErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^.*?\b(error|exception)\b[:\s]*/i, '');
}
