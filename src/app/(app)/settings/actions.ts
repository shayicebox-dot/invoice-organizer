'use server';

import { testShopifyConnection } from '@/integrations/shopify/connection';
import { hasValidSession } from '@/lib/auth/current-session';
import { isShopifyConfigured } from '@/lib/config/env';
import type { ShopifyConnectionView } from '@/components/settings/shopify-status';

/**
 * Server action behind the "Test connection" button in Settings.
 *
 * The whole check runs on the server: the client ID, client secret and access
 * token never leave it, and the browser never needs a shared secret to trigger
 * the test. What comes back is mapped explicitly onto `ShopifyConnectionView`,
 * so a future field added to the integration cannot leak to the browser by
 * being passed through unnoticed.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

/**
 * Attempt timestamps for the crude rate limit below.
 *
 * Per server instance and lost on restart — enough to stop a button being held
 * down from burning Shopify API budget, not a substitute for authentication.
 * Real protection arrives with sign-in; until then see the note in Settings.
 */
const recentAttempts: number[] = [];

function isRateLimited(now: number): boolean {
  while (recentAttempts.length > 0 && now - (recentAttempts[0] ?? 0) > RATE_LIMIT_WINDOW_MS) {
    recentAttempts.shift();
  }

  if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) return true;

  recentAttempts.push(now);
  return false;
}

export async function checkShopifyConnection(): Promise<ShopifyConnectionView> {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();

  // The proxy already blocks unauthenticated requests. Checking again here
  // means this action stays safe on its own merits, rather than depending on a
  // matcher pattern in another file staying correct.
  if (!(await hasValidSession())) {
    return {
      status: 'error',
      message: 'Your session has expired.',
      guidance: 'Sign in again to run the connection test.',
      checkedAt,
    };
  }

  if (isRateLimited(now)) {
    return {
      status: 'error',
      message: 'Too many connection tests in the last minute.',
      guidance: 'Wait a moment and try again.',
      checkedAt,
    };
  }

  if (!isShopifyConfigured()) {
    return {
      status: 'not-connected',
      message: 'Shopify credentials are not set on this deployment.',
      guidance:
        'Add SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in Vercel, then redeploy.',
      checkedAt,
    };
  }

  const result = await testShopifyConnection();

  if (!result.ok) {
    return {
      status: result.reason === 'not-configured' ? 'not-connected' : 'error',
      message: result.message,
      guidance: result.guidance,
      checkedAt,
    };
  }

  return {
    status: 'connected',
    storeName: result.shop.name,
    myshopifyDomain: result.shop.domain,
    currency: result.shop.currency,
    timeZone: result.shop.timeZone,
    plan: result.shop.plan,
    grantedScopes: result.scopes?.granted ?? [],
    missingScopes: result.scopes?.missingRequired ?? [],
    historicalOrdersGranted: result.scopes?.historicalOrdersGranted ?? false,
    apiVersion: result.apiVersion,
    checkedAt,
  };
}
