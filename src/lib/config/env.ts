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

function assertServer(caller: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`${caller} was called in the browser. Secrets must never leave the server.`);
  }
}

/** Secrets. Server-side only — calling this in the browser is a bug. */
export function serverEnv(): { supabaseServiceRoleKey: string } {
  assertServer('serverEnv()');
  return {
    supabaseServiceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

/**
 * Shopify Admin API credentials. Server-side only, and never prefixed
 * `NEXT_PUBLIC_` — the access token grants read access to the whole store.
 */
export function shopifyEnv(): {
  storeDomain: string;
  adminAccessToken: string;
  apiVersion: string | undefined;
} {
  assertServer('shopifyEnv()');
  return {
    storeDomain: required('SHOPIFY_STORE_DOMAIN', process.env.SHOPIFY_STORE_DOMAIN),
    adminAccessToken: required(
      'SHOPIFY_ADMIN_ACCESS_TOKEN',
      process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    ),
    apiVersion: process.env.SHOPIFY_API_VERSION,
  };
}

/** True when both Shopify variables are present, without reading their values. */
export function isShopifyConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  return (
    (process.env.SHOPIFY_STORE_DOMAIN ?? '').length > 0 &&
    (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? '').length > 0
  );
}

/**
 * Shared secret protecting the integration test endpoints until real
 * authentication exists. `null` means unset — endpoints then refuse to run
 * rather than defaulting to being publicly callable.
 */
export function integrationTestSecret(): string | null {
  assertServer('integrationTestSecret()');
  const secret = process.env.ICEBOX_INTEGRATION_TEST_SECRET ?? '';
  return secret.length > 0 ? secret : null;
}

/** True when Supabase credentials are configured — lets the shell render without them. */
export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}
