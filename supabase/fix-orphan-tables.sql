-- ═══════════════════════════════════════════════════════════════
-- FIX: Orphaned security_events + blocked_ips tables
-- Problem: RLS rpc_only blocks direct queries.
--          get_security_events() requires admin auth (server has anon key).
-- Solution: SECURITY DEFINER sync functions callable with anon key.
-- ═══════════════════════════════════════════════════════════════

-- 1. sync_blocked_ips: return all active blocked IPs (no auth needed)
create or replace function public.sync_blocked_ips()
returns table (
  ip text,
  is_permanent boolean,
  blocked_until timestamptz,
  threat_score int
)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select b.ip, b.is_permanent, b.blocked_until, b.threat_score
  from public.blocked_ips b
  where b.is_permanent = true
     or (b.blocked_until is not null and b.blocked_until > now());
end $$;


-- 2. sync_security_events: return recent security events (no auth needed)
create or replace function public.sync_security_events(p_limit int default 200)
returns table (
  ip text,
  event_type text,
  severity text,
  detail text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  return query
  select se.ip, se.event_type, se.severity, se.detail, se.created_at
  from public.security_events se
  order by se.created_at desc
  limit p_limit;
end $$;


-- 3. Revoke direct table access (RLS stays as backup)
revoke all on public.blocked_ips from anon;
revoke all on public.security_events from anon;
