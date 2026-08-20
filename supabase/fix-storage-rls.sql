-- ═══════════════════════════════════════════════════════════════
-- RUN THIS IN SUPABASE DASHBOARD → SQL EDITOR → NEW QUERY → RUN
-- Fixes: storage upload 400 + stories/reels RLS violations
-- ═══════════════════════════════════════════════════════════════

-- Storage policies: allow both 'anon' and 'authenticated' for uploads
-- (app uses custom x-nexus-token auth, not Supabase Auth)

-- Drop old policies
drop policy if exists "nexus public upload" on storage.objects;
drop policy if exists "nexus public read" on storage.objects;
drop policy if exists "nexus cleanup" on storage.objects;

-- Allow upload from any role (anon or authenticated)
create policy "nexus public upload" on storage.objects
  for insert
  with check (bucket_id in ('chat-media', 'avatars'));

-- Allow read from any role
create policy "nexus public read" on storage.objects
  for select
  using (bucket_id in ('chat-media', 'avatars'));

-- Allow delete from any role
create policy "nexus cleanup" on storage.objects
  for delete
  using (bucket_id in ('chat-media', 'avatars'));


-- Stories table: add proper RLS policies
-- (stories use SECURITY DEFINER RPC, but direct realtime reads need policies)
alter table public.stories enable row level security;

-- Allow authenticated/anon to read stories (via realtime)
drop policy if exists "stories_read" on public.stories;
create policy "stories_read" on public.stories
  for select
  using (true);

-- Allow inserts via SECURITY DEFINER only (story_add RPC)
-- No direct insert policy needed — the RPC handles it


-- Reels table: add proper RLS policies
alter table public.reels enable row level security;

drop policy if exists "reels_read" on public.reels;
create policy "reels_read" on public.reels
  for select
  using (true);


-- Story views: add RLS policies
alter table public.story_views enable row level security;

drop policy if exists "story_views_read" on public.story_views;
create policy "story_views_read" on public.story_views
  for select
  using (true);

drop policy if exists "story_views_insert" on public.story_views;
create policy "story_views_insert" on public.story_views
  for insert
  with check (true);

drop policy if exists "story_views_update" on public.story_views;
create policy "story_views_update" on public.story_views
  for update
  using (true);
