-- ═══════════════════════════════════════════════════════════════
-- FIX: ::jsonb cast on empty string crashes ALL RPC calls
-- current_setting('request.headers', true) returns '' when missing
-- ''::jsonb is invalid PostgreSQL → 400 Bad Request on every function
-- Fix: wrap in nullif(..., '') before casting
-- ═══════════════════════════════════════════════════════════════

-- 1. Fix client_ip() — 3 occurrences
create or replace function public.client_ip()
returns text
language sql stable
as $$
  select coalesce(
    nullif((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'cf-connecting-ip', ''),
    nullif(split_part(coalesce((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-forwarded-for', ''), ',', 1), ''),
    nullif((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-real-ip', ''),
    '0.0.0.0'
  );
$$;


-- 2. Fix auth_user_id() — 1 occurrence
create or replace function public.auth_user_id()
returns uuid
language plpgsql security definer stable set search_path = public
as $$
declare
  v_token text;
  v_uid uuid;
begin
  v_token := nullif((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-nexus-token', '');
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


-- 3. Fix kill_my_sessions() — 1 occurrence
drop function if exists public.kill_my_sessions();
create or replace function public.kill_my_sessions()
returns int
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid; v_token text; v_count int; v_epoch bigint;
begin
  perform public.rate_limit();
  v_uid := public.require_auth();
  v_token := nullif((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-nexus-token', '');
  delete from public.sessions
  where user_id = v_uid
    and (v_token is null or token_hash <> encode(digest(v_token, 'sha256'), 'hex'));
  get diagnostics v_count = row_count;
  update public.users set session_epoch = session_epoch + 1
  where id = v_uid returning session_epoch into v_epoch;
  return v_count;
end $$;
