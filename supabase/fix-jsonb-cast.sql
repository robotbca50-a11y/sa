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
create or replace function public.kill_my_sessions()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_token text;
  v_uid uuid;
begin
  v_token := nullif((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-nexus-token', '');
  if v_token is null then
    return;
  end if;
  select s.user_id into v_uid
  from public.sessions s
  where s.token_hash = encode(digest(v_token, 'sha256'), 'hex');
  if v_uid is not null then
    update public.sessions set revoked = true where user_id = v_uid;
  end if;
end $$;
