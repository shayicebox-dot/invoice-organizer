import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requirePublicEnv, serverEnv } from '@/lib/config/env';

/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY.
 *
 * Use only for trusted background work that cannot run as a user:
 * integration sync jobs, scheduled imports, webhooks.
 *
 * Never import this from a client component, and never expose its results
 * to the browser without re-checking authorisation first. The `server-only`
 * import above turns any client import into a build error.
 */
export function createSupabaseAdminClient() {
  const { supabaseUrl } = requirePublicEnv();
  const { supabaseServiceRoleKey } = serverEnv();

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
