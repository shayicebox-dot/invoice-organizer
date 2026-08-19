/**
 * Server-side Meta Marketing API client.
 *
 * `server-only` makes importing this from a client component a build error, so
 * the access token cannot reach the browser.
 *
 * The token is sent as an `Authorization: Bearer` header rather than the
 * `access_token` query parameter the Graph API also accepts. A token in a query
 * string ends up in proxy logs, server access logs and browser history; a
 * header does not.
 */

import "server-only";

import { type MetaConfig, getMetaConfig } from "./config";

const GRAPH_HOST = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 15_000;

export class MetaError extends Error {
  readonly status?: number;
  readonly kind: "auth" | "request" | "api" | "config" | "currency";
  /** Meta's numeric error code, useful for diagnosing without the body. */
  readonly code?: number;

  constructor(
    message: string,
    kind: MetaError["kind"],
    status?: number,
    code?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "MetaError";
    this.kind = kind;
    this.status = status;
    this.code = code;
  }
}

interface MetaErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Turn a Graph API error into something safe to show.
 *
 * Meta's `error.message` describes the failure without echoing the token, so
 * it is surfaced. The few codes that have an obvious fix get a clearer
 * message than Meta's own wording.
 */
function describeApiError(body: MetaErrorBody, status: number): MetaError {
  const error = body.error ?? {};
  const code = error.code;
  const base = error.message ?? `Meta API returned HTTP ${status}.`;

  if (code === 190) {
    return new MetaError(
      "The Meta access token is invalid or has expired. Generate a new one and update META_ACCESS_TOKEN.",
      "auth",
      status,
      code,
    );
  }

  if (code === 100 && /unsupported.*version|version.*unsupported/i.test(base)) {
    return new MetaError(
      `${base} Set META_API_VERSION to a version your app supports.`,
      "api",
      status,
      code,
    );
  }

  if (code === 4 || code === 17 || code === 613) {
    return new MetaError(
      "Meta rate limit reached for this ad account. Showing mock ad spend until it clears.",
      "request",
      status,
      code,
    );
  }

  return new MetaError(base, "api", status, code);
}

/**
 * GET a Graph API edge. `params` must not contain the access token — it is
 * attached as a header by this function.
 */
export async function metaGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const config = getMetaConfig();
  if (!config) throw new MetaError("Meta is not configured.", "config");
  return metaGetWith<T>(config, path, params);
}

export async function metaGetWith<T>(
  config: MetaConfig,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${GRAPH_HOST}/${config.apiVersion}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return metaGetUrl<T>(config, url.toString());
}

/**
 * GET an absolute Graph API URL. Used to follow `paging.next`, which Meta
 * returns fully formed.
 *
 * Meta embeds the access token in the `paging.next` URL it hands back. That
 * URL is stripped of its token here and the header is used instead, so a
 * pagination cursor can never carry the credential into a log.
 */
export async function metaGetUrl<T>(config: MetaConfig, rawUrl: string): Promise<T> {
  const url = new URL(rawUrl);
  url.searchParams.delete("access_token");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // The token travels in a header, so the request URL carries no secret and
    // the cause is safe to keep for server-side debugging.
    throw new MetaError("Could not reach the Meta Marketing API.", "request", undefined, undefined, {
      cause,
    });
  }

  if (!response.ok) {
    let body: MetaErrorBody = {};
    try {
      body = (await response.json()) as MetaErrorBody;
    } catch {
      // A non-JSON error body tells us nothing useful; the status carries it.
    }
    throw describeApiError(body, response.status);
  }

  return (await response.json()) as T;
}
