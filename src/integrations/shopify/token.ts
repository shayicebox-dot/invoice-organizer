import 'server-only';

import type { ShopifyConfig } from '@/integrations/shopify/config';
import { ShopifyError } from '@/integrations/shopify/errors';
import { isRecord, readField } from '@/integrations/shopify/json';

/**
 * Access tokens via Shopify's **client credentials grant**.
 *
 * Dev Dashboard apps have no permanent `shpat_` token. Instead the app trades
 * its client ID and secret for an access token that expires after 24 hours.
 * This module owns that exchange, caches the result in server memory, and
 * refreshes it before it expires.
 *
 * Nothing here is reachable from the browser: `server-only` makes a client
 * import a build error, and neither the client secret nor the access token is
 * ever logged, returned to a caller, or placed in an error message.
 */

const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Refresh this long before the stated expiry. Covers clock skew between this
 * server and Shopify, plus a request that starts just before the boundary.
 */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * Used when Shopify omits `expires_in`. Deliberately short: a token cached for
 * longer than it is valid produces confusing 401s later, whereas re-requesting
 * one is cheap.
 */
const FALLBACK_LIFETIME_SECONDS = 300;

type CachedToken = {
  readonly accessToken: string;
  /** Epoch milliseconds at which Shopify says the token expires. */
  readonly expiresAt: number;
  /** Scopes Shopify reports for this token — a readback, not a request. */
  readonly grantedScopes: readonly string[];
};

/** Public view of the cache. Never includes the token itself. */
export type TokenSnapshot = {
  readonly expiresAt: string;
  readonly grantedScopes: readonly string[];
};

/**
 * Cache and in-flight requests, keyed per store + client.
 *
 * This is per server instance. On Vercel each warm instance keeps its own
 * token, and a cold start fetches a fresh one — correct, if not maximally
 * frugal. A shared cache is a job for the database, once there is one.
 */
const tokenCache = new Map<string, CachedToken>();
const inFlight = new Map<string, Promise<CachedToken>>();

function cacheKey(config: ShopifyConfig): string {
  return `${config.shopDomain}|${config.clientId}`;
}

function isUsable(token: CachedToken, now: number): boolean {
  return token.expiresAt - REFRESH_MARGIN_MS > now;
}

/**
 * A valid access token, from cache when possible.
 *
 * Concurrent callers during a refresh share one request rather than each
 * starting their own — a cold serverless instance answering several requests
 * at once should not open several token exchanges.
 */
export async function getAccessToken(
  config: ShopifyConfig,
  options?: { readonly forceRefresh?: boolean },
): Promise<string> {
  const key = cacheKey(config);
  const now = Date.now();

  if (options?.forceRefresh !== true) {
    const cached = tokenCache.get(key);
    if (cached !== undefined && isUsable(cached, now)) {
      return cached.accessToken;
    }
  }

  const existing = inFlight.get(key);
  if (existing !== undefined) {
    return (await existing).accessToken;
  }

  const request = requestAccessToken(config)
    .then((token) => {
      tokenCache.set(key, token);
      return token;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return (await request).accessToken;
}

/**
 * Drop the cached token so the next call fetches a new one.
 * Called when Shopify rejects a token that has not reached its stated expiry —
 * revoked credentials, a reinstalled app, or a scope change.
 */
export function invalidateAccessToken(config: ShopifyConfig): void {
  tokenCache.delete(cacheKey(config));
}

/** Cache state for diagnostics. `null` when nothing is cached yet. */
export function getTokenSnapshot(config: ShopifyConfig): TokenSnapshot | null {
  const cached = tokenCache.get(cacheKey(config));
  if (cached === undefined) return null;

  return {
    expiresAt: new Date(cached.expiresAt).toISOString(),
    grantedScopes: cached.grantedScopes,
  };
}

/** Exchange client credentials for an access token. */
async function requestAccessToken(config: ShopifyConfig): Promise<CachedToken> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  let response: Response;

  try {
    response = await fetch(config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ShopifyError(
        'timeout',
        `Shopify did not answer the token request within ${TOKEN_REQUEST_TIMEOUT_MS}ms.`,
      );
    }
    throw new ShopifyError('network-error', 'Could not reach Shopify to request an access token.');
  }

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw tokenError(response.status, payload);
  }

  return parseTokenResponse(payload);
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Map an OAuth failure onto a typed error with usable guidance.
 *
 * Only Shopify's own error code and description are surfaced; the request body
 * carried the client secret and is never echoed.
 */
function tokenError(status: number, payload: unknown): ShopifyError {
  const record = isRecord(payload) ? payload : null;
  const code = record === null ? null : readField(record, 'error');
  const description = record === null ? null : readField(record, 'error_description');

  const detail = [code, description]
    .filter((part): part is string => typeof part === 'string')
    .join(': ');

  if (typeof code === 'string' && code.includes('shop_not_permitted')) {
    return new ShopifyError(
      'forbidden',
      'Shopify refused the token request: the app and the store must belong to the same Shopify organization for the client credentials grant to work.',
      status,
    );
  }

  if (status === 400 || status === 401) {
    return new ShopifyError(
      'unauthorized',
      detail.length > 0
        ? `Shopify rejected the client credentials (${detail}).`
        : 'Shopify rejected the client credentials.',
      status,
    );
  }

  if (status === 404) {
    return new ShopifyError(
      'not-found',
      'The token endpoint was not found. Check SHOPIFY_STORE_DOMAIN.',
      status,
    );
  }

  if (status === 403) {
    // Shopify returns 403 when the app and store are in different
    // organizations, but so does any proxy or network policy in the way. With
    // no error body to tell them apart, name both rather than assert one.
    return new ShopifyError(
      'forbidden',
      detail.length > 0
        ? `Shopify refused the token request (${detail}).`
        : 'The token request was refused (403). The app and the store must belong to the same Shopify organization; a network policy blocking Shopify produces the same status.',
      status,
    );
  }

  if (status === 429) {
    return new ShopifyError('throttled', 'Shopify rate limited the token request.', status);
  }

  if (status >= 500) {
    return new ShopifyError('server-error', `Shopify returned ${status} for the token request.`, status);
  }

  return new ShopifyError(
    'token-error',
    detail.length > 0
      ? `Token request failed (${detail}).`
      : `Token request failed with status ${status}.`,
    status,
  );
}

function parseTokenResponse(payload: unknown): CachedToken {
  if (!isRecord(payload)) {
    throw new ShopifyError('invalid-response', 'The token response was not a JSON object.');
  }

  const accessToken = readField(payload, 'access_token');

  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new ShopifyError('invalid-response', 'The token response contained no access_token.');
  }

  const expiresIn = readField(payload, 'expires_in');
  const lifetimeSeconds =
    typeof expiresIn === 'number' && Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : FALLBACK_LIFETIME_SECONDS;

  const scope = readField(payload, 'scope');
  const grantedScopes =
    typeof scope === 'string' && scope.length > 0
      ? scope
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];

  return {
    accessToken,
    expiresAt: Date.now() + lifetimeSeconds * 1000,
    grantedScopes,
  };
}
