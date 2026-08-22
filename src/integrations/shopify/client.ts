import 'server-only';

import { getShopifyConfig, type ShopifyConfig } from '@/integrations/shopify/config';
import { ShopifyError, ShopifyResponseError } from '@/integrations/shopify/errors';
import { isRecord, readField, requireRecord } from '@/integrations/shopify/json';
import { getAccessToken, invalidateAccessToken } from '@/integrations/shopify/token';

/**
 * Server-side Shopify Admin GraphQL client.
 *
 * Authentication is the client credentials grant: `token.ts` mints and caches a
 * 24-hour access token, and this module attaches it. `server-only` makes
 * importing this from a client component a build error, so neither the token
 * nor the client secret can reach the browser. The token appears in exactly one
 * place — the `X-Shopify-Access-Token` header — and is never logged, returned,
 * or embedded in an error message.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

/** Remaining query cost budget, useful for pacing a larger sync later. */
export type ThrottleStatus = {
  readonly maximumAvailable: number;
  readonly currentlyAvailable: number;
  readonly restoreRate: number;
};

export type ShopifyGraphQLResponse = {
  readonly data: unknown;
  readonly throttle: ThrottleStatus | null;
};

type GraphQLRequest = {
  readonly query: string;
  readonly variables?: Record<string, unknown>;
  /** Overrides the resolved configuration; used by tests and diagnostics. */
  readonly config?: ShopifyConfig;
  readonly signal?: AbortSignal;
};

/**
 * Execute one GraphQL operation and return its `data` as `unknown`.
 *
 * Callers narrow the result themselves — this layer deliberately does not know
 * the shape of any query. Retries throttling and transient server errors;
 * everything else fails fast with a typed `ShopifyError`.
 */
export async function shopifyGraphQL(request: GraphQLRequest): Promise<ShopifyGraphQLResponse> {
  const config = request.config ?? getShopifyConfig();
  let lastError: ShopifyError | null = null;
  /** A cached token rejected before its stated expiry is worth exactly one retry. */
  let tokenRefreshed = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const accessToken = await getAccessToken(config, { forceRefresh: tokenRefreshed });
      return await executeOnce(config, request, accessToken);
    } catch (error) {
      const shopifyError = toShopifyError(error);
      lastError = shopifyError;

      // Shopify rejected a token we believed was valid — it may have been
      // revoked, or the app reinstalled. Drop it and try once with a new one.
      if (shopifyError.reason === 'unauthorized' && !tokenRefreshed) {
        invalidateAccessToken(config);
        tokenRefreshed = true;
        continue;
      }

      const retryable =
        shopifyError.reason === 'throttled' ||
        shopifyError.reason === 'server-error' ||
        shopifyError.reason === 'network-error';

      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw shopifyError;
      }

      await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new ShopifyError('network-error', 'Shopify request failed.');
}

async function executeOnce(
  config: ShopifyConfig,
  request: GraphQLRequest,
  accessToken: string,
): Promise<ShopifyGraphQLResponse> {
  const body = JSON.stringify({
    query: request.query,
    ...(request.variables === undefined ? {} : { variables: request.variables }),
  });

  let response: Response;

  try {
    response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body,
      cache: 'no-store',
      signal: request.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ShopifyError('timeout', `Shopify did not respond within ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new ShopifyError('network-error', 'Could not reach Shopify.');
  }

  if (!response.ok) {
    throw httpError(response.status);
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new ShopifyResponseError('Shopify returned a body that is not valid JSON.');
  }

  const envelope = requireRecord(payload, 'response');
  const throttle = readThrottleStatus(readField(envelope, 'extensions'));
  const errors = readField(envelope, 'errors');

  if (errors !== undefined && errors !== null) {
    throw graphQLError(errors);
  }

  const data = readField(envelope, 'data');

  if (data === undefined || data === null) {
    throw new ShopifyResponseError('Shopify returned no data for this query.');
  }

  return { data, throttle };
}

function httpError(status: number): ShopifyError {
  if (status === 401) {
    return new ShopifyError(
      'unauthorized',
      'Shopify rejected the access token. It is refreshed automatically, so a repeat failure points at the app credentials or its install on this store.',
      status,
    );
  }
  if (status === 402) {
    return new ShopifyError(
      'forbidden',
      'Received 402: the store\'s Shopify plan appears to be inactive or frozen.',
      status,
    );
  }
  if (status === 403) {
    // A bare 403 with no Shopify error body is ambiguous: it is usually a
    // missing Admin API scope, but a proxy or network policy between this
    // server and Shopify produces the same status. Say both, rather than
    // sending someone to re-check scopes that were never the problem.
    return new ShopifyError(
      'forbidden',
      'Received 403. This is usually a missing Admin API scope, but it can also be a network policy blocking access to Shopify.',
      status,
    );
  }
  if (status === 404) {
    return new ShopifyError(
      'not-found',
      'Shopify returned 404. Check the store domain and API version.',
      status,
    );
  }
  if (status === 429) {
    return new ShopifyError('throttled', 'Shopify rate limited the request.', status);
  }
  if (status >= 500) {
    return new ShopifyError('server-error', `Shopify returned ${status}.`, status);
  }
  return new ShopifyError('graphql-error', `Shopify returned ${status}.`, status);
}

/**
 * Turn a GraphQL `errors` array into a typed error.
 *
 * Only Shopify's own message text is carried through — never the request or
 * any part of the response body.
 */
function graphQLError(errors: unknown): ShopifyError {
  const messages: string[] = [];
  let throttled = false;
  let accessDenied = false;

  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (!isRecord(entry)) continue;

      const message = readField(entry, 'message');
      if (typeof message === 'string') messages.push(message);

      const extensions = readField(entry, 'extensions');
      if (isRecord(extensions)) {
        const code = readField(extensions, 'code');
        if (code === 'THROTTLED') throttled = true;
        if (code === 'ACCESS_DENIED') accessDenied = true;
      }
    }
  }

  const summary = messages.length > 0 ? messages.join('; ') : 'Shopify returned a GraphQL error.';

  if (throttled) return new ShopifyError('throttled', summary);
  if (accessDenied) return new ShopifyError('forbidden', summary);
  return new ShopifyError('graphql-error', summary);
}

function readThrottleStatus(extensions: unknown): ThrottleStatus | null {
  if (!isRecord(extensions)) return null;

  const cost = readField(extensions, 'cost');
  if (!isRecord(cost)) return null;

  const status = readField(cost, 'throttleStatus');
  if (!isRecord(status)) return null;

  const maximumAvailable = readField(status, 'maximumAvailable');
  const currentlyAvailable = readField(status, 'currentlyAvailable');
  const restoreRate = readField(status, 'restoreRate');

  if (
    typeof maximumAvailable !== 'number' ||
    typeof currentlyAvailable !== 'number' ||
    typeof restoreRate !== 'number'
  ) {
    return null;
  }

  return { maximumAvailable, currentlyAvailable, restoreRate };
}

function toShopifyError(error: unknown): ShopifyError {
  if (error instanceof ShopifyError) return error;
  return new ShopifyError('network-error', 'Shopify request failed.');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
