/**
 * Shopify configuration, read from the environment.
 *
 * Credentials live only in the environment — never in source, never in the
 * database, never in a `NEXT_PUBLIC_` variable. This module returns `null`
 * when the integration is not configured, which is what drives the app's
 * fallback to mock data rather than an error state.
 *
 * Nothing here ever logs, returns or serializes a secret value.
 */

/** Pinned Admin API version. Override with SHOPIFY_API_VERSION. */
const DEFAULT_API_VERSION = "2026-07";

export interface ShopifyConfig {
  /** Canonical `example.myshopify.com` host, no protocol or trailing slash. */
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}

/**
 * Accepts `example`, `example.myshopify.com`, or a full URL, and normalizes
 * to the bare host. A pasted admin URL is a common setup mistake and is
 * cheaper to absorb here than to diagnose from a 404 later.
 */
export function normalizeStoreDomain(raw: string): string {
  let domain = raw.trim().toLowerCase();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/\/.*$/, "");
  domain = domain.replace(/\.+$/, "");
  if (domain === "") return "";
  if (!domain.includes(".")) domain = `${domain}.myshopify.com`;
  return domain;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

/**
 * The active configuration, or `null` when any required variable is missing.
 * Read on each call so a restart is enough to pick up a changed `.env.local`.
 */
export function getShopifyConfig(): ShopifyConfig | null {
  const storeDomain = normalizeStoreDomain(readEnv("SHOPIFY_STORE_DOMAIN"));
  const clientId = readEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = readEnv("SHOPIFY_CLIENT_SECRET");

  if (!storeDomain || !clientId || !clientSecret) return null;

  return {
    storeDomain,
    clientId,
    clientSecret,
    apiVersion: readEnv("SHOPIFY_API_VERSION") || DEFAULT_API_VERSION,
  };
}

/** Which of the required variables are missing. Names only — never values. */
export function missingShopifyEnvNames(): string[] {
  return (["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET"] as const).filter(
    (name) => readEnv(name) === "",
  );
}

export function isShopifyConfigured(): boolean {
  return getShopifyConfig() !== null;
}
