-- =====================================================================
--  NEXUS — MIGRASI DATABASE
--  Jalankan SEKALI di: Supabase Dashboard > SQL Editor > New query
--  Wajib dijalankan supaya semua fitur (grup, story, reels, lokasi,
--  admin, dll) aktif. Core chat lama tetap kompatibel.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) BUKA EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;
-- Supabase menaruh extension di schema `extensions`, sedangkan semua fungsi
-- RPC di bawah pakai `set search_path = public`. Pindahkan pgcrypto ke
-- schema `extensions` lalu buat wrapper di `public` biar crypt/gen_salt/
-- digest/gen_random_bytes selalu ketemu di editor maupun di dalam fungsi.
alter extension pgcrypto set schema extensions;

create or replace function public.crypt(text, text) returns text
language sql stable as $$ select extensions.crypt($1, $2) $$;

create or replace function public.gen_salt(text) returns text
language sql stable as $$ select extensions.gen_salt($1) $$;

create or replace function public.digest(text, text) returns bytea
language sql stable as $$ select extensions.digest($1, $2) $$;

create or replace function public.gen_random_bytes(int) returns bytea
language sql volatile as $$ select extensions.gen_random_bytes($1) $$;

-- ---------------------------------------------------------------------
-- 2) TABEL DASAR (aman kalau sudah ada)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password text,
  public_key text,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table public.users alter column password drop not null;
alter table public.users add column if not exists is_admin boolean default false;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references public.users(id),
  user_b uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations(id) on delete cascade,
  sender_id uuid references public.users(id),
  ciphertext text default '',
  iv text,
  msg_type text default 'text',
  media_path text,
  created_at timestamptz default now()
);

alter table public.messages add column if not exists reply_to uuid;
alter table public.messages add column if not exists edited_at timestamptz;
alter table public.messages add column if not exists deleted boolean default false;
alter table public.messages add column if not exists read_at timestamptz;
-- Multi-key E2E: ciphertext per public key penerima (kunci publik -> { ct, iv })
alter table public.messages add column if not exists ciphertexts jsonb;

-- ---------------------------------------------------------------------
-- 3) TABEL FITUR BARU
-- ---------------------------------------------------------------------
create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.users(id),
  created_at timestamptz default now()
);

create table if not exists public.group_members (
  group_id uuid references public.group_chats(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.group_chats(id) on delete cascade,
  sender_id uuid references public.users(id),
  ciphertext text default '',
  iv text,
  msg_type text default 'text',
  media_path text,
  reply_to uuid,
  edited_at timestamptz,
  deleted boolean default false,
  read_at timestamptz,
  created_at timestamptz default now()
);

alter table public.group_messages add column if not exists read_at timestamptz;

create table if not exists public.reactions (
  message_id uuid references public.messages(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.group_reactions (
  message_id uuid references public.group_messages(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.group_keys (
  group_id uuid references public.group_chats(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  enc_key text not null,
  iv text not null,
  public_key text default '',
  member_key text default '',
  created_at timestamptz default now(),
  primary key (group_id, user_id, public_key, member_key)
);

-- REKONSLIASI group_keys utk DB lama: `create table if not exists` tidak akan
-- menambah kolom ke tabel yang sudah ada. Kalau skip ini, `update` di bawah
-- dan RPC multi-key (group_save_key dll) gagal "column ... does not exist".
alter table public.group_keys add column if not exists public_key text default '';
alter table public.group_keys add column if not exists member_key text default '';

-- public_key  = kunci publik PEMBERI (yang mengenkripsi utk member ini).
-- member_key  = kunci publik member yang dituju (bisa banyak utk 1 member).
-- Baris lama tidak punya info ini ('' = sentinel) → frontend pakai kunci
-- publik creator saat ini, persis seperti perilaku sebelum multi-key.
update public.group_keys set public_key = '', member_key = '' where public_key is null or member_key is null;
alter table public.group_keys drop constraint if exists group_keys_pkey;
alter table public.group_keys add constraint group_keys_pkey primary key (group_id, user_id, public_key, member_key);

-- key E2E sekunder akun (hasil rotate/regenerate). Kunci lama tetap disimpan
-- supaya pesan lama + device lama tetap bisa dibuka.
create table if not exists public.user_keys (
  user_id uuid not null references public.users(id) on delete cascade,
  public_key text not null,
  created_at timestamptz default now(),
  primary key (user_id, public_key)
);
create index if not exists user_keys_user on public.user_keys (user_id);

-- backup kunci grup per user, dienkripsi dengan kunci turunan password akun.
-- Supaya device baru tetap bisa membuka grup walau belum pernah dapat kunci.
create table if not exists public.group_key_backups (
  group_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  enc_key text not null,
  iv text not null,
  updated_at timestamptz default now(),
  primary key (group_id, user_id)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  media_path text not null,
  caption text default '',
  kind text default 'image',
  created_at timestamptz default now()
);

create table if not exists public.story_views (
  story_id uuid references public.stories(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  viewed_at timestamptz default now(),
  primary key (story_id, user_id)
);

create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  source text default 'upload',
  tiktok_url text,
  media_path text,
  caption text default '',
  created_at timestamptz default now()
);

create table if not exists public.user_locations (
  user_id uuid primary key references public.users(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy double precision default 0,
  updated_at timestamptz default now()
);

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  event text,
  ip text,
  user_agent text,
  created_at timestamptz default now()
);

create table if not exists public.registration_logs (
  id bigint generated by default as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists reg_logs_ip_time on public.registration_logs (ip, created_at desc);

create table if not exists public.ip_blocks (
  ip text primary key,
  blocked_until timestamptz not null
);

create table if not exists public.request_counters (
  bucket_key text primary key,
  ip text not null,
  bucket_start timestamptz not null,
  count bigint not null default 0
);

create index if not exists req_counters_ip_time on public.request_counters (ip, bucket_start desc);

create table if not exists public.login_attempts (
  id bigint generated by default as identity primary key,
  ip text not null,
  username text,
  success boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists login_attempts_ip_time on public.login_attempts (ip, created_at desc);

create table if not exists public.upload_daily (
  user_id uuid references public.users(id) on delete cascade,
  day date not null,
  bytes bigint not null default 0,
  files int not null default 0,
  primary key (user_id, day)
);

-- Sesi login (token dipegang browser, hanya hash yang disimpan di sini)
create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked boolean not null default false
);

create index if not exists sessions_user on public.sessions (user_id);

-- Langganan Web Push (diisi client, dipakai edge function send-push)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);
-- Satu perangkat = satu baris (endpoint unik)
create unique index if not exists push_subscriptions_endpoint on public.push_subscriptions ((subscription ->> 'endpoint'));

-- Password di-hash (bcrypt). Kolom `password` lama dibiarkan utk migrasi akun lama.
alter table public.users add column if not exists password_hash text;

-- Registrasi: lacak per browser (fingerprint) + sukses/gagal
alter table public.registration_logs add column if not exists fingerprint text;
alter table public.registration_logs add column if not exists success boolean default true;

-- Kill screen: master bisa bikin layar korban hitam penuh (aktif = hitam).
-- `ip` = IP terakhir korban, dipakai buat deteksi tanpa login (anti-hapus-storage).
-- REKONSLIASI: kalau tabel sudah ada dari versi lama, kolom yang ditambah di
-- versi baru harus di-`alter table` — `create table if not exists` TIDAK akan
-- menambah kolom. Tanpa ini, `set_blackout`/`get_blackout*` gagal
-- "column ip of relation blackouts does not exist".
create table if not exists public.blackouts (
  target_user_id uuid primary key references public.users(id) on delete cascade,
  active boolean not null default true,
  set_by uuid,
  ip text,
  updated_at timestamptz not null default now()
);
alter table public.blackouts add column if not exists active boolean not null default true;
alter table public.blackouts add column if not exists set_by uuid;
alter table public.blackouts add column if not exists ip text;
alter table public.blackouts add column if not exists updated_at timestamptz not null default now();

-- ---------------------------------------------------------------------
-- REKONSLIASI SKEMA (penting utk DB lama)
-- `create table if not exists` TIDAK menambah kolom ke tabel yang sudah ada.
-- Kolom apa pun yang dipakai fungsi RPC wajib di-`add column if not exists`
-- di sini, kalau tidak di DB lama semua fungsi yang menyentuhnya akan gagal
-- "column ... of relation ... does not exist". Semua statement di bawah
-- idempoten & aman dijalankan berulang.
-- ---------------------------------------------------------------------
alter table public.users add column if not exists public_key text;
alter table public.users add column if not exists status text default 'pending';

alter table public.group_messages add column if not exists msg_type text default 'text';
alter table public.group_messages add column if not exists media_path text;
alter table public.group_messages add column if not exists reply_to uuid;
alter table public.group_messages add column if not exists edited_at timestamptz;
alter table public.group_messages add column if not exists deleted boolean default false;

alter table public.stories add column if not exists caption text default '';
alter table public.stories add column if not exists kind text default 'image';

alter table public.reels add column if not exists source text default 'upload';
alter table public.reels add column if not exists tiktok_url text;
alter table public.reels add column if not exists media_path text;
alter table public.reels add column if not exists caption text default '';

alter table public.user_locations add column if not exists accuracy double precision default 0;
alter table public.user_locations add column if not exists updated_at timestamptz default now();

alter table public.access_logs add column if not exists event text;
alter table public.access_logs add column if not exists ip text;
alter table public.access_logs add column if not exists user_agent text;

alter table public.login_attempts add column if not exists username text;
alter table public.upload_daily add column if not exists bytes bigint not null default 0;
alter table public.upload_daily add column if not exists files int not null default 0;
alter table public.sessions add column if not exists expires_at timestamptz;
alter table public.sessions add column if not exists revoked boolean not null default false;

-- ---------------------------------------------------------------------
-- 4) REALTIME: publish table yang perlu live
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.messages';
    execute 'alter publication supabase_realtime add table public.group_messages';
    execute 'alter publication supabase_realtime add table public.reactions';
    execute 'alter publication supabase_realtime add table public.group_reactions';
    execute 'alter publication supabase_realtime add table public.stories';
    execute 'alter publication supabase_realtime add table public.blackouts';
  end if;
exception when duplicate_object then null;
end $$;

alter table public.messages replica identity full;
alter table public.group_messages replica identity full;
alter table public.reactions replica identity full;
alter table public.group_reactions replica identity full;

-- ---------------------------------------------------------------------
-- 5) STORAGE BUCKET + POLICIES
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nexus public upload') then
    create policy "nexus public upload" on storage.objects
      for insert to anon, authenticated with check (bucket_id = 'chat-media');
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nexus public read') then
    create policy "nexus public read" on storage.objects
      for select to anon, authenticated using (bucket_id = 'chat-media');
  end if;
  -- Dipakai auto-clean harian: client menghapus seluruh media di bucket.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'nexus cleanup') then
    create policy "nexus cleanup" on storage.objects
      for delete to anon, authenticated using (bucket_id = 'chat-media');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6) FUNGSI (RPC) — SEMUA security definer biar RLS tidak memblokir
-- ---------------------------------------------------------------------

-- Hapus fungsi lama dulu biar return type bisa diganti (error 42P13).
-- Aman: tidak ada objek lain yang bergantung pada RPC ini.
do $$
declare r record;
begin
  for r in
    select n.nspname, p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'register_user','login_user','admin_check','list_pending_users','set_user_status',
        'get_user_stats','get_all_locations','get_access_logs','list_approved_users',
        'list_all_users','delete_user','update_public_key',
        'get_public_key','get_or_create_conversation','my_conversations','send_message',
        'get_messages','mark_messages_read','get_message','edit_message','delete_message',
        'add_reaction','remove_reaction','group_create','my_groups','group_add_member',
        'group_members','group_send','get_group_messages','mark_group_messages_read',
        'get_group_message','group_edit_message','group_delete_message','group_add_reaction',
        'group_remove_reaction','group_save_key','group_get_key','story_add','get_stories',
        'get_my_stories','view_story','get_story_views','delete_story','reel_add','get_reels',
        'delete_reel','upsert_location','log_access','set_blackout','get_blackout','get_blackout_public','list_blackouts',
        'get_blackout_ip','get_push_subscriptions','get_push_subscriptions_for_users','assert_media_path',
        'save_push_subscription','delete_push_subscription','cleanup_push_subscription','maybe_cleanup'
      )
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;
end $$;

create or replace function public.client_ip()
returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::jsonb ->> 'cf-connecting-ip', ''),
    nullif(split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1), ''),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-real-ip', ''),
    '0.0.0.0'
  );
$$;

-- RATE LIMIT per (IP + user bila sudah login). Kalau hanya per IP, semua user
-- di belakang NAT/sekawanan wifi berbagi satu kuota dan gampang kena "terlalu
-- banyak permintaan" saat buka app. User yang sudah login diberi kuota sendiri.
-- Dipanggil otomatis di awal hampir semua fungsi RPC di bawah.
create or replace function public.rate_limit(p_max int default 200, p_window int default 1)
returns void
language plpgsql volatile set search_path = public
as $$
declare
  v_ip text := public.client_ip();
  v_uid uuid := public.auth_user_id();
  v_key text := v_ip || ':' || coalesce(v_uid::text, '') || ':' || to_char(now(), 'YYYYMMDDHH24MISS');
  v_cnt bigint;
begin
  insert into public.request_counters (bucket_key, ip, bucket_start, count)
  values (v_key, v_ip, date_trunc('second', now()), 1)
  on conflict (bucket_key) do update set count = request_counters.count + 1
  returning count into v_cnt;
  if v_cnt > p_max then
    raise exception 'Terlalu banyak permintaan — tunggu sebentar lalu coba lagi.';
  end if;
  if random() < 0.01 then
    delete from public.request_counters where bucket_start < now() - interval '1 minute';
  end if;
end $$;

-- Helper: pastikan user valid & approved
create or replace function public.require_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.users where id = p_user_id and status = 'approved'
  ) then
    raise exception 'Akses ditolak: user tidak valid';
  end if;
end $$;

-- Helper: cek keanggotaan percakapan DM
create or replace function public.require_conversation_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.conversations
    where id = p_conversation_id and (user_a = p_user_id or user_b = p_user_id)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
end $$;

-- Helper: cek keanggotaan grup
create or replace function public.require_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user_id is null or not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
end $$;

-- =====================================================================
-- SESSION AUTH (token per-login, bukan JWT yang bisa dipalsukan client)
-- Header yang dikirim frontend: x-nexus-token = <token random>
-- =====================================================================
create or replace function public.auth_user_id()
returns uuid
language plpgsql stable set search_path = public
as $$
declare
  v_token text;
  v_uid uuid;
begin
  v_token := nullif(current_setting('request.headers', true)::jsonb ->> 'x-nexus-token', '');
  if v_token is null then
    return null;
  end if;
  select s.user_id into v_uid
  from public.sessions s
  where s.token_hash = encode(digest(v_token, 'sha256'), 'hex')
    and s.revoked = false
    and s.expires_at > now();
  return v_uid;
end $$;

create or replace function public.me()
returns uuid
language sql stable set search_path = public
as $$
  select public.auth_user_id();
$$;

-- Wajib login: return user_id atau tolak
create or replace function public.require_auth()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := public.auth_user_id();
begin
  if v_uid is null then
    raise exception 'Unauthorized: sesi habis atau belum login. Login ulang.';
  end if;
  return v_uid;
end $$;

-- Logout: hapus sesi
create or replace function public.logout_user(p_token text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_token is null then
    return;
  end if;
  delete from public.sessions
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
end $$;

-- Kill screen: cek apakah layar target harus hitam (dipanggil tiap 4 detik)
create or replace function public.get_blackout(p_user_id uuid default null)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid; v_active boolean;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  select active into v_active from public.blackouts where target_user_id = v_uid;
  return coalesce(v_active, false);
end $$;

-- Kill screen versi publik: cek by username TANPA perlu login, biar korban yg
-- belum login / kena blokir tetap kena layar hitam dari halaman landing/login.
-- Hanya butuh rate limit (anti-abuse), datanya cuma boolean per username.
create or replace function public.get_blackout_public(p_username text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_active boolean;
begin
  perform public.rate_limit();
  select b.active into v_active
  from public.blackouts b
  join public.users u on u.id = b.target_user_id
  where u.username = btrim(p_username);
  return coalesce(v_active, false);
end $$;

-- Kill screen versi IP: cek by IP TANPA login. Dipakai buat jebak korban yang
-- hapus akun/storage-nya biar enggak bisa kabur dari layar hitam.
create or replace function public.get_blackout_ip()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_active boolean;
begin
  perform public.rate_limit();
  select exists(select 1 from public.blackouts where ip = public.client_ip())
  into v_active;
  return coalesce(v_active, false);
end $$;

-- Kill screen: master menyalakan/mematikan layar hitam target
create or replace function public.set_blackout(p_admin_username text, p_admin_password text, p_target_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_ip text;
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Admin password salah';
  end if;
  if p_active then
    -- Catat IP terakhir korban (dari access_logs) supaya jebakan IP bisa aktif.
    select a.ip into v_ip
    from public.access_logs a
    where a.user_id = p_target_user_id
    order by a.created_at desc
    limit 1;
    insert into public.blackouts (target_user_id, ip, active, updated_at)
    values (p_target_user_id, v_ip, true, now())
    on conflict (target_user_id) do update set active = true, ip = excluded.ip, updated_at = now();
  else
    delete from public.blackouts where target_user_id = p_target_user_id;
  end if;
end $$;

-- Kill screen: daftar user yg sedang layar hitam (buat tampilan panel master)
create or replace function public.list_blackouts(p_admin_username text, p_admin_password text)
returns table (target_user_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Admin password salah';
  end if;
  return query select b.target_user_id, b.updated_at from public.blackouts b order by b.updated_at desc;
end $$;

-- Kuota upload storage: maks 2 GB & 2000 file per hari per akun.
-- Dipanggil dari frontend sebelum tiap upload.
create or replace function public.log_media_upload(p_bytes bigint, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_bytes bigint; v_files int; v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if p_bytes is null or p_bytes < 0 then
    p_bytes := 0;
  end if;
  select coalesce(bytes, 0), coalesce(files, 0) into v_bytes, v_files
  from public.upload_daily where user_id = v_uid and day = current_date;
  if v_bytes + p_bytes > 2147483648 then
    raise exception 'Kuota upload harian tercapai (2 GB). Coba lagi besok.';
  end if;
  if v_files + 1 > 2000 then
    raise exception 'Maksimal 2000 file per hari per akun.';
  end if;
  insert into public.upload_daily (user_id, day, bytes, files)
  values (v_uid, current_date, p_bytes, 1)
  on conflict (user_id, day) do update set
    bytes = upload_daily.bytes + excluded.bytes,
    files = upload_daily.files + excluded.files;
end $$;

-- Hapus SEMUA user (bukan admin) berikut semua datanya. Dipakai tombol di Admin Console.
create or replace function public.purge_all_users_except_master(p_admin_username text, p_admin_password text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  for v_uid in
    select id from public.users where coalesce(is_admin, false) = false
  loop
    perform public.delete_user(p_admin_username, p_admin_password, v_uid);
  end loop;
end $$;

create or replace function public.register_user(p_username text, p_password text, p_public_key text, p_ip text default null, p_fingerprint text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  v_ip text;
  v_cnt int;
  v_fail int;
  v_blocked_until timestamptz;
  v_fp text := nullif(btrim(coalesce(p_fingerprint, '')), '');
begin
  perform public.rate_limit();
  v_ip := coalesce(nullif(btrim(coalesce(p_ip, '')), ''), public.client_ip());

  -- Blokir IP yg masih kena hukuman
  select blocked_until into v_blocked_until
  from public.ip_blocks where ip = v_ip and blocked_until > now();
  if v_blocked_until is not null then
    raise exception 'IP kamu diblokir sementara sampai % — kamu sudah membuat terlalu banyak akun dari IP yang sama. Coba lagi nanti.', to_char(v_blocked_until, 'DD-MM-YYYY HH24:MI');
  end if;

  -- 1 akun sukses per browser (fingerprint). Browser yang sama tidak bisa daftar lagi.
  if v_fp is not null and exists (
    select 1 from public.registration_logs
    where fingerprint = v_fp and success = true
  ) then
    raise exception 'Browser ini sudah punya akun NEXUS. Buat akun lain pakai browser/perangkat lain.';
  end if;

  -- Terlalu banyak percobaan GAGAL daftar (tiap percobaan tetap membebani DB)
  select count(*) into v_fail
  from public.registration_logs
  where success = false
    and created_at > now() - interval '15 minutes'
    and (fingerprint = v_fp or (v_fp is null and ip = v_ip));
  if v_fail >= 5 then
    insert into public.ip_blocks (ip, blocked_until)
    values (v_ip, now() + interval '1 hour')
    on conflict (ip) do update set blocked_until = excluded.blocked_until;
    raise exception 'Terlalu banyak percobaan daftar. IP diblokir 1 jam.';
  end if;

  -- Maks 3 akun per IP dalam 10 menit
  select count(*) into v_cnt
  from public.registration_logs
  where ip = v_ip and success = true and created_at > now() - interval '10 minutes';
  if v_cnt >= 3 then
    insert into public.ip_blocks (ip, blocked_until)
    values (v_ip, now() + interval '4 hours')
    on conflict (ip) do update set blocked_until = excluded.blocked_until;
    raise exception 'IP kamu diblokir selama 4 jam karena membuat terlalu banyak akun dalam waktu cepat.';
  end if;

  if p_username is null or length(btrim(p_username)) < 2 then
    raise exception 'Username minimal 2 karakter';
  end if;
  if p_password is null or length(p_password) < 4 then
    raise exception 'Password minimal 4 karakter';
  end if;
  if p_public_key is null or length(p_public_key) < 10 then
    raise exception 'Kunci publik tidak valid';
  end if;

  insert into public.users (username, password_hash, public_key, status)
  values (btrim(p_username), crypt(p_password, gen_salt('bf')), p_public_key, 'pending')
  returning id into new_id;
  insert into public.user_keys (user_id, public_key) values (new_id, p_public_key);
  insert into public.access_logs (user_id, event, ip) values (new_id, 'register', v_ip);
  insert into public.registration_logs (ip, fingerprint, success) values (v_ip, v_fp, true);
  delete from public.ip_blocks where blocked_until <= now();
  delete from public.registration_logs where created_at < now() - interval '1 day';
  return new_id;
exception when unique_violation then
  insert into public.registration_logs (ip, fingerprint, success) values (v_ip, v_fp, false);
  raise exception 'Registrasi gagal. Coba username lain.';
end $$;

create or replace function public.login_user(p_username text, p_password text)
returns table (id uuid, username text, public_key text, status text, is_admin boolean, token text)
language plpgsql security definer set search_path = public
as $$
declare
  target_id uuid;
  v_ip text := public.client_ip();
  v_failed int;
  v_blocked timestamptz;
  v_token text;
begin
  perform public.rate_limit();
  select blocked_until into v_blocked from public.ip_blocks
  where ip = v_ip and blocked_until > now();
  if v_blocked is not null then
    raise exception 'IP kamu diblokir sementara. Coba lagi nanti.';
  end if;
  select count(*) into v_failed from public.login_attempts
  where ip = v_ip and success = false and created_at > now() - interval '15 minutes';
  if v_failed >= 10 then
    insert into public.ip_blocks (ip, blocked_until)
    values (v_ip, now() + interval '1 hour')
    on conflict (ip) do update set blocked_until = excluded.blocked_until;
    raise exception 'Terlalu banyak percobaan login gagal. IP diblokir 1 jam.';
  end if;

  -- Cek password (mendukung akun lama yang masih plain, sekaligus di-upgrade ke bcrypt)
  select u.id into target_id
  from public.users u
  where u.username = btrim(p_username) and u.status = 'approved'
    and (
      (u.password_hash is not null and u.password_hash = crypt(p_password, u.password_hash))
      or (u.password_hash is null and u.password = p_password)
    );
  if target_id is null then
    insert into public.login_attempts (ip, username, success) values (v_ip, p_username, false);
    raise exception 'Username / password salah, atau belum di-ACC admin';
  end if;

  -- Upgrade akun lama: simpan hash, hapus password plaintext
  update public.users
  set password_hash = crypt(p_password, gen_salt('bf')), password = null
  where public.users.id = target_id and public.users.password_hash is null;

  -- Buat sesi login (token random, browser simpan, DB simpan hash-nya)
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.sessions (token_hash, user_id, expires_at)
  values (encode(digest(v_token, 'sha256'), 'hex'), target_id, now() + interval '7 days');

  insert into public.login_attempts (ip, username, success) values (v_ip, p_username, true);
  insert into public.access_logs (user_id, event, ip) values (target_id, 'login', v_ip);
  return query
  select u.id, u.username, u.public_key, u.status, coalesce(u.is_admin, false), v_token as token
  from public.users u where u.id = target_id;
end $$;

create or replace function public.admin_check(p_admin_username text, p_admin_password text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  ok boolean;
  v_ip text := public.client_ip();
  v_blocked_until timestamptz;
  v_fail int;
begin
  perform public.rate_limit();
  -- Anti brute-force: IP yang kena blokir (>=10 gagal / 15 menit) ditolak total.
  select blocked_until into v_blocked_until
  from public.ip_blocks where ip = v_ip and blocked_until > now();
  if v_blocked_until is not null then
    return false;
  end if;

  select exists(
    select 1 from public.users
    where username = btrim(p_admin_username) and is_admin = true
      and (
        (password_hash is not null and password_hash = crypt(p_admin_password, password_hash))
        or (password_hash is null and password = p_admin_password)
      )
  ) into ok;
  if ok then
    update public.users
    set password_hash = crypt(p_admin_password, gen_salt('bf')), password = null
    where username = btrim(p_admin_username) and password_hash is null;
    return true;
  end if;

  -- Gagal: catat percobaan, blokir kalau sudah 10x gagal dalam 15 menit.
  insert into public.login_attempts (ip, username, success)
  values (v_ip, p_admin_username, false);
  select count(*) into v_fail from public.login_attempts
  where ip = v_ip and success = false and created_at > now() - interval '15 minutes';
  if v_fail >= 10 then
    insert into public.ip_blocks (ip, blocked_until)
    values (v_ip, now() + interval '1 hour')
    on conflict (ip) do update set blocked_until = excluded.blocked_until;
  end if;
  return false;
end $$;

create or replace function public.list_pending_users(p_admin_username text, p_admin_password text)
returns setof public.users
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query select * from public.users where status = 'pending' order by created_at desc;
end $$;

create or replace function public.set_user_status(p_admin_username text, p_admin_password text, p_target_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  update public.users set status = p_status where id = p_target_id;
end $$;

create or replace function public.get_user_stats(p_admin_username text, p_admin_password text)
returns table (total bigint, pending bigint, online bigint, today bigint)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select
    (select count(*) from public.users),
    (select count(*) from public.users where status = 'pending'),
    0::bigint,
    (select count(*) from public.access_logs where created_at > now() - interval '24 hours');
end $$;

create or replace function public.list_all_users(p_admin_username text, p_admin_password text)
returns table (id uuid, username text, status text, public_key text, is_admin boolean, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select u.id, u.username, u.status, u.public_key, coalesce(u.is_admin, false), u.created_at
  from public.users u
  where coalesce(u.is_admin, false) = false
  order by u.created_at desc;
end $$;

create or replace function public.delete_user(p_admin_username text, p_admin_password text, p_target_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  select id into v_uid from public.users where id = p_target_id;
  if v_uid is null then
    raise exception 'User tidak ditemukan';
  end if;
  if exists (select 1 from public.users where id = p_target_id and coalesce(is_admin, false) = true) then
    raise exception 'Tidak bisa menghapus akun master';
  end if;

  -- 1) DM: hapus semua pesan di percakapan yang melibatkan user (reactions ikut terhapus via cascade)
  delete from public.messages
  where conversation_id in (
    select id from public.conversations where user_a = p_target_id or user_b = p_target_id
  );

  -- 2) Sisa pesan DM yang user kirim (pengaman kalau ada percakapan aneh)
  delete from public.messages where sender_id = p_target_id;

  -- 3) Hapus percakapan
  delete from public.conversations where user_a = p_target_id or user_b = p_target_id;

  -- 4) Grup yang user buat (member, kunci, pesan, reaction ikut cascade)
  delete from public.group_chats where created_by = p_target_id;

  -- 5) Pesan grup yang user kirim di grup milik orang lain
  delete from public.group_messages where sender_id = p_target_id;

  -- 6) Reaksi, member, kunci grup milik user (sudah cascade, tapi eksplisit biar aman)
  delete from public.reactions where user_id = p_target_id;
  delete from public.group_reactions where user_id = p_target_id;
  delete from public.group_members where user_id = p_target_id;
  delete from public.group_keys where user_id = p_target_id;

  -- 8) Story, reels, lokasi, log akses (sudah cascade, eksplisit biar aman)
  delete from public.story_views where user_id = p_target_id;
  delete from public.stories where user_id = p_target_id;
  delete from public.reels where user_id = p_target_id;
  delete from public.user_locations where user_id = p_target_id;
  delete from public.access_logs where user_id = p_target_id;

  -- 9) Baru hapus user-nya
  delete from public.users where id = p_target_id;
end $$;

create or replace function public.update_public_key(p_username text, p_password text, p_new_public_key text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  perform public.rate_limit();
  select id into v_id
  from public.users
  where username = p_username and status = 'approved'
    and (
      (password_hash is not null and password_hash = crypt(p_password, password_hash))
      or (password_hash is null and password = p_password)
    );
  if v_id is null then
    raise exception 'Username / password salah';
  end if;
  -- Kunci lama disimpan sebagai kunci sekunder biar device lama tetap bisa
  -- membuka pesan yang dienkripsi dengan kunci itu (regenerate = tambah, bukan ganti).
  insert into public.user_keys (user_id, public_key)
  select id, public_key from public.users where id = v_id and public_key is not null
  on conflict do nothing;
  update public.users
  set public_key = p_new_public_key
  where id = v_id;
  insert into public.user_keys (user_id, public_key) values (v_id, p_new_public_key)
  on conflict do nothing;
  insert into public.access_logs (user_id, event, ip)
  values (v_id, 'key_rotated', public.client_ip());
end $$;

create or replace function public.get_all_locations(p_admin_username text, p_admin_password text)
returns table (user_id uuid, username text, lat double precision, lng double precision, accuracy double precision, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select l.user_id, u.username, l.lat, l.lng, l.accuracy, l.updated_at
  from public.user_locations l
  join public.users u on u.id = l.user_id
  where l.updated_at > now() - interval '2 hours'
  order by l.updated_at desc;
end $$;

create or replace function public.get_access_logs(p_admin_username text, p_admin_password text)
returns table (id uuid, user_id uuid, username text, event text, ip text, user_agent text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check(p_admin_username, p_admin_password) then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select l.id, l.user_id, u.username, l.event, l.ip, l.user_agent, l.created_at
  from public.access_logs l
  left join public.users u on u.id = l.user_id
  order by l.created_at desc
  limit 200;
end $$;

-- DIRECTORY & DM
create or replace function public.list_approved_users()
returns table (id uuid, username text, public_key text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  return query
  select u.id, u.username, u.public_key, u.created_at from public.users u
  where u.status = 'approved' and coalesce(u.is_admin, false) = false
  order by u.username;
end $$;

create or replace function public.get_public_key(p_username text)
returns table (id uuid, public_key text)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  return query select u.id, u.public_key from public.users u
  where u.username = btrim(p_username) and u.status = 'approved';
end $$;

create or replace function public.get_or_create_conversation(p_user_a uuid, p_user_b uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare cid uuid; v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if v_uid <> p_user_a and v_uid <> p_user_b then
    raise exception 'Akses ditolak: kamu bukan bagian percakapan ini';
  end if;
  perform public.require_user(p_user_a);
  perform public.require_user(p_user_b);
  select id into cid from public.conversations
  where (user_a = p_user_a and user_b = p_user_b) or (user_a = p_user_b and user_b = p_user_a)
  limit 1;
  if cid is null then
    insert into public.conversations (user_a, user_b) values (p_user_a, p_user_b) returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public.my_conversations(p_user_id uuid default null)
returns table (id uuid, peer_id uuid, peer_username text, peer_public_key text, last_at timestamptz, last_type text, last_ciphertext text, last_iv text, last_sender_id uuid)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  return query
  select
    c.id,
    case when c.user_a = v_uid then c.user_b else c.user_a end as peer_id,
    pu.username as peer_username,
    pu.public_key as peer_public_key,
    m.created_at as last_at,
    m.msg_type as last_type,
    m.ciphertext as last_ciphertext,
    m.iv as last_iv,
    m.sender_id as last_sender_id
  from public.conversations c
  join public.users pu on pu.id = case when c.user_a = v_uid then c.user_b else c.user_a end
  left join lateral (
    select m2.* from public.messages m2
    where m2.conversation_id = c.id and m2.deleted = false
    order by m2.created_at desc limit 1
  ) m on true
  where (c.user_a = v_uid or c.user_b = v_uid)
    and coalesce(pu.is_admin, false) = false
  order by m.created_at desc nulls last;
end $$;

create or replace function public.assert_media_path(p_path text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_path is null then
    return;
  end if;
  if length(p_path) > 500
     or p_path ~* '(\.\.|//|\\)'
     or p_path !~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$'
  then
    raise exception 'Media path tidak valid';
  end if;
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_ciphertext text, p_iv text, p_msg_type text, p_media_path text default null, p_reply_to uuid default null, p_id uuid default gen_random_uuid(), p_sender_id uuid default null, p_ciphertexts jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.require_conversation_member(p_conversation_id, v_uid);
  perform public.assert_media_path(p_media_path);
  if p_ciphertext is not null and length(p_ciphertext) > 50000 then
    raise exception 'Pesan terlalu panjang';
  end if;
  insert into public.messages (id, conversation_id, sender_id, ciphertext, iv, msg_type, media_path, reply_to, ciphertexts)
  values (p_id, p_conversation_id, v_uid, p_ciphertext, p_iv, p_msg_type, p_media_path, p_reply_to, p_ciphertexts)
  on conflict (id) do nothing;
end $$;

create or replace function public.get_messages(p_conversation_id uuid, p_user_id uuid default null)
returns table (id uuid, conversation_id uuid, sender_id uuid, username text, sender_public_key text, ciphertext text, iv text, msg_type text, media_path text, reply_to uuid, edited_at timestamptz, deleted boolean, read_at timestamptz, created_at timestamptz, ciphertexts jsonb)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_conversation_member(p_conversation_id, public.require_auth());
  return query
  select m.id, m.conversation_id, m.sender_id, u.username, u.public_key as sender_public_key,
         m.ciphertext, m.iv, m.msg_type, m.media_path, m.reply_to, m.edited_at, m.deleted, m.read_at, m.created_at, m.ciphertexts
  from public.messages m
  join public.users u on u.id = m.sender_id
  where m.conversation_id = p_conversation_id
  order by m.created_at asc;
end $$;

create or replace function public.mark_messages_read(p_user_id uuid, p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_conversation_member(p_conversation_id, public.require_auth());
  update public.messages set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> public.me()
    and read_at is null;
end $$;

create or replace function public.get_message(p_id uuid, p_user_id uuid default null)
returns setof public.messages
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_id and (c.user_a = v_uid or c.user_b = v_uid)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  return query select * from public.messages where id = p_id;
end $$;

create or replace function public.edit_message(p_message_id uuid, p_ciphertext text, p_iv text, p_sender_id uuid default null, p_ciphertexts jsonb default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and m.sender_id = v_uid
      and (c.user_a = v_uid or c.user_b = v_uid)
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.messages set ciphertext = p_ciphertext, iv = p_iv, ciphertexts = coalesce(p_ciphertexts, ciphertexts), edited_at = now()
  where id = p_message_id and sender_id = v_uid;
end $$;

create or replace function public.delete_message(p_message_id uuid, p_sender_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and m.sender_id = v_uid
      and (c.user_a = v_uid or c.user_b = v_uid)
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.messages set deleted = true
  where id = p_message_id and sender_id = v_uid;
end $$;

-- REACTIONS
create or replace function public.add_reaction(p_message_id uuid, p_emoji text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and (c.user_a = v_uid or c.user_b = v_uid)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  insert into public.reactions (message_id, user_id, emoji)
  values (p_message_id, v_uid, p_emoji)
  on conflict (message_id, user_id, emoji) do nothing;
end $$;

create or replace function public.remove_reaction(p_message_id uuid, p_emoji text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and (c.user_a = v_uid or c.user_b = v_uid)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  delete from public.reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
end $$;

-- GRUP
create or replace function public.group_create(p_name text, p_members uuid[], p_creator uuid default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare gid uuid; m uuid; v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_creator is not null and v_uid <> p_creator then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if p_name is null or length(btrim(p_name)) < 1 then
    raise exception 'Nama grup minimal 1 karakter';
  end if;
  insert into public.group_chats (name, created_by) values (btrim(p_name), v_uid) returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, v_uid) on conflict do nothing;
  foreach m in array p_members loop
    continue when m is null;
    if exists (select 1 from public.users where id = m) then
      insert into public.group_members (group_id, user_id) values (gid, m) on conflict do nothing;
    end if;
  end loop;
  return gid;
end $$;

create or replace function public.my_groups(p_user_id uuid default null)
returns setof public.group_chats
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  return query
  select g.* from public.group_chats g
  join public.group_members gm on gm.group_id = g.id
  where gm.user_id = v_uid
  order by g.created_at desc;
end $$;

create or replace function public.group_add_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then
    raise exception 'Akses ditolak: hanya anggota grup yang bisa menambah member';
  end if;
  perform public.require_user(p_user_id);
  insert into public.group_members (group_id, user_id) values (p_group_id, p_user_id) on conflict do nothing;
end $$;

create or replace function public.group_members(p_group_id uuid)
returns setof public.users
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = v_uid) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  return query
  select u.* from public.users u
  join public.group_members gm on gm.user_id = u.id
  where gm.group_id = p_group_id
    and coalesce(u.is_admin, false) = false;
end $$;

create or replace function public.group_send(p_group_id uuid, p_ciphertext text, p_iv text, p_msg_type text, p_media_path text default null, p_reply_to uuid default null, p_id uuid default gen_random_uuid(), p_sender_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.require_group_member(p_group_id, v_uid);
  perform public.assert_media_path(p_media_path);
  if p_ciphertext is not null and length(p_ciphertext) > 50000 then
    raise exception 'Pesan terlalu panjang';
  end if;
  insert into public.group_messages (id, group_id, sender_id, ciphertext, iv, msg_type, media_path, reply_to)
  values (p_id, p_group_id, v_uid, p_ciphertext, p_iv, p_msg_type, p_media_path, p_reply_to)
  on conflict (id) do nothing;
end $$;

create or replace function public.get_group_messages(p_group_id uuid, p_user_id uuid default null)
returns table (id uuid, group_id uuid, sender_id uuid, username text, sender_public_key text, ciphertext text, iv text, msg_type text, media_path text, reply_to uuid, edited_at timestamptz, deleted boolean, read_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_group_member(p_group_id, public.require_auth());
  return query
  select m.id, m.group_id, m.sender_id, u.username, u.public_key as sender_public_key,
         m.ciphertext, m.iv, m.msg_type, m.media_path, m.reply_to, m.edited_at, m.deleted, m.read_at, m.created_at
  from public.group_messages m
  join public.users u on u.id = m.sender_id
  where m.group_id = p_group_id
  order by m.created_at asc;
end $$;

create or replace function public.mark_group_messages_read(p_user_id uuid, p_group_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_group_member(p_group_id, public.require_auth());
  update public.group_messages set read_at = now()
  where group_id = p_group_id
    and sender_id <> public.me()
    and read_at is null;
end $$;

create or replace function public.get_group_message(p_id uuid, p_user_id uuid default null)
returns setof public.group_messages
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_id and gmb.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  return query select * from public.group_messages where id = p_id;
end $$;

create or replace function public.group_edit_message(p_message_id uuid, p_ciphertext text, p_iv text, p_sender_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gm.sender_id = v_uid and gmb.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.group_messages set ciphertext = p_ciphertext, iv = p_iv, edited_at = now()
  where id = p_message_id and sender_id = v_uid;
end $$;

create or replace function public.group_delete_message(p_message_id uuid, p_sender_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_sender_id is not null and v_uid <> p_sender_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gm.sender_id = v_uid and gmb.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.group_messages set deleted = true
  where id = p_message_id and sender_id = v_uid;
end $$;

create or replace function public.group_add_reaction(p_message_id uuid, p_emoji text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gmb.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  insert into public.group_reactions (message_id, user_id, emoji)
  values (p_message_id, v_uid, p_emoji)
  on conflict (message_id, user_id, emoji) do nothing;
end $$;

create or replace function public.group_remove_reaction(p_message_id uuid, p_emoji text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gmb.user_id = v_uid
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  delete from public.group_reactions where message_id = p_message_id and user_id = v_uid and emoji = p_emoji;
end $$;

-- GROUP KEY (E2E). Satu member boleh punya banyak baris (per kunci device),
-- masing-masing mengenkripsi kunci grup dengan kunci publik PEMBERI.
create or replace function public.group_save_key(p_group_id uuid, p_enc_key text, p_iv text, p_user_id uuid default null, p_public_key text default null, p_member_key text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_pub text;
  v_member text;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.require_group_member(p_group_id, v_uid);
  v_pub := coalesce(nullif(btrim(coalesce(p_public_key, '')), ''), (select public_key from public.users where id = v_uid));
  if v_pub is null or v_pub = '' then
    raise exception 'Akun ini belum punya kunci publik';
  end if;
  v_member := nullif(btrim(coalesce(p_member_key, '')), '');
  if v_member is null then
    v_member := v_pub;
  end if;
  insert into public.group_keys (group_id, user_id, enc_key, iv, public_key, member_key)
  values (p_group_id, v_uid, p_enc_key, p_iv, v_pub, v_member)
  on conflict (group_id, user_id, public_key, member_key) do update set enc_key = excluded.enc_key, iv = excluded.iv;
end $$;

create or replace function public.group_get_key(p_group_id uuid, p_user_id uuid default null)
returns table (enc_key text, iv text, public_key text)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.require_group_member(p_group_id, v_uid);
  return query select gk.enc_key, gk.iv, gk.public_key from public.group_keys gk
  where gk.group_id = p_group_id and gk.user_id = v_uid;
end $$;

-- Backup kunci grup untuk recovery device baru (dienkripsi kunci password akun).
create or replace function public.group_save_key_backup(p_group_id uuid, p_enc_key text, p_iv text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  perform public.require_group_member(p_group_id, v_uid);
  if not exists (
    select 1 from public.group_keys where group_id = p_group_id and user_id = v_uid
  ) then
    raise exception 'Belum punya kunci grup ini';
  end if;
  insert into public.group_key_backups (group_id, user_id, enc_key, iv)
  values (p_group_id, v_uid, p_enc_key, p_iv)
  on conflict (group_id, user_id) do update set enc_key = excluded.enc_key, iv = excluded.iv, updated_at = now();
end $$;

create or replace function public.group_get_key_backup(p_group_id uuid)
returns table (enc_key text, iv text)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  perform public.require_group_member(p_group_id, v_uid);
  return query select enc_key, iv from public.group_key_backups
  where group_id = p_group_id and user_id = v_uid;
end $$;

-- Semua kunci publik (utama + sekunder) user approved, buat enkripsi multi-key.
create or replace function public.get_all_user_keys()
returns table (user_id uuid, public_key text)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  return query
  select u.id, u.public_key
  from public.users u
  where u.status = 'approved' and coalesce(u.is_admin, false) = false and u.public_key is not null
  union
  select k.user_id, k.public_key
  from public.user_keys k
  join public.users u on u.id = k.user_id
  where u.status = 'approved' and coalesce(u.is_admin, false) = false
  order by public_key;
end $$;

-- STORY
create or replace function public.story_add(p_media_path text, p_caption text, p_kind text, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.assert_media_path(p_media_path);
  insert into public.stories (user_id, media_path, caption, kind) values (v_uid, p_media_path, p_caption, p_kind);
end $$;

create or replace function public.get_stories()
returns table (id uuid, user_id uuid, username text, media_path text, caption text, kind text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  return query
  select s.id, s.user_id, u.username, s.media_path, s.caption, s.kind, s.created_at
  from public.stories s
  join public.users u on u.id = s.user_id
  where s.created_at > now() - interval '24 hours'
    and coalesce(u.is_admin, false) = false
  order by s.created_at desc;
end $$;

create or replace function public.get_my_stories(p_user_id uuid default null)
returns setof public.stories
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  return query select * from public.stories
  where user_id = v_uid and created_at > now() - interval '24 hours'
  order by created_at desc;
end $$;

create or replace function public.view_story(p_story_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  insert into public.story_views (story_id, user_id) values (p_story_id, v_uid)
  on conflict do nothing;
end $$;

create or replace function public.get_story_views(p_story_id uuid)
returns table (user_id uuid, username text, viewed_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if not exists (select 1 from public.stories where id = p_story_id and user_id = v_uid) then
    raise exception 'Akses ditolak: bukan pemilik story';
  end if;
  return query
  select v.user_id, u.username, v.viewed_at
  from public.story_views v
  join public.users u on u.id = v.user_id
  where v.story_id = p_story_id
    and coalesce(u.is_admin, false) = false
  order by v.viewed_at desc;
end $$;

create or replace function public.delete_story(p_story_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  delete from public.stories where id = p_story_id and user_id = v_uid;
end $$;

-- REELS
create or replace function public.reel_add(p_source text, p_tiktok_url text default null, p_media_path text default null, p_caption text default '', p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  perform public.assert_media_path(p_media_path);
  insert into public.reels (user_id, source, tiktok_url, media_path, caption)
  values (v_uid, p_source, p_tiktok_url, p_media_path, p_caption);
end $$;

create or replace function public.get_reels()
returns table (id uuid, user_id uuid, username text, source text, tiktok_url text, media_path text, caption text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  return query
  select r.id, r.user_id, u.username, r.source, r.tiktok_url, r.media_path, r.caption, r.created_at
  from public.reels r
  join public.users u on u.id = r.user_id
  where coalesce(u.is_admin, false) = false
  order by r.created_at desc;
end $$;

create or replace function public.delete_reel(p_reel_id uuid, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  delete from public.reels where id = p_reel_id and user_id = v_uid;
end $$;

-- LOKASI & LOG
create or replace function public.upsert_location(p_lat double precision, p_lng double precision, p_accuracy double precision, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  insert into public.user_locations (user_id, lat, lng, accuracy, updated_at)
  values (v_uid, p_lat, p_lng, p_accuracy, now())
  on conflict (user_id) do update set
    lat = excluded.lat, lng = excluded.lng,
    accuracy = excluded.accuracy, updated_at = now();
end $$;

create or replace function public.log_access(p_event text, p_ip text default null, p_user_agent text default null, p_user_id uuid default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  insert into public.access_logs (user_id, event, ip, user_agent) values (v_uid, p_event, p_ip, p_user_agent);
end $$;

-- Push subscription: dibaca edge function `send-push` lewat RPC ini, BUKAN
-- query langsung. Jadi tabel bisa di-lock penuh oleh RLS di bawah.
create or replace function public.get_push_subscriptions(p_user_id uuid)
returns table (subscription jsonb)
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_user_id is not null and v_uid <> p_user_id then
    raise exception 'Akses ditolak: identitas tidak cocok';
  end if;
  return query select s.subscription from public.push_subscriptions s
  where s.user_id = v_uid;
end $$;

-- Semua subscription untuk sekumpulan user (dipakai edge function send-push,
-- satu panggilan RPC biar tidak kena rate-limit per user). Wajib login: hanya
-- user yang punya sesi valid (token dikirim edge function) yang boleh memakai.
create or replace function public.get_push_subscriptions_for_users(p_user_ids uuid[])
returns table (subscription jsonb)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  if p_user_ids is null or array_length(p_user_ids, 1) = 0 then
    return;
  end if;
  return query select s.subscription from public.push_subscriptions s
  where s.user_id = any(p_user_ids);
end $$;

-- Cegah spam push: kembalikan hanya id target yang benar-benar berhubungan
-- dengan si pengirim (satu DM / satu grup). Dipanggil edge function send-push
-- SEBELUM mengambil subscription, jadi user tidak bisa push ke orang asing.
create or replace function public.filter_notify_targets(p_from uuid, p_ids uuid[])
returns table (user_id uuid)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_auth();
  if p_from is null or p_ids is null or array_length(p_ids, 1) = 0 then
    return;
  end if;
  return query
  select distinct x.id
  from unnest(p_ids) as x(id)
  where x.id <> p_from
    and (
      exists (
        select 1 from public.conversations c
        where (c.user_a = p_from and c.user_b = x.id)
           or (c.user_a = x.id and c.user_b = p_from)
      )
      or exists (
        select 1 from public.group_members a
        join public.group_members b on a.group_id = b.group_id
        where a.user_id = p_from and b.user_id = x.id
      )
    );
end $$;

-- Client menyimpan subscription push-nya sendiri (wajib login).
create or replace function public.save_push_subscription(p_subscription jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_subscription is null or p_subscription ->> 'endpoint' is null then
    raise exception 'Subscription tidak valid';
  end if;
  -- Hapus baris lama dengan endpoint yang sama (mungkin milik akun lama di
  -- perangkat yang sama) lalu simpan sebagai milik user yang sedang login.
  delete from public.push_subscriptions
  where subscription ->> 'endpoint' = p_subscription ->> 'endpoint';
  insert into public.push_subscriptions (user_id, subscription) values (v_uid, p_subscription);
end $$;

-- Client menghapus subscription sendiri (logout / izin dicabut).
create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  v_uid := public.require_auth();
  if p_endpoint is null or p_endpoint = '' then return; end if;
  delete from public.push_subscriptions
  where user_id = v_uid and subscription ->> 'endpoint' = p_endpoint;
end $$;

-- Edge function memanggil ini saat push service balas 404/410 (endpoint mati),
-- biar subscription basi tidak menumpuk. Boleh dihapus oleh pemiliknya sendiri
-- atau user yang masih berhubungan (satu DM / satu grup) dengannya.
create or replace function public.cleanup_push_subscription(p_endpoint text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
  v_target uuid;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  if p_endpoint is null or p_endpoint = '' then
    return;
  end if;
  select user_id into v_target
  from public.push_subscriptions
  where subscription ->> 'endpoint' = p_endpoint;
  if v_target is null then
    return;
  end if;
  if v_target = v_uid then
    delete from public.push_subscriptions where subscription ->> 'endpoint' = p_endpoint;
    return;
  end if;
  if exists (
    select 1 from public.conversations c
    where (c.user_a = v_uid and c.user_b = v_target)
       or (c.user_a = v_target and c.user_b = v_uid)
  ) or exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = v_uid and b.user_id = v_target
  ) then
    delete from public.push_subscriptions where subscription ->> 'endpoint' = p_endpoint;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6a) AUTO-CLEAN 24 JAM: setiap sehari sekali, SEMUA data chat/history/media
--     dihapus otomatis. Yang TERSISA hanya data login (users + sessions),
--     pengaturan blackout, dan log pembersihan. Dipanggil frontend saat app
--     dibuka; aman karena hanya berjalan bila sudah lewat 24 jam.
-- ---------------------------------------------------------------------
create table if not exists public.cleanup_log (
  id int primary key default 1,
  last_clean timestamptz not null default now(),
  constraint cleanup_log_singleton check (id = 1)
);
insert into public.cleanup_log (id) values (1) on conflict (id) do nothing;

create or replace function public.maybe_cleanup()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_last timestamptz;
begin
  perform public.rate_limit();
  perform public.require_auth();
  select last_clean into v_last from public.cleanup_log where id = 1;
  if v_last is not null and v_last > now() - interval '24 hours' then
    return false;
  end if;
  delete from public.group_reactions;
  delete from public.reactions;
  delete from public.group_messages;
  delete from public.messages;
  delete from public.group_key_backups;
  delete from public.group_keys;
  delete from public.group_members;
  delete from public.group_chats;
  delete from public.conversations;
  delete from public.story_views;
  delete from public.stories;
  delete from public.reels;
  delete from public.user_locations;
  delete from public.access_logs;
  delete from public.upload_daily;
  -- push_subscriptions TIDAK ikut dibersihkan: itu pendaftaran perangkat
  -- (bukan konten chat). Kalau ikut dihapus, push notification mati total
  -- setiap 24 jam sampai user tekan 🔔 lagi.
  insert into public.cleanup_log (id, last_clean) values (1, now())
  on conflict (id) do update set last_clean = excluded.last_clean;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- 6b) RLS & AKSES: "semua terkunci, hanya lewat RPC (security definer)".
-- Frontend TIDAK pernah query tabel langsung (murni RPC), jadi tabel publik
-- kita deny-all. Semua fungsi di atas berjalan sebagai definer (postgres)
-- sehingga tetap bisa baca/tulis walau RLS aktif. Kalau ada script eksternal
-- yang pegang anon key, dia TIDAK bisa baca/ubah data apa pun.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in (
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename <> 'migrations'
  ) loop
    execute format('alter table public.%I enable row level security', t);
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'rpc_only'
    ) then
      execute format(
        'create policy "rpc_only" on public.%I for all using (false) with check (false)', t
      );
    end if;
  end loop;
end $$;

-- Bersihkan state lama dari versi sebelumnya: user_locations TIDAK boleh lagi
-- dipublish / dibuka policy realtime-nya (privasi koordinat; peta admin polling).
-- Kalau tidak dihapus eksplisit, objek yang sudah ada akan tetap bertahan.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'user_locations'
  ) then
    alter publication supabase_realtime drop table public.user_locations;
  end if;
end $$;
drop policy if exists "realtime_read" on public.user_locations;

-- Realtime (supabase_realtime / postgres_changes) MENGIKUTI RLS. Policy deny-all
-- "rpc_only" tadi membuat event INSERT/UPDATE/DELETE TIDAK pernah sampai ke
-- client → pesan telat/gagal muncul live. Maka kita buka policy SELECT khusus
-- tabel yang di-publish realtime. Client TETAP tidak bisa menulis
-- (insert/update/delete tetap deny-all; semua mutasi lewat RPC security definer).
-- NOTE: `blackouts` TIDAK ikut dibuka (IP korban tetap privat; deteksi layar
-- hitam sudah lewat RPC polling + broadcast).
do $$
declare t text;
begin
  foreach t in array array['messages','group_messages','reactions','group_reactions','stories']
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'realtime_read'
    ) then
      execute format('create policy "realtime_read" on public.%I for select using (true)', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7) AKUN MASTER BAWAAN  (GANTI PASSWORDNYA!)
--    username: master  password: nexus2024
-- ---------------------------------------------------------------------
insert into public.users (username, password_hash, status, is_admin)
values ('master', crypt('nexus2024', gen_salt('bf')), 'approved', true)
on conflict (username) do nothing;
