-- Run this in Supabase SQL Editor (as postgres role)
-- If permission denied, use the Supabase Dashboard SQL Editor directly

-- Add ciphertexts columns if not exist
ALTER TABLE IF EXISTS public.messages ADD COLUMN IF NOT EXISTS ciphertexts jsonb;
ALTER TABLE IF EXISTS public.group_messages ADD COLUMN IF NOT EXISTS ciphertexts jsonb;
