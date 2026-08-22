import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { requirePublicEnv } from '@/lib/config/env';

/**
 * Supabase client for server components, route handlers and server actions.
 * Reads the user's session from cookies and runs under RLS as that user.
 * This is the default server-side client — reach for it first.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = requirePublicEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // Session refresh is handled by middleware instead.
        }
      },
    },
  });
}
