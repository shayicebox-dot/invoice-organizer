import 'server-only';

import { getMorningConfig, type MorningConfig } from '@/integrations/morning/config';
import { MorningError, MorningResponseError } from '@/integrations/morning/errors';
import { getMorningToken, invalidateMorningToken } from '@/integrations/morning/token';
import { isRecord, readField } from '@/integrations/shopify/json';

/**
 * Server-side Morning (Green Invoice) API client.
 *
 * Read-only by design. `server-only` makes importing this from a client
 * component a build error, and the token travels in the `Authorization` header
 * rather than the URL, because URLs end up in server logs, proxies and error
 * reports.
 *
 * Morning expresses some reads as POST — a search takes a filter body. That
 * would otherwise put a method capable of creating documents into this module,
 * so `morningSearch` refuses any path not in `SEARCH_PATHS` below. The
 * invariant that matters survives: there is no reachable code path in ICEBOX OS
 * that can create, alter or cancel a document, because the only POST target
 * this client will accept is a search endpoint. Adding a path here is the
 * deliberate act of widening that, and should be treated as one.
 */

const REQUEST_TIMEOUT_MS = 20_000;

/** The only paths `morningSearch` will POST to. Reads, despite the verb. */
const SEARCH_PATHS: readonly string[] = ['documents/payments/search'];

export type MorningRequest = {
  /** Path after the version segment, e.g. `documents/info?type=320`. */
  readonly path: string;
  readonly config?: MorningConfig;
};

/**
 * Execute one authenticated GET and return the parsed body as `unknown`.
 * Callers narrow the result themselves.
 *
 * A 401 is retried exactly once with a freshly minted token: a cached JWT can
 * be rejected before its stated expiry if the key was regenerated, and that
 * should self-heal rather than need a redeploy. A second 401 is the real answer.
 */
export async function morningGet(request: MorningRequest): Promise<unknown> {
  const config = request.config ?? getMorningConfig();

  try {
    return await executeOnce(config, request.path);
  } catch (error) {
    if (error instanceof MorningError && error.reason === 'unauthorized') {
      invalidateMorningToken(config);
      return await executeOnce(config, request.path);
    }
    throw error;
  }
}

export type MorningSearchRequest = {
  /** Must be one of `SEARCH_PATHS`. Anything else is refused before any call. */
  readonly path: string;
  /** The filter body. Serialised as JSON; never contains a credential. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly config?: MorningConfig;
};

/**
 * Execute one authenticated search POST and return the parsed body.
 *
 * Refuses any path that is not a known search endpoint, so this cannot become
 * a general-purpose write. Retries a stale token once, exactly as `morningGet`
 * does.
 */
export async function morningSearch(request: MorningSearchRequest): Promise<unknown> {
  if (!SEARCH_PATHS.includes(request.path)) {
    throw new MorningError(
      'api-error',
      `Refused to POST to "${request.path}": it is not a known Morning search endpoint.`,
    );
  }

  const config = request.config ?? getMorningConfig();

  try {
    return await executeOnce(config, request.path, request.body);
  } catch (error) {
    if (error instanceof MorningError && error.reason === 'unauthorized') {
      invalidateMorningToken(config);
      return await executeOnce(config, request.path, request.body);
    }
    throw error;
  }
}

async function executeOnce(
  config: MorningConfig,
  path: string,
  searchBody?: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const token = await getMorningToken(config);
  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}/${path}`, {
      method: searchBody === undefined ? 'GET' : 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      ...(searchBody === undefined ? {} : { body: JSON.stringify(searchBody) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new MorningError('timeout', `Morning did not respond within ${REQUEST_TIMEOUT_MS}ms.`);
    }
    throw new MorningError('network-error', 'Could not reach Morning.');
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new MorningResponseError('Morning returned a body that is not valid JSON.');
  }

  if (!response.ok) throw requestError(response.status, payload);

  return payload;
}

/**
 * Map an API failure onto a typed error, carrying only Morning's own message
 * text — never the request URL, which would identify the account.
 */
function requestError(status: number, payload: unknown): MorningError {
  const detail = describeError(payload);
  const summary = detail === null ? `Morning returned ${status}.` : detail;

  if (status === 401) return new MorningError('unauthorized', summary, status);

  // Morning gates API access behind the Best plan. A credential that mints a
  // token but cannot read is the plan far more often than it is permissions,
  // so the guidance says to check the subscription first.
  if (status === 403) return new MorningError('plan-restricted', summary, status);

  if (status === 404) return new MorningError('not-found', summary, status);
  if (status === 429) return new MorningError('throttled', summary, status);
  if (status >= 500) return new MorningError('server-error', summary, status);

  return new MorningError('api-error', summary, status);
}

function describeError(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  for (const key of ['errorMessage', 'description', 'message', 'error']) {
    const value = readField(payload, key);
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return null;
}
