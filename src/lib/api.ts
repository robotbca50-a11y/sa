import { supabase } from './supabase';
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

export async function rpcRegister(username: string, password: string, publicKey: string, ip?: string | null) {
  try {
    const { data, error } = await supabase.rpc('register_user', {
      p_username: username,
      p_password: password,
      p_public_key: publicKey,
      p_ip: ip ?? null,
    });
    if (error) throw new Error(normalizeErr(error.message));
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!isFuncNotFound(msg)) throw e;
    const { data, error } = await supabase.rpc('register_user', {
      p_username: username,
      p_password: password,
      p_public_key: publicKey,
    });
    if (error) throw new Error(normalizeErr(error.message));
    return data;
  }
}

export async function rpcLogin(username: string, password: string): Promise<User> {
  const { data, error } = await supabase.rpc('login_user', {
    p_username: username,
    p_password: password,
  });
  if (error) throw new Error(normalizeErr(error.message));
  const rows = data as unknown as User[];
  if (!rows || rows.length === 0) throw new Error('Username / password salah, atau belum di-ACC.');
  return rows[0];
}

export async function rpcPendingUsers(adminUser: string, adminPass: string): Promise<User[]> {
  const { data, error } = await supabase.rpc('list_pending_users', {
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
  const { error } = await supabase.rpc('set_user_status', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
    p_target_id: targetId,
    p_status: status,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcAdminCheck(adminUser: string, adminPass: string) {
  const { data, error } = await supabase.rpc('admin_check', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return !!data;
}

export async function rpcAllLocations(adminUser: string, adminPass: string): Promise<LocRow[]> {
  const { data, error } = await supabase.rpc('get_all_locations', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as LocRow[]) ?? [];
}

export async function rpcAccessLogs(adminUser: string, adminPass: string): Promise<AccessLog[]> {
  const { data, error } = await supabase.rpc('get_access_logs', {
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
  const { data, error } = await supabase.rpc('get_user_stats', {
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
  const { data, error } = await supabase.rpc('list_all_users', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcDeleteUser(adminUser: string, adminPass: string, targetId: string) {
  const { error } = await supabase.rpc('delete_user', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
    p_target_id: targetId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcPurgeAllUsers(adminUser: string, adminPass: string) {
  const { error } = await supabase.rpc('purge_all_users_except_master', {
    p_admin_username: adminUser,
    p_admin_password: adminPass,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcUpdatePublicKey(username: string, password: string, newPublicKey: string) {
  const { error } = await supabase.rpc('update_public_key', {
    p_username: username,
    p_password: password,
    p_new_public_key: newPublicKey,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- DIRECTORY / DM ----------
export async function rpcListUsers(): Promise<User[]> {
  const { data, error } = await supabase.rpc('list_approved_users');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as User[]) ?? [];
}

export async function rpcGetOrCreateConversation(a: string, b: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_conversation', {
    p_user_a: a,
    p_user_b: b,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return data as string;
}

export async function rpcMyConversations(me: string): Promise<any[]> {
  const { data, error } = await supabase.rpc('my_conversations', { p_user_id: me });
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
}) {
  try {
    const { error } = await supabase.rpc('send_message', {
      p_conversation_id: p.conversationId,
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
    const { error } = await supabase.rpc('send_message', {
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
  const { data, error } = await supabase.rpc('get_messages', {
    p_conversation_id: convId,
    p_user_id: userId ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[]) ?? [];
}

export async function rpcMarkMessagesRead(userId: string, convId: string) {
  const { error } = await supabase.rpc('mark_messages_read', { p_user_id: userId, p_conversation_id: convId });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcMarkGroupMessagesRead(userId: string, groupId: string) {
  const { error } = await supabase.rpc('mark_group_messages_read', { p_user_id: userId, p_group_id: groupId });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetMessage(id: string, userId?: string | null): Promise<Msg | null> {
  const { data, error } = await supabase.rpc('get_message', { p_id: id, p_user_id: userId ?? null });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[])?.[0] ?? null;
}

export async function rpcEditMessage(id: string, sender: string, ct: string, iv: string) {
  const { error } = await supabase.rpc('edit_message', {
    p_message_id: id,
    p_sender_id: sender,
    p_ciphertext: ct,
    p_iv: iv,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcDeleteMessage(id: string, sender: string) {
  const { error } = await supabase.rpc('delete_message', {
    p_message_id: id,
    p_sender_id: sender,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcAddReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase.rpc('add_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcRemoveReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase.rpc('remove_reaction', {
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
  const { data, error } = await supabase.rpc('group_create', {
    p_name: name,
    p_creator: creator,
    p_members: members,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return data as string;
}

export async function rpcMyGroups(userId: string): Promise<Group[]> {
  const { data, error } = await supabase.rpc('my_groups', { p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Group[]) ?? [];
}

export async function rpcGroupAddMember(groupId: string, userId: string) {
  const { error } = await supabase.rpc('group_add_member', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupMembers(groupId: string): Promise<User[]> {
  const { data, error } = await supabase.rpc('group_members', { p_group_id: groupId });
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
    const { error } = await supabase.rpc('group_send', {
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
    const { error } = await supabase.rpc('group_send', {
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
  const { data, error } = await supabase.rpc('get_group_messages', {
    p_group_id: groupId,
    p_user_id: userId ?? null,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[]) ?? [];
}

export async function rpcGetGroupMessage(id: string, userId?: string | null): Promise<Msg | null> {
  const { data, error } = await supabase.rpc('get_group_message', { p_id: id, p_user_id: userId ?? null });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Msg[])?.[0] ?? null;
}

export async function rpcGroupEditMessage(id: string, sender: string, ct: string, iv: string) {
  const { error } = await supabase.rpc('group_edit_message', {
    p_message_id: id,
    p_sender_id: sender,
    p_ciphertext: ct,
    p_iv: iv,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupDeleteMessage(id: string, sender: string) {
  const { error } = await supabase.rpc('group_delete_message', {
    p_message_id: id,
    p_sender_id: sender,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupAddReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase.rpc('group_add_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGroupRemoveReaction(messageId: string, userId: string, emoji: string) {
  const { error } = await supabase.rpc('group_remove_reaction', {
    p_message_id: messageId,
    p_user_id: userId,
    p_emoji: emoji,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- GROUP KEY (E2E grup) ----------
export async function rpcSaveGroupKey(groupId: string, userId: string, encKey: string, iv: string) {
  const { error } = await supabase.rpc('group_save_key', {
    p_group_id: groupId,
    p_user_id: userId,
    p_enc_key: encKey,
    p_iv: iv,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetGroupKey(groupId: string, userId: string): Promise<{ enc_key: string; iv: string } | null> {
  const { data, error } = await supabase.rpc('group_get_key', {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as { enc_key: string; iv: string }[])?.[0] ?? null;
}

// ---------- STORY ----------
export async function rpcAddStory(userId: string, mediaPath: string, caption: string, kind: string) {
  const { error } = await supabase.rpc('story_add', {
    p_user_id: userId,
    p_media_path: mediaPath,
    p_caption: caption,
    p_kind: kind,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetStories(): Promise<Story[]> {
  const { data, error } = await supabase.rpc('get_stories');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Story[]) ?? [];
}

export async function rpcGetMyStories(userId: string): Promise<Story[]> {
  const { data, error } = await supabase.rpc('get_my_stories', { p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Story[]) ?? [];
}

export async function rpcViewStory(storyId: string, userId: string) {
  const { error } = await supabase.rpc('view_story', {
    p_story_id: storyId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcDeleteStory(storyId: string, userId: string) {
  const { error } = await supabase.rpc('delete_story', {
    p_story_id: storyId,
    p_user_id: userId,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcStoryViews(storyId: string): Promise<any[]> {
  const { data, error } = await supabase.rpc('get_story_views', { p_story_id: storyId });
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
  const { error } = await supabase.rpc('reel_add', {
    p_user_id: p.userId,
    p_source: p.source,
    p_tiktok_url: p.tiktokUrl ?? null,
    p_media_path: p.mediaPath ?? null,
    p_caption: p.caption ?? '',
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcGetReels(): Promise<Reel[]> {
  const { data, error } = await supabase.rpc('get_reels');
  if (error) throw new Error(normalizeErr(error.message));
  return (data as unknown as Reel[]) ?? [];
}

export async function rpcDeleteReel(id: string, userId: string) {
  const { error } = await supabase.rpc('delete_reel', { p_reel_id: id, p_user_id: userId });
  if (error) throw new Error(normalizeErr(error.message));
}

// ---------- LOKASI & LOG ----------
export async function rpcUpsertLocation(userId: string, lat: number, lng: number, accuracy: number) {
  const { error } = await supabase.rpc('upsert_location', {
    p_user_id: userId,
    p_lat: lat,
    p_lng: lng,
    p_accuracy: accuracy,
  });
  if (error) throw new Error(normalizeErr(error.message));
}

export async function rpcLogAccess(userId: string, event: string, ip?: string, ua?: string) {
  const { error } = await supabase.rpc('log_access', {
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
      const { error } = await supabase.rpc('log_media_upload', {
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

export function normalizeErr(msg: string) {
  if (!msg) return 'Terjadi kesalahan';
  const m = msg.replace(/^.*?\b(error|exception)\b[:\s]*/i, '');
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function toastErr(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/^.*?\b(error|exception)\b[:\s]*/i, '');
}
