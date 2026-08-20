/**
 * Server-side Google Ads API client.
 *
 * `server-only` makes importing this from a client component a build error, so
 * neither the developer token nor the service account private key can reach the
 * browser.
 *
 * Authentication is a service account JWT exchanged for an OAuth access token
 * against the `adwords` scope. `google-auth-library` caches and refreshes the
 * token internally, so the JWT client is built once and reused.
 *
 * Nothing in this module logs, returns, or embeds a credential. The service
 * account JSON is read from disk, parsed, and handed straight to the JWT
 * signer; its contents are never stringified anywhere else.
 */

import "server-only";

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { JWT } from "google-auth-library";

import { type GoogleAdsConfig, getGoogleAdsConfig } from "./config";

const API_HOST = "https://googleads.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const REQUEST_TIMEOUT_MS = 20_000;
/**
 * Runaway-loop backstop only. Google returns up to 10,000 rows per page, so a
 * year of daily rows fits in one; this binds only if the cursor misbehaves, and
 * the caller is told when it does rather than being handed a short result.
 */
const MAX_PAGES = 50;

export class GoogleAdsError extends Error {
  readonly status?: number;
  readonly kind: "auth" | "request" | "api" | "config" | "currency";
  /** Google Ads error enum, e.g. AUTHORIZATION_ERROR.USER_PERMISSION_DENIED. */
  readonly errorCode?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    kind: GoogleAdsError["kind"],
    options: {
      status?: number;
      errorCode?: string;
      requestId?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GoogleAdsError";
    this.kind = kind;
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.requestId = options.requestId;
  }
}

// --- Authentication --------------------------------------------------------

interface CachedClient {
  key: string;
  jwt: JWT;
}

let cachedClient: CachedClient | null = null;

/**
 * Build (or reuse) the JWT client. Keyed on the identity-defining parts of the
 * config so a changed key file or subject rebuilds rather than reusing a token
 * minted for a different identity.
 */
function getJwtClient(config: GoogleAdsConfig): JWT {
  const key = `${config.keyFile}:${config.impersonate ?? ""}`;
  if (cachedClient && cachedClient.key === key) return cachedClient.jwt;

  // The key file is supplied by the operator at runtime and must never be
  // bundled. Without this opt-out the bundler traces the whole project into
  // the server output, on the assumption the path might be a build artifact.
  const path = isAbsolute(config.keyFile)
    ? config.keyFile
    : resolve(/* turbopackIgnore: true */ process.cwd(), config.keyFile);

  let credentials: { client_email?: string; private_key?: string };
  try {
    credentials = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    // The path is safe to name; the file's contents are not and are not read
    // into the message.
    throw new GoogleAdsError(
      `Could not read the Google Ads service account key at ${config.keyFile}.`,
      "config",
      { cause },
    );
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new GoogleAdsError(
      "The Google Ads service account key is missing client_email or private_key.",
      "config",
    );
  }

  const jwt = new JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [SCOPE],
    // Only needed when the service account is not itself a Google Ads user.
    subject: config.impersonate ?? undefined,
  });

  cachedClient = { key, jwt };
  return jwt;
}

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  try {
    const token = await getJwtClient(config).getAccessToken();
    if (!token?.token) throw new Error("No access token returned.");
    return token.token;
  } catch (cause) {
    if (cause instanceof GoogleAdsError) throw cause;
    const message = cause instanceof Error ? cause.message : String(cause);
    // google-auth-library messages describe the grant failure and never echo
    // the private key.
    throw new GoogleAdsError(
      `Google Ads authentication failed: ${message}`,
      "auth",
      { cause },
    );
  }
}

// --- Queries ---------------------------------------------------------------

interface GoogleAdsErrorBody {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      errors?: Array<{ errorCode?: Record<string, string>; message?: string }>;
      requestId?: string;
    }>;
  };
}

/** Pull the useful, non-sensitive parts out of a Google Ads error payload. */
function describeApiError(body: GoogleAdsErrorBody, status: number): GoogleAdsError {
  const error = body.error ?? {};
  const detail = error.details?.[0];
  const first = detail?.errors?.[0];
  const entry = first?.errorCode ? Object.entries(first.errorCode)[0] : null;
  const errorCode = entry ? `${entry[0]}.${entry[1]}` : undefined;
  const message = first?.message ?? error.message ?? `Google Ads API returned HTTP ${status}.`;

  const kind: GoogleAdsError["kind"] =
    status === 401 || status === 403 || errorCode?.startsWith("authenticationError") || errorCode?.startsWith("authorizationError")
      ? "auth"
      : "api";

  return new GoogleAdsError(message, kind, {
    status,
    errorCode,
    requestId: detail?.requestId,
  });
}

interface SearchResponse<T> {
  results?: T[];
  nextPageToken?: string;
}

/**
 * Run a GAQL query against the configured customer, following `nextPageToken`
 * so a wide date range is never silently truncated.
 */
export async function googleAdsSearch<T>(
  query: string,
): Promise<{ rows: T[]; truncated: boolean }> {
  const config = getGoogleAdsConfig();
  if (!config) throw new GoogleAdsError("Google Ads is not configured.", "config");

  const accessToken = await getAccessToken(config);
  const url = `${API_HOST}/${config.apiVersion}/customers/${config.customerId}/googleAds:search`;

  const results: T[] = [];
  let pageToken: string | undefined;
  let pages = 0;

  do {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": config.developerToken,
          "login-customer-id": config.loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      // Credentials travel in headers, not the URL, so the cause carries no
      // secret and is kept for server-side debugging.
      throw new GoogleAdsError("Could not reach the Google Ads API.", "request", { cause });
    }

    if (!response.ok) {
      let body: GoogleAdsErrorBody = {};
      try {
        body = (await response.json()) as GoogleAdsErrorBody;
      } catch {
        // A non-JSON error body tells us nothing the status does not.
      }
      throw describeApiError(body, response.status);
    }

    const payload = (await response.json()) as SearchResponse<T>;
    results.push(...(payload.results ?? []));
    pageToken = payload.nextPageToken;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);

  // A cursor still outstanding means the backstop bound, not that Google ran
  // out of rows. Saying so is the difference between a short answer and a
  // wrong one.
  return { rows: results, truncated: Boolean(pageToken) };
}

/** Test hook — drops the cached JWT so the next call re-authenticates. */
export function clearGoogleAdsAuthCache(): void {
  cachedClient = null;
}
