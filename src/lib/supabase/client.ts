'use client';

import { createBrowserClient } from '@supabase/ssr';
import { requirePublicEnv } from '@/lib/config/env';

/**
 * Supabase client for browser (client component) use.
 * Authenticated as the signed-in user; every query is subject to RLS.
 * Only the anon key is ever used here.
 */
export function createSupabaseBrowserClient() {
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
