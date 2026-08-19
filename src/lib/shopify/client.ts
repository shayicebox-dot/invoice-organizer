/**
 * Server-side Shopify Admin API client.
 *
 * `server-only` makes importing this from a client component a build error, so
 * the access token and client secret cannot reach the browser even by mistake.
 *
 * Tokens are obtained with the client credentials grant and held in module
 * memory. They are refreshed before expiry, refreshed again if Shopify rejects
 * one mid-flight, and never persisted to disk or returned to a caller.
 */

import "server-only";

import { type ShopifyConfig, getShopifyConfig } from "./config";

const TOKEN_PATH = "/admin/oauth/access_token";
/** Refresh this long before the stated expiry, to cover clock skew and latency. */
const REFRESH_MARGIN_MS = 120_000;
/** Used when Shopify omits `expires_in`. */
const FALLBACK_TTL_MS = 3_600_000;
const REQUEST_TIMEOUT_MS = 15_000;

/** Raised for anything the caller may want to surface as "not connected". */
export class ShopifyError extends Error {
  readonly status?: number;
  readonly kind: "auth" | "request" | "graphql" | "config";

  constructor(
    message: string,
    kind: ShopifyError["kind"],
    status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ShopifyError";
    this.kind = kind;
    this.status = status;
  }
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** Keyed by store domain so a changed domain cannot reuse another shop's token. */
const tokenCache = new Map<string, CachedToken>();
/** De-duplicates concurrent refreshes; several renders share one token request. */
const inFlight = new Map<string, Promise<CachedToken>>();

function isFresh(token: CachedToken): boolean {
  return token.expiresAt - REFRESH_MARGIN_MS > Date.now();
}

/**
 * Exchange client credentials for an access token.
 *
 * Failures deliberately carry only the HTTP status. Shopify echoes request
 * parameters in some error bodies, so the body is not propagated — that is how
 * a client secret ends up in a log.
 */
async function requestAccessToken(config: ShopifyConfig): Promise<CachedToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
  });

  let response: Response;
  try {
    response = await fetch(`https://${config.storeDomain}${TOKEN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    // The cause is kept for server-side debugging. Credentials travel in the
    // request body, never the URL, so a fetch error carries no secret.
    throw new ShopifyError(
      `Could not reach ${config.storeDomain} to request an access token.`,
      "request",
      undefined,
      { cause },
    );
  }

  if (!response.ok) {
    throw new ShopifyError(
      `Shopify rejected the client credentials grant (HTTP ${response.status}). ` +
        `Check the client id and secret, and that the app is installed on ${config.storeDomain}.`,
      "auth",
      response.status,
    );
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new ShopifyError("Shopify returned no access token.", "auth", response.status);
  }

  const ttlMs =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in * 1000
      : FALLBACK_TTL_MS;

  return { accessToken: payload.access_token, expiresAt: Date.now() + ttlMs };
}

async function getToken(config: ShopifyConfig, forceRefresh = false): Promise<CachedToken> {
  const key = config.storeDomain;

  if (!forceRefresh) {
    const cached = tokenCache.get(key);
    if (cached && isFresh(cached)) return cached;
  }

  const existing = inFlight.get(key);
  if (existing && !forceRefresh) return existing;

  const pending = requestAccessToken(config)
    .then((token) => {
      tokenCache.set(key, token);
      return token;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, pending);
  return pending;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/**
 * Run one Admin GraphQL operation. Retries once with a fresh token if Shopify
 * rejects the current one, which covers a token revoked or expired early.
 */
export async function shopifyGraphQL<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const config = getShopifyConfig();
  if (!config) {
    throw new ShopifyError("Shopify is not configured.", "config");
  }

  const endpoint = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;

  const send = async (token: string): Promise<Response> => {
    try {
      return await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      throw new ShopifyError(`Could not reach the Shopify Admin API.`, "request", undefined, {
        cause,
      });
    }
  };

  let token = (await getToken(config)).accessToken;
  let response = await send(token);

  if (response.status === 401 || response.status === 403) {
    token = (await getToken(config, true)).accessToken;
    response = await send(token);
  }

  if (response.status === 401 || response.status === 403) {
    throw new ShopifyError(
      `Shopify refused the access token (HTTP ${response.status}). ` +
        `The app may be missing the read_orders scope.`,
      "auth",
      response.status,
    );
  }

  if (!response.ok) {
    throw new ShopifyError(
      `Shopify Admin API returned HTTP ${response.status}.`,
      "request",
      response.status,
    );
  }

  const payload = (await response.json()) as GraphQLResponse<T>;

  if (payload.errors?.length) {
    throw new ShopifyError(
      `Shopify GraphQL error: ${payload.errors.map((error) => error.message).join("; ")}`,
      "graphql",
    );
  }

  if (!payload.data) {
    throw new ShopifyError("Shopify returned an empty GraphQL response.", "graphql");
  }

  return payload.data;
}

/** Test hook — drops cached tokens so the next call re-authenticates. */
export function clearShopifyTokenCache(): void {
  tokenCache.clear();
  inFlight.clear();
}
