import 'server-only';

import type { MorningConfig } from '@/integrations/morning/config';
import { MorningError } from '@/integrations/morning/errors';
import { isRecord, readField } from '@/integrations/shopify/json';

/**
 * JWT bearer tokens from Morning's `POST /account/token`.
 *
 * The API key pair is exchanged for a short-lived JWT, which is cached in
 * server memory and refreshed before it expires. `server-only` makes importing
 * this from a client component a build error, and neither the secret nor the
 * token is ever logged, returned to a caller, or put in an error message.
 */

const TOKEN_PATH = 'account/token';
const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

/** Refresh this long before the stated expiry, covering clock skew. */
const REFRESH_MARGIN_MS = 60_000;

/**
 * Used when Morning states no expiry. Deliberately short: a token cached longer
 * than it is valid produces confusing 401s later, and re-minting one is cheap.
 */
const FALLBACK_LIFETIME_SECONDS = 300;

/** Above this, an `expires` value is already in milliseconds rather than seconds. */
const MILLISECOND_THRESHOLD = 1e12;

type CachedToken = {
  readonly token: string;
  /** Epoch milliseconds at which the token stops being usable. */
  readonly expiresAt: number;
};

/**
 * Per server instance, keyed by host and key id. On Vercel each warm instance
 * mints its own token and a cold start mints a fresh one — correct, if not
 * maximally frugal. A shared cache is a job for the database.
 */
const tokenCache = new Map<string, CachedToken>();
const inFlight = new Map<string, Promise<CachedToken>>();

function cacheKey(config: MorningConfig): string {
  return `${config.host}|${config.clientId}`;
}

/**
 * A valid bearer token, from cache when possible.
 *
 * Concurrent callers during a refresh share one exchange rather than each
 * opening their own — Morning allows roughly three requests a second, and
 * spending that budget on duplicate token requests would be careless.
 */
export async function getMorningToken(config: MorningConfig): Promise<string> {
  const key = cacheKey(config);
  const cached = tokenCache.get(key);

  if (cached !== undefined && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }

  const existing = inFlight.get(key);
  if (existing !== undefined) return (await existing).token;

  const request = requestToken(config)
    .then((minted) => {
      tokenCache.set(key, minted);
      return minted;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return (await request).token;
}

/**
 * Drop the cached token so the next call mints a new one. Called when Morning
 * rejects a token that has not reached its stated expiry — a key regenerated
 * or revoked in the dashboard.
 */
export function invalidateMorningToken(config: MorningConfig): void {
  tokenCache.delete(cacheKey(config));
}

/** Exchange the API key pair for a JWT. */
async function requestToken(config: MorningConfig): Promise<CachedToken> {
  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}/${TOKEN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id: config.clientId, secret: config.clientSecret }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TOKEN_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new MorningError(
        'timeout',
        `Morning did not answer the token request within ${TOKEN_REQUEST_TIMEOUT_MS}ms.`,
      );
    }
    throw new MorningError('network-error', 'Could not reach Morning to request a token.');
  }

  const payload = await readJsonSafely(response);

  if (!response.ok) throw tokenError(response.status, payload);

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
 * Map a token failure onto a typed error.
 *
 * Only Morning's own error text is surfaced. The request body carried the
 * client secret and is never echoed.
 */
function tokenError(status: number, payload: unknown): MorningError {
  const detail = describeError(payload);

  if (status === 400 || status === 401) {
    return new MorningError(
      'unauthorized',
      detail === null
        ? 'Morning rejected the API key pair.'
        : `Morning rejected the API key pair (${detail}).`,
      status,
    );
  }

  // A 403 here is deliberately not attributed to the plan. Morning does gate
  // API access behind the Best plan, but a proxy or network policy standing
  // between this server and the host answers 403 too — and at this point
  // nothing has reached Morning yet to tell the two apart. Once a token has
  // been minted the host is provably reachable, so `client.ts` can and does
  // read a later 403 as the plan.
  if (status === 403) {
    return new MorningError(
      'forbidden',
      detail === null
        ? 'The token request was refused (403).'
        : `The token request was refused (${detail}).`,
      status,
    );
  }

  if (status === 429) {
    return new MorningError('throttled', 'Morning rate limited the token request.', status);
  }

  if (status >= 500) {
    return new MorningError('server-error', `Morning returned ${status} for the token request.`, status);
  }

  return new MorningError(
    'api-error',
    detail === null ? `The token request failed with status ${status}.` : `The token request failed (${detail}).`,
    status,
  );
}

/** Morning reports failures as `{ errorMessage }` or `{ errorCode, description }`. */
function describeError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  for (const key of ['errorMessage', 'description', 'message', 'error']) {
    const value = readField(payload, key);
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return null;
}

function parseTokenResponse(payload: unknown): CachedToken {
  if (!isRecord(payload)) {
    throw new MorningError('invalid-response', 'The token response was not a JSON object.');
  }

  const token = readField(payload, 'token');

  if (typeof token !== 'string' || token.length === 0) {
    throw new MorningError('invalid-response', 'The token response contained no token.');
  }

  return { token, expiresAt: resolveExpiry(readField(payload, 'expires')) };
}

/**
 * Morning states the expiry as an epoch timestamp. Its unit is not documented,
 * so both seconds and milliseconds are accepted and anything else falls back to
 * the short lifetime rather than being trusted.
 */
function resolveExpiry(expires: unknown): number {
  const now = Date.now();

  if (typeof expires === 'number' && Number.isFinite(expires) && expires > 0) {
    const milliseconds = expires > MILLISECOND_THRESHOLD ? expires : expires * 1000;
    if (milliseconds > now) return milliseconds;
  }

  return now + FALLBACK_LIFETIME_SECONDS * 1000;
}
