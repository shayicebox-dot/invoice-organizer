import 'server-only';

import { getMetaConfig, type MetaConfig } from '@/integrations/meta/config';
import { MetaError, MetaResponseError } from '@/integrations/meta/errors';
import { isRecord, readField, requireRecord } from '@/integrations/shopify/json';

/**
 * Server-side Meta Graph API client.
 *
 * `server-only` makes importing this from a client component a build error, so
 * the access token can never reach the browser. The token travels in the
 * `Authorization` header rather than a query parameter: URLs end up in server
 * logs, proxies and error reports, and a credential should not.
 */

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export type MetaRequest = {
  /** Path after the version, e.g. `act_123/insights`. */
  readonly path: string;
  readonly params?: Readonly<Record<string, string>>;
  readonly config?: MetaConfig;
};

/**
 * Execute one Graph API GET and return the parsed body as `unknown`.
 *
 * Callers narrow the result themselves. Retries throttling and transient
 * server errors; everything else fails fast with a typed `MetaError`.
 */
export async function metaGet(request: MetaRequest): Promise<unknown> {
  const config = request.config ?? getMetaConfig();
  let lastError: MetaError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await executeOnce(config, request);
    } catch (error) {
      const metaError = error instanceof MetaError ? error : new MetaError('network-error', 'Meta request failed.');
      lastError = metaError;

      const retryable =
        metaError.reason === 'throttled' ||
        metaError.reason === 'server-error' ||
        metaError.reason === 'network-error';

      if (!retryable || attempt === MAX_ATTEMPTS) throw metaError;

      await delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new MetaError('network-error', 'Meta request failed.');
}

async function executeOnce(config: MetaConfig, request: MetaRequest): Promise<unknown> {
  const url = new URL(`${config.baseUrl}/${request.path}`);

  for (const [key, value] of Object.entries(request.params ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.accessToken}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new MetaError('timeout', `Meta did not respond within ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new MetaError('network-error', 'Could not reach Meta.');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new MetaResponseError('Meta returned a body that is not valid JSON.');
  }

  if (!response.ok) {
    throw graphError(response.status, payload);
  }

  return payload;
}

/**
 * Map a Graph API error onto a typed error.
 *
 * Meta reports the real cause in `error.message` and `error.code`; the HTTP
 * status alone is often just 400. Only Meta's own message text is carried
 * through — never the request URL, which would expose the token.
 */
function graphError(status: number, payload: unknown): MetaError {
  const envelope = isRecord(payload) ? payload : null;
  const error = envelope === null ? null : readField(envelope, 'error');
  const details = isRecord(error) ? error : null;

  const message = details === null ? null : readField(details, 'message');
  const code = details === null ? null : readField(details, 'code');
  const summary = typeof message === 'string' && message.length > 0 ? message : `Meta returned ${status}.`;

  if (typeof summary === 'string' && /unsupported.*version|version.*no longer/i.test(summary)) {
    return new MetaError('unsupported-version', summary, status);
  }

  // 190 covers expired, revoked and invalid tokens.
  if (code === 190 || status === 401) {
    return new MetaError('unauthorized', summary, status);
  }

  // 200/10 are permission errors: the token cannot see this object.
  if (code === 200 || code === 10 || status === 403) {
    return new MetaError('forbidden', summary, status);
  }

  // 4, 17 and 613 are the rate-limit family.
  if (code === 4 || code === 17 || code === 613 || status === 429) {
    return new MetaError('throttled', summary, status);
  }

  if (status === 404) return new MetaError('not-found', summary, status);
  if (status >= 500) return new MetaError('server-error', summary, status);

  return new MetaError('api-error', summary, status);
}

/** Narrow a Graph response to its object body. */
export function requireGraphObject(payload: unknown, path: string): Record<string, unknown> {
  return requireRecord(payload, path);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
