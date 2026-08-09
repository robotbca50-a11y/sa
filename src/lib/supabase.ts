import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://lbiwnxkonxgnolmcuxap.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DXiqWZix9UuPv8-jJYy2Bg_jjZgJmFT';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 30 } },
});
