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

-- ---------------------------------------------------------------------
-- 2) TABEL DASAR (aman kalau sudah ada)
-- ---------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password text not null,
  public_key text,
  status text default 'pending',
  created_at timestamptz default now()
);

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
alter table public.group_messages add column if not exists read_at timestamptz;

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
  created_at timestamptz default now()
);

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
  created_at timestamptz default now(),
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
    execute 'alter publication supabase_realtime add table public.user_locations';
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
        'delete_reel','upsert_location','log_access'
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

-- RATE LIMIT per IP (backstop anti-DDoS di level DB, 12 permintaan/detik).
-- Dipanggil otomatis di awal hampir semua fungsi RPC di bawah.
create or replace function public.rate_limit(p_max int default 12, p_window int default 1)
returns void
language plpgsql volatile set search_path = public
as $$
declare
  v_ip text := public.client_ip();
  v_key text := v_ip || ':' || to_char(now(), 'YYYYMMDDHH24MISS');
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

-- Kuota upload storage: maks 500 MB & 100 file per hari per akun.
-- Dipanggil dari frontend sebelum tiap upload.
create or replace function public.log_media_upload(p_user_id uuid, p_bytes bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_bytes bigint; v_files int;
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if p_bytes is null or p_bytes < 0 then
    p_bytes := 0;
  end if;
  select coalesce(bytes, 0), coalesce(files, 0) into v_bytes, v_files
  from public.upload_daily where user_id = p_user_id and day = current_date;
  if v_bytes + p_bytes > 524288000 then
    raise exception 'Kuota upload harian tercapai (500 MB). Coba lagi besok.';
  end if;
  if v_files + 1 > 100 then
    raise exception 'Maksimal 100 file per hari per akun.';
  end if;
  insert into public.upload_daily (user_id, day, bytes, files)
  values (p_user_id, current_date, p_bytes, 1)
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

create or replace function public.register_user(p_username text, p_password text, p_public_key text, p_ip text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  v_ip text;
  v_cnt int;
  v_blocked_until timestamptz;
begin
  perform public.rate_limit();
  v_ip := coalesce(nullif(btrim(coalesce(p_ip, '')), ''), public.client_ip());
  select blocked_until into v_blocked_until
  from public.ip_blocks where ip = v_ip and blocked_until > now();
  if v_blocked_until is not null then
    raise exception 'IP kamu diblokir sementara sampai % — kamu sudah membuat terlalu banyak akun dari IP yang sama. Coba lagi nanti.', to_char(v_blocked_until, 'DD-MM-YYYY HH24:MI');
  end if;
  select count(*) into v_cnt
  from public.registration_logs
  where ip = v_ip and created_at > now() - interval '10 minutes';
  if v_cnt >= 2 then
    insert into public.ip_blocks (ip, blocked_until)
    values (v_ip, now() + interval '4 hours')
    on conflict (ip) do update set blocked_until = excluded.blocked_until;
    raise exception 'IP kamu diblokir selama 4 jam karena membuat 3 akun dalam waktu cepat.';
  end if;
  if p_username is null or length(btrim(p_username)) < 2 then
    raise exception 'Username minimal 2 karakter';
  end if;
  if p_password is null or length(p_password) < 4 then
    raise exception 'Password minimal 4 karakter';
  end if;
  insert into public.users (username, password, public_key, status)
  values (btrim(p_username), p_password, p_public_key, 'pending')
  returning id into new_id;
  insert into public.access_logs (user_id, event) values (new_id, 'register');
  insert into public.registration_logs (ip) values (v_ip);
  delete from public.ip_blocks where blocked_until <= now();
  delete from public.registration_logs where created_at < now() - interval '1 day';
  return new_id;
exception when unique_violation then
  raise exception 'Username sudah dipakai';
end $$;

create or replace function public.login_user(p_username text, p_password text)
returns setof public.users
language plpgsql security definer set search_path = public
as $$
declare
  target_id uuid;
  v_ip text := public.client_ip();
  v_failed int;
  v_blocked timestamptz;
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
  select id into target_id from public.users
  where username = btrim(p_username) and password = p_password and status = 'approved';
  if target_id is null then
    insert into public.login_attempts (ip, username, success) values (v_ip, p_username, false);
    raise exception 'Username / password salah, atau belum di-ACC admin';
  end if;
  insert into public.login_attempts (ip, username, success) values (v_ip, p_username, true);
  insert into public.access_logs (user_id, event, ip) values (target_id, 'login', v_ip);
  return query select * from public.users where id = target_id;
end $$;

create or replace function public.admin_check(p_admin_username text, p_admin_password text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare ok boolean;
begin
  select exists(
    select 1 from public.users
    where username = btrim(p_admin_username) and password = p_admin_password and is_admin = true
  ) into ok;
  return ok;
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

  -- 1) Hapus file media di storage (privacy: file juga hilang, bukan cuma row)
  delete from storage.objects
  where bucket_id = 'chat-media'
    and name in (
      select media_path from public.messages
      where conversation_id in (
        select id from public.conversations where user_a = p_target_id or user_b = p_target_id
      )
      union
      select media_path from public.messages where sender_id = p_target_id
      union
      select media_path from public.stories where user_id = p_target_id
      union
      select media_path from public.reels where user_id = p_target_id
    );

  -- 2) DM: hapus semua pesan di percakapan yang melibatkan user (reactions ikut terhapus via cascade)
  delete from public.messages
  where conversation_id in (
    select id from public.conversations where user_a = p_target_id or user_b = p_target_id
  );

  -- 3) Sisa pesan DM yang user kirim (pengaman kalau ada percakapan aneh)
  delete from public.messages where sender_id = p_target_id;

  -- 4) Hapus percakapan
  delete from public.conversations where user_a = p_target_id or user_b = p_target_id;

  -- 5) Grup yang user buat (member, kunci, pesan, reaction ikut cascade)
  delete from public.group_chats where created_by = p_target_id;

  -- 6) Pesan grup yang user kirim di grup milik orang lain
  delete from public.group_messages where sender_id = p_target_id;

  -- 7) Reaksi, member, kunci grup milik user (sudah cascade, tapi eksplisit biar aman)
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
begin
  perform public.rate_limit();
  if not exists (
    select 1 from public.users
    where username = p_username and password = p_password and status = 'approved'
  ) then
    raise exception 'Username / password salah';
  end if;
  update public.users
  set public_key = p_new_public_key
  where username = p_username;
  insert into public.access_logs (user_id, event, ip)
  values (
    (select id from public.users where username = p_username),
    'key_rotated', 'app'
  );
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
  return query select u.id, u.public_key from public.users u
  where u.username = btrim(p_username) and u.status = 'approved';
end $$;

create or replace function public.get_or_create_conversation(p_user_a uuid, p_user_b uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare cid uuid;
begin
  perform public.rate_limit();
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

create or replace function public.my_conversations(p_user_id uuid)
returns table (id uuid, peer_id uuid, peer_username text, peer_public_key text, last_at timestamptz, last_type text, last_ciphertext text, last_iv text, last_sender_id uuid)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  return query
  select
    c.id,
    case when c.user_a = p_user_id then c.user_b else c.user_a end as peer_id,
    pu.username as peer_username,
    pu.public_key as peer_public_key,
    m.created_at as last_at,
    m.msg_type as last_type,
    m.ciphertext as last_ciphertext,
    m.iv as last_iv,
    m.sender_id as last_sender_id
  from public.conversations c
  join public.users pu on pu.id = case when c.user_a = p_user_id then c.user_b else c.user_a end
  left join lateral (
    select m2.* from public.messages m2
    where m2.conversation_id = c.id and m2.deleted = false
    order by m2.created_at desc limit 1
  ) m on true
  where (c.user_a = p_user_id or c.user_b = p_user_id)
    and coalesce(pu.is_admin, false) = false
  order by m.created_at desc nulls last;
end $$;

create or replace function public.send_message(p_conversation_id uuid, p_sender_id uuid, p_ciphertext text, p_iv text, p_msg_type text, p_media_path text default null, p_reply_to uuid default null, p_id uuid default gen_random_uuid())
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  perform public.require_conversation_member(p_conversation_id, p_sender_id);
  if p_ciphertext is not null and length(p_ciphertext) > 50000 then
    raise exception 'Pesan terlalu panjang';
  end if;
  insert into public.messages (id, conversation_id, sender_id, ciphertext, iv, msg_type, media_path, reply_to)
  values (p_id, p_conversation_id, p_sender_id, p_ciphertext, p_iv, p_msg_type, p_media_path, p_reply_to)
  on conflict (id) do nothing;
end $$;

create or replace function public.get_messages(p_conversation_id uuid, p_user_id uuid default null)
returns table (id uuid, conversation_id uuid, sender_id uuid, username text, sender_public_key text, ciphertext text, iv text, msg_type text, media_path text, reply_to uuid, edited_at timestamptz, deleted boolean, read_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if p_user_id is not null then
    perform public.require_conversation_member(p_conversation_id, p_user_id);
  end if;
  return query
  select m.id, m.conversation_id, m.sender_id, u.username, u.public_key as sender_public_key,
         m.ciphertext, m.iv, m.msg_type, m.media_path, m.reply_to, m.edited_at, m.deleted, m.read_at, m.created_at
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
  perform public.require_conversation_member(p_conversation_id, p_user_id);
  update public.messages set read_at = now()
  where conversation_id = p_conversation_id
    and sender_id <> p_user_id
    and read_at is null;
end $$;

create or replace function public.get_message(p_id uuid, p_user_id uuid default null)
returns setof public.messages
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if p_user_id is not null and not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_id and (c.user_a = p_user_id or c.user_b = p_user_id)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  return query select * from public.messages where id = p_id;
end $$;

create or replace function public.edit_message(p_message_id uuid, p_sender_id uuid, p_ciphertext text, p_iv text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and m.sender_id = p_sender_id
      and (c.user_a = p_sender_id or c.user_b = p_sender_id)
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.messages set ciphertext = p_ciphertext, iv = p_iv, edited_at = now()
  where id = p_message_id and sender_id = p_sender_id;
end $$;

create or replace function public.delete_message(p_message_id uuid, p_sender_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and m.sender_id = p_sender_id
      and (c.user_a = p_sender_id or c.user_b = p_sender_id)
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.messages set deleted = true
  where id = p_message_id and sender_id = p_sender_id;
end $$;

-- REACTIONS
create or replace function public.add_reaction(p_message_id uuid, p_user_id uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and (c.user_a = p_user_id or c.user_b = p_user_id)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  insert into public.reactions (message_id, user_id, emoji)
  values (p_message_id, p_user_id, p_emoji)
  on conflict (message_id, user_id, emoji) do nothing;
end $$;

create or replace function public.remove_reaction(p_message_id uuid, p_user_id uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if not exists (
    select 1 from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = p_message_id and (c.user_a = p_user_id or c.user_b = p_user_id)
  ) then
    raise exception 'Akses ditolak: bukan anggota percakapan';
  end if;
  delete from public.reactions where message_id = p_message_id and user_id = p_user_id and emoji = p_emoji;
end $$;

-- GRUP
create or replace function public.group_create(p_name text, p_creator uuid, p_members uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare gid uuid; m uuid;
begin
  perform public.rate_limit();
  perform public.require_user(p_creator);
  if p_name is null or length(btrim(p_name)) < 1 then
    raise exception 'Nama grup minimal 1 karakter';
  end if;
  insert into public.group_chats (name, created_by) values (btrim(p_name), p_creator) returning id into gid;
  insert into public.group_members (group_id, user_id) values (gid, p_creator) on conflict do nothing;
  foreach m in array p_members loop
    continue when m is null;
    if exists (select 1 from public.users where id = m) then
      insert into public.group_members (group_id, user_id) values (gid, m) on conflict do nothing;
    end if;
  end loop;
  return gid;
end $$;

create or replace function public.my_groups(p_user_id uuid)
returns setof public.group_chats
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  return query
  select g.* from public.group_chats g
  join public.group_members gm on gm.group_id = g.id
  where gm.user_id = p_user_id
  order by g.created_at desc;
end $$;

create or replace function public.group_add_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if not exists (select 1 from public.group_chats where id = p_group_id) then
    raise exception 'Grup tidak ditemukan';
  end if;
  insert into public.group_members (group_id, user_id) values (p_group_id, p_user_id) on conflict do nothing;
end $$;

create or replace function public.group_members(p_group_id uuid)
returns setof public.users
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  return query
  select u.* from public.users u
  join public.group_members gm on gm.user_id = u.id
  where gm.group_id = p_group_id
    and coalesce(u.is_admin, false) = false;
end $$;

create or replace function public.group_send(p_group_id uuid, p_sender_id uuid, p_ciphertext text, p_iv text, p_msg_type text, p_media_path text default null, p_reply_to uuid default null, p_id uuid default gen_random_uuid())
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  perform public.require_group_member(p_group_id, p_sender_id);
  if p_ciphertext is not null and length(p_ciphertext) > 50000 then
    raise exception 'Pesan terlalu panjang';
  end if;
  insert into public.group_messages (id, group_id, sender_id, ciphertext, iv, msg_type, media_path, reply_to)
  values (p_id, p_group_id, p_sender_id, p_ciphertext, p_iv, p_msg_type, p_media_path, p_reply_to)
  on conflict (id) do nothing;
end $$;

create or replace function public.get_group_messages(p_group_id uuid, p_user_id uuid default null)
returns table (id uuid, group_id uuid, sender_id uuid, username text, sender_public_key text, ciphertext text, iv text, msg_type text, media_path text, reply_to uuid, edited_at timestamptz, deleted boolean, read_at timestamptz, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if p_user_id is not null then
    perform public.require_group_member(p_group_id, p_user_id);
  end if;
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
  perform public.require_group_member(p_group_id, p_user_id);
  update public.group_messages set read_at = now()
  where group_id = p_group_id
    and sender_id <> p_user_id
    and read_at is null;
end $$;

create or replace function public.get_group_message(p_id uuid, p_user_id uuid default null)
returns setof public.group_messages
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if p_user_id is not null and not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_id and gmb.user_id = p_user_id
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  return query select * from public.group_messages where id = p_id;
end $$;

create or replace function public.group_edit_message(p_message_id uuid, p_sender_id uuid, p_ciphertext text, p_iv text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gm.sender_id = p_sender_id and gmb.user_id = p_sender_id
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.group_messages set ciphertext = p_ciphertext, iv = p_iv, edited_at = now()
  where id = p_message_id and sender_id = p_sender_id;
end $$;

create or replace function public.group_delete_message(p_message_id uuid, p_sender_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_sender_id);
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gm.sender_id = p_sender_id and gmb.user_id = p_sender_id
  ) then
    raise exception 'Akses ditolak: bukan pengirim pesan';
  end if;
  update public.group_messages set deleted = true
  where id = p_message_id and sender_id = p_sender_id;
end $$;

create or replace function public.group_add_reaction(p_message_id uuid, p_user_id uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gmb.user_id = p_user_id
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  insert into public.group_reactions (message_id, user_id, emoji)
  values (p_message_id, p_user_id, p_emoji)
  on conflict (message_id, user_id, emoji) do nothing;
end $$;

create or replace function public.group_remove_reaction(p_message_id uuid, p_user_id uuid, p_emoji text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  if not exists (
    select 1 from public.group_messages gm
    join public.group_members gmb on gmb.group_id = gm.group_id
    where gm.id = p_message_id and gmb.user_id = p_user_id
  ) then
    raise exception 'Akses ditolak: bukan anggota grup';
  end if;
  delete from public.group_reactions where message_id = p_message_id and user_id = p_user_id and emoji = p_emoji;
end $$;

-- GROUP KEY (E2E)
create or replace function public.group_save_key(p_group_id uuid, p_user_id uuid, p_enc_key text, p_iv text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_group_member(p_group_id, p_user_id);
  insert into public.group_keys (group_id, user_id, enc_key, iv)
  values (p_group_id, p_user_id, p_enc_key, p_iv)
  on conflict (group_id, user_id) do update set enc_key = excluded.enc_key, iv = excluded.iv;
end $$;

create or replace function public.group_get_key(p_group_id uuid, p_user_id uuid)
returns table (enc_key text, iv text)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_group_member(p_group_id, p_user_id);
  return query select gk.enc_key, gk.iv from public.group_keys gk
  where gk.group_id = p_group_id and gk.user_id = p_user_id;
end $$;

-- STORY
create or replace function public.story_add(p_user_id uuid, p_media_path text, p_caption text, p_kind text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  insert into public.stories (user_id, media_path, caption, kind) values (p_user_id, p_media_path, p_caption, p_kind);
end $$;

create or replace function public.get_stories()
returns table (id uuid, user_id uuid, username text, media_path text, caption text, kind text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  return query
  select s.id, s.user_id, u.username, s.media_path, s.caption, s.kind, s.created_at
  from public.stories s
  join public.users u on u.id = s.user_id
  where s.created_at > now() - interval '24 hours'
    and coalesce(u.is_admin, false) = false
  order by s.created_at desc;
end $$;

create or replace function public.get_my_stories(p_user_id uuid)
returns setof public.stories
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  return query select * from public.stories
  where user_id = p_user_id and created_at > now() - interval '24 hours'
  order by created_at desc;
end $$;

create or replace function public.view_story(p_story_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  insert into public.story_views (story_id, user_id) values (p_story_id, p_user_id)
  on conflict do nothing;
end $$;

create or replace function public.get_story_views(p_story_id uuid)
returns table (user_id uuid, username text, viewed_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  return query
  select v.user_id, u.username, v.viewed_at
  from public.story_views v
  join public.users u on u.id = v.user_id
  where v.story_id = p_story_id
    and coalesce(u.is_admin, false) = false
  order by v.viewed_at desc;
end $$;

create or replace function public.delete_story(p_story_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  delete from public.stories where id = p_story_id and user_id = p_user_id;
end $$;

-- REELS
create or replace function public.reel_add(p_user_id uuid, p_source text, p_tiktok_url text default null, p_media_path text default null, p_caption text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  insert into public.reels (user_id, source, tiktok_url, media_path, caption)
  values (p_user_id, p_source, p_tiktok_url, p_media_path, p_caption);
end $$;

create or replace function public.get_reels()
returns table (id uuid, user_id uuid, username text, source text, tiktok_url text, media_path text, caption text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  return query
  select r.id, r.user_id, u.username, r.source, r.tiktok_url, r.media_path, r.caption, r.created_at
  from public.reels r
  join public.users u on u.id = r.user_id
  where coalesce(u.is_admin, false) = false
  order by r.created_at desc;
end $$;

create or replace function public.delete_reel(p_reel_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  delete from public.reels where id = p_reel_id and user_id = p_user_id;
end $$;

-- LOKASI & LOG
create or replace function public.upsert_location(p_user_id uuid, p_lat double precision, p_lng double precision, p_accuracy double precision)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  insert into public.user_locations (user_id, lat, lng, accuracy, updated_at)
  values (p_user_id, p_lat, p_lng, p_accuracy, now())
  on conflict (user_id) do update set
    lat = excluded.lat, lng = excluded.lng,
    accuracy = excluded.accuracy, updated_at = now();
end $$;

create or replace function public.log_access(p_user_id uuid, p_event text, p_ip text default null, p_user_agent text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  perform public.require_user(p_user_id);
  insert into public.access_logs (user_id, event, ip, user_agent) values (p_user_id, p_event, p_ip, p_user_agent);
end $$;

-- ---------------------------------------------------------------------
-- 7) AKUN MASTER BAWAAN  (GANTI PASSWORDNYA!)
--    username: master  password: nexus2024
-- ---------------------------------------------------------------------
insert into public.users (username, password, status, is_admin)
values ('master', 'nexus2024', 'approved', true)
on conflict (username) do nothing;
