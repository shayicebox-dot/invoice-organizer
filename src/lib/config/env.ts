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
 * Shopify app credentials for the client credentials grant. Server-side only,
 * and never prefixed `NEXT_PUBLIC_` — the client secret can mint access tokens
 * for the whole store.
 */
export function shopifyEnv(): {
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string | undefined;
} {
  assertServer('shopifyEnv()');
  return {
    storeDomain: required('SHOPIFY_STORE_DOMAIN', process.env.SHOPIFY_STORE_DOMAIN),
    clientId: required('SHOPIFY_CLIENT_ID', process.env.SHOPIFY_CLIENT_ID),
    clientSecret: required('SHOPIFY_CLIENT_SECRET', process.env.SHOPIFY_CLIENT_SECRET),
    apiVersion: process.env.SHOPIFY_API_VERSION,
  };
}

/** True when all Shopify variables are present, without reading their values. */
export function isShopifyConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  return (
    (process.env.SHOPIFY_STORE_DOMAIN ?? '').length > 0 &&
    (process.env.SHOPIFY_CLIENT_ID ?? '').length > 0 &&
    (process.env.SHOPIFY_CLIENT_SECRET ?? '').length > 0
  );
}

/**
 * The single owner password. Server-side only: it is the login credential and
 * the key that signs session cookies, so it must never reach the browser.
 * `null` means unset — the app then refuses every request rather than opening
 * itself up.
 */
export function adminPassword(): string | null {
  if (typeof window !== 'undefined') return null;
  const password = process.env.ICEBOX_ADMIN_PASSWORD ?? '';
  return password.length > 0 ? password : null;
}

/** True when a login password is configured, without reading its value. */
export function isAuthConfigured(): boolean {
  return adminPassword() !== null;
}

/** Production build, used to decide whether cookies may be `Secure`. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Meta Ads credentials. Server-side only, and never prefixed `NEXT_PUBLIC_` —
 * the access token can read the whole ad account's spend and performance.
 */
export function metaEnv(): {
  adAccountId: string;
  accessToken: string;
  apiVersion: string | undefined;
} {
  assertServer('metaEnv()');
  return {
    adAccountId: required('META_AD_ACCOUNT_ID', process.env.META_AD_ACCOUNT_ID),
    accessToken: required('META_ACCESS_TOKEN', process.env.META_ACCESS_TOKEN),
    apiVersion: process.env.META_API_VERSION,
  };
}

/** True when both Meta variables are present, without reading their values. */
export function isMetaConfigured(): boolean {
  if (typeof window !== 'undefined') return false;
  return (
    (process.env.META_AD_ACCOUNT_ID ?? '').length > 0 &&
    (process.env.META_ACCESS_TOKEN ?? '').length > 0
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

/**
 * True when the server can write to the database.
 *
 * A stricter test than `isSupabaseConfigured`: reads through the service-role
 * client also need `SUPABASE_SERVICE_ROLE_KEY`, which is never present in the
 * browser. Checked without reading the key's value.
 */
export function isSupabaseWritable(): boolean {
  if (typeof window !== 'undefined') return false;
  return (
    publicEnv.supabaseUrl.length > 0 && (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').length > 0
  );
}
