import 'server-only';

import { getMorningConfig, type MorningConfig } from '@/integrations/morning/config';
import { MorningError, MorningResponseError } from '@/integrations/morning/errors';
import { getMorningToken, invalidateMorningToken } from '@/integrations/morning/token';
import { isRecord, readField } from '@/integrations/shopify/json';

/**
 * Server-side Morning (Green Invoice) API client.
 *
 * Read-only by design: there is no POST, PUT or DELETE here, so no code path in
 * ICEBOX OS can create, alter or cancel a document in the owner's accounting
 * system. `server-only` makes importing this from a client component a build
 * error, and the token travels in the `Authorization` header rather than the
 * URL, because URLs end up in server logs, proxies and error reports.
 */

const REQUEST_TIMEOUT_MS = 20_000;

export type MorningRequest = {
  /** Path after the version segment, e.g. `users/me`. */
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

async function executeOnce(config: MorningConfig, path: string): Promise<unknown> {
  const token = await getMorningToken(config);
  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}/${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
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
