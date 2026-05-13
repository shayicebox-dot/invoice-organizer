import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let _admin: SupabaseClient | null = null;
let _anon: SupabaseClient | null = null;

// Server-only client with full access. Never expose to the browser.
export function supabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  _admin = createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

// Anon client – fine for client components that read RLS-protected views.
export function supabaseAnon(): SupabaseClient {
  if (_anon) return _anon;
  _anon = createClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { persistSession: false },
  });
  return _anon;
}
