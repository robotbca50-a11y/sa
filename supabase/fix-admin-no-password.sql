-- ═══════════════════════════════════════════════════════════════
-- SECURITY FIX: Remove plain-text passwords from ALL admin RPCs
-- Passwords no longer travel over network or through SQL.
-- Server validates ADMIN_SECRET; SQL checks is_admin via auth.
-- ═══════════════════════════════════════════════════════════════

-- 1. Rewrite admin_check: no params, uses require_auth() + is_admin
create or replace function public.admin_check()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  ok boolean;
  v_ip text := public.client_ip();
  v_blocked_until timestamptz;
  v_uid uuid;
begin
  perform public.rate_limit();

  v_uid := public.require_auth();

  select blocked_until into v_blocked_until
  from public.ip_blocks where ip = v_ip and blocked_until > now();
  if v_blocked_until is not null then
    return false;
  end if;

  select exists(
    select 1 from public.users
    where id = v_uid and is_admin = true
  ) into ok;
  return coalesce(ok, false);
end $$;


-- 2. list_pending_users: no password
create or replace function public.list_pending_users()
returns table (id uuid, username text, status text, public_key text, is_admin boolean, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query select u.id, u.username, u.status, u.public_key, u.is_admin, u.created_at
  from public.users u where u.status = 'pending' order by u.created_at desc;
end $$;


-- 3. set_user_status: no password
create or replace function public.set_user_status(p_target_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  update public.users set status = p_status where id = p_target_id;
end $$;


-- 4. get_user_stats: no password
create or replace function public.get_user_stats()
returns table (total bigint, pending bigint, online bigint, today bigint)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select
    (select count(*) from public.users),
    (select count(*) from public.users where status = 'pending'),
    0::bigint,
    (select count(*) from public.access_logs where created_at > now() - interval '24 hours');
end $$;


-- 5. list_all_users: no password
create or replace function public.list_all_users()
returns table (id uuid, username text, status text, public_key text, is_admin boolean, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select u.id, u.username, u.status, u.public_key, coalesce(u.is_admin, false), u.created_at
  from public.users u
  where coalesce(u.is_admin, false) = false
  order by u.created_at desc;
end $$;


-- 6. delete_user: no password
create or replace function public.delete_user(p_target_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  select id into v_uid from public.users where id = p_target_id;
  if v_uid is null then
    raise exception 'User tidak ditemukan';
  end if;
  if exists (select 1 from public.users where id = p_target_id and coalesce(is_admin, false) = true) then
    raise exception 'Tidak bisa menghapus akun master';
  end if;

  delete from public.messages
  where conversation_id in (
    select id from public.conversations where user_a = p_target_id or user_b = p_target_id
  );
  delete from public.messages where sender_id = p_target_id;
  delete from public.conversations where user_a = p_target_id or user_b = p_target_id;
  delete from public.group_chats where created_by = p_target_id;
  delete from public.group_messages where sender_id = p_target_id;
  delete from public.reactions where user_id = p_target_id;
  delete from public.group_reactions where user_id = p_target_id;
  delete from public.group_members where user_id = p_target_id;
  delete from public.group_keys where user_id = p_target_id;
  delete from public.story_views where user_id = p_target_id;
  delete from public.stories where user_id = p_target_id;
  delete from public.reels where user_id = p_target_id;
  delete from public.user_locations where user_id = p_target_id;
  delete from public.access_logs where user_id = p_target_id;
  delete from public.users where id = p_target_id;
end $$;


-- 7. purge_all_users_except_master: no password
create or replace function public.purge_all_users_except_master()
returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid;
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  for v_uid in
    select id from public.users where coalesce(is_admin, false) = false
  loop
    perform public.delete_user(v_uid);
  end loop;
end $$;


-- 8. set_blackout: no password
create or replace function public.set_blackout(p_target_user_id uuid, p_active boolean)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_ip text;
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Admin password salah';
  end if;
  if p_active then
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


-- 9. list_blackouts: no password
create or replace function public.list_blackouts()
returns table (target_user_id uuid, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Admin password salah';
  end if;
  return query select b.target_user_id, b.updated_at from public.blackouts b order by b.updated_at desc;
end $$;


-- 10. get_all_locations: no password
create or replace function public.get_all_locations()
returns table (user_id uuid, username text, lat double precision, lng double precision, accuracy double precision, updated_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select l.user_id, u.username, l.lat, l.lng, l.accuracy, l.updated_at
  from public.user_locations l
  join public.users u on u.id = l.user_id
  where l.updated_at > now() - interval '2 hours'
  order by l.updated_at desc;
end $$;


-- 11. get_access_logs: no password
create or replace function public.get_access_logs()
returns table (id uuid, user_id uuid, username text, event text, ip text, user_agent text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select l.id, l.user_id, u.username, l.event, l.ip, l.user_agent, l.created_at
  from public.access_logs l
  left join public.users u on u.id = l.user_id
  order by l.created_at desc
  limit 500;
end $$;


-- 12. maybe_cleanup: remove password path
create or replace function public.maybe_cleanup()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_last timestamptz;
begin
  perform public.rate_limit();
  perform public.require_auth();
  if not exists (
    select 1 from public.users where id = public.auth_user_id() and is_admin = true
  ) then
    raise exception 'Akses ditolak: hanya admin yang bisa menjalankan cleanup';
  end if;
  select last_clean into v_last from public.cleanup_log where id = 1;
  if v_last is not null and v_last > now() - interval '24 hours' then
    return false;
  end if;

  delete from public.story_views;
  delete from public.stories;
  delete from public.reels;
  delete from public.user_locations;
  delete from public.access_logs;
  delete from public.upload_daily;

  insert into public.cleanup_log (id, last_clean) values (1, now())
  on conflict (id) do update set last_clean = excluded.last_clean;
  return true;
end $$;


-- 13. admin_reports: no password
create or replace function public.admin_reports(p_status text default 'open')
returns table (id uuid, reporter_username text, target_username text, reason text, detail text, status text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select r.id, ru.username as reporter_username, tu.username as target_username,
         r.reason, r.detail, r.status, r.created_at
  from public.reports r
  left join public.users ru on ru.id = r.reporter_id
  left join public.users tu on tu.id = r.target_id
  where (p_status is null or p_status = '' or r.status = p_status)
  order by r.created_at desc
  limit 200;
end $$;


-- 14. resolve_report: no password
create or replace function public.resolve_report(p_report_id uuid, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  update public.reports set status = p_status where id = p_report_id;
end $$;


-- 15. get_security_events: no password
create or replace function public.get_security_events(p_limit int default 100)
returns table (ip text, event_type text, severity text, detail text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  perform public.rate_limit();
  if not public.admin_check() then
    raise exception 'Akses ditolak: bukan master';
  end if;
  return query
  select se.ip, se.event_type, se.severity, se.detail, se.created_at
  from public.security_events se
  order by se.created_at desc
  limit p_limit;
end $$;
