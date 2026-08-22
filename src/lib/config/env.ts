/**
 * Typed, validated access to environment variables.
 *
 * Rules:
 * - `NEXT_PUBLIC_*` values may reach the browser. Nothing else may.
 * - Server-only secrets are read through `serverEnv()`, which throws if it is
 *   ever evaluated in a browser bundle.
 * - Never read `process.env` directly outside this file.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(
      `Missing environment variable: ${name}. See .env.example for the full list.`,
    );
  }
  return value;
}

/** Values that are safe to reference from client and server code. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;

export function requirePublicEnv(): { supabaseUrl: string; supabaseAnonKey: string } {
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl),
    supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey),
  };
}

/** Secrets. Server-side only — calling this in the browser is a bug. */
export function serverEnv(): { supabaseServiceRoleKey: string } {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Secrets must never leave the server.');
  }
  return {
    supabaseServiceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

/** True when Supabase credentials are configured — lets the shell render without them. */
export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}
