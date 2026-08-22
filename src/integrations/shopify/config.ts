import 'server-only';

import { shopifyEnv } from '@/lib/config/env';

/**
 * Shopify connection configuration, resolved from the environment.
 *
 * This app authenticates with the **client credentials grant**: it exchanges a
 * client ID and secret for a short-lived access token (see `token.ts`). There
 * is no permanent `shpat_` token to store, which is the point — a leaked
 * 24-hour token expires on its own, and rotating the secret revokes access.
 *
 * Credentials live only in environment variables. Nothing here is ever sent to
 * the browser, and no default credential or store exists in the codebase.
 */

/**
 * Admin API version to call. Shopify ships a new stable version quarterly
 * (`YYYY-01`, `YYYY-04`, `YYYY-07`, `YYYY-10`) and supports each for a year.
 * Override with `SHOPIFY_API_VERSION` when upgrading; pinning is deliberate,
 * since `unstable` and `latest` can change field behaviour under us.
 */
export const DEFAULT_SHOPIFY_API_VERSION = '2026-07';

/** Scopes this integration needs on the Shopify access token. */
export const REQUIRED_SHOPIFY_SCOPES: readonly string[] = [
  'read_orders',
  'read_products',
  'read_customers',
];

/**
 * Scope needed to read orders older than 60 days. Shopify limits the `orders`
 * connection to the last 60 days without it, so historical reporting depends
 * on it being granted.
 */
export const HISTORICAL_ORDERS_SCOPE = 'read_all_orders';

const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const API_VERSION_PATTERN = /^\d{4}-\d{2}$/;

export type ShopifyConfig = {
  /** Canonical `<store>.myshopify.com` domain. */
  readonly shopDomain: string;
  readonly apiVersion: string;
  /** Full Admin GraphQL endpoint. */
  readonly endpoint: string;
  /** Where client credentials are exchanged for an access token. */
  readonly tokenEndpoint: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

export class ShopifyConfigError extends Error {
  override readonly name = 'ShopifyConfigError';
}

/**
 * Normalise whatever was pasted into `SHOPIFY_STORE_DOMAIN` into the canonical
 * `<store>.myshopify.com` form, and reject anything else.
 *
 * This is a security control, not a convenience: the client secret is posted
 * to whatever host this resolves to, so an unvalidated value would let a
 * mistyped — or tampered — variable leak the credentials to another server.
 */
export function normaliseShopDomain(value: string): string {
  const trimmed = value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

  const withSuffix = trimmed.endsWith('.myshopify.com') ? trimmed : `${trimmed}.myshopify.com`;

  if (!SHOP_DOMAIN_PATTERN.test(withSuffix)) {
    throw new ShopifyConfigError(
      'SHOPIFY_STORE_DOMAIN must be your permanent Shopify domain, for example "icebox.myshopify.com".',
    );
  }

  return withSuffix;
}

function validateApiVersion(value: string): string {
  if (!API_VERSION_PATTERN.test(value)) {
    throw new ShopifyConfigError(
      `SHOPIFY_API_VERSION must look like "2026-07", received "${value}".`,
    );
  }
  return value;
}

function validateCredential(value: string, name: string): string {
  const credential = value.trim();

  if (credential.length === 0 || /\s/.test(credential)) {
    throw new ShopifyConfigError(`${name} is empty or contains whitespace.`);
  }

  return credential;
}

/** Resolve and validate the configuration. Throws `ShopifyConfigError` if unusable. */
export function getShopifyConfig(): ShopifyConfig {
  const env = shopifyEnv();
  const shopDomain = normaliseShopDomain(env.storeDomain);
  const apiVersion = validateApiVersion(env.apiVersion ?? DEFAULT_SHOPIFY_API_VERSION);

  return {
    shopDomain,
    apiVersion,
    endpoint: `https://${shopDomain}/admin/api/${apiVersion}/graphql.json`,
    tokenEndpoint: `https://${shopDomain}/admin/oauth/access_token`,
    clientId: validateCredential(env.clientId, 'SHOPIFY_CLIENT_ID'),
    clientSecret: validateCredential(env.clientSecret, 'SHOPIFY_CLIENT_SECRET'),
  };
}
