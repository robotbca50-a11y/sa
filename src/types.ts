export type User = {
  id: string;
  username: string;
  public_key?: string | null;
  avatar?: string | null;
  status?: string;
  is_admin?: boolean;
  created_at?: string;
};

export type ConversationItem = {
  key: string;
  kind: 'dm' | 'group';
  id?: string;
  peerId?: string;
  name: string;
  public_key?: string;
  avatar?: string | null;
  online?: boolean;
  lastMsg?: string;
  lastAt?: string;
  lastType?: string;
  lastCiphertext?: string;
  lastIv?: string;
  unread?: number;
};

export type Msg = {
  id: string;
  conversation_id?: string | null;
  group_id?: string | null;
  sender_id: string;
  username?: string | null;
  sender_public_key?: string | null;
  ciphertext: string;
  iv?: string | null;
  ciphertexts?: Record<string, { ct: string; iv: string }> | null;
  msg_type: 'text' | 'image' | 'video' | 'gif' | 'voice';
  media_path?: string | null;
  media_status?: string | null;
  uploadPct?: number;
  reply_to?: string | null;
  edited_at?: string | null;
  deleted?: boolean;
  read_at?: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  reactions?: Reaction[];
};

export type Reaction = {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

export type Story = {
  id: string;
  user_id: string;
  username?: string;
  media_path: string;
  caption?: string;
  kind?: string;
  created_at: string;
};

export type Reel = {
  id: string;
  user_id: string;
  username?: string;
  source: string;
  tiktok_url?: string | null;
  media_path?: string | null;
  caption?: string;
  created_at: string;
};

export type LocRow = {
  user_id: string;
  username?: string;
  lat: number;
  lng: number;
  accuracy?: number;
  updated_at: string;
};

export type AccessLog = {
  id: string;
  user_id: string;
  username?: string;
  event: string;
  ip?: string;
  user_agent?: string;
  created_at: string;
};

export type AppView = 'landing' | 'auth' | 'app' | 'admin';
