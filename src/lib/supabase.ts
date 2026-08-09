import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://nwwdnvbfeslglzsgdvdj.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_GkMU340PXc-4BgQ0A-kiTg_OIWegfIf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 30 } },
});
