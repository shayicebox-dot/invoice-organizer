/**
 * Google Ads configuration, read from the environment.
 *
 * Same contract as the Shopify and Meta configs: returns `null` when the
 * integration is not set up, which drives a fallback to mock data rather than
 * an error.
 *
 * The developer token and the service account key path are read here and never
 * leave the server. Neither is ever logged, serialized, or included in an error
 * message — see `client.ts`.
 */

/**
 * v25 was released 2026-07-22 and is scheduled to sunset August 2027.
 * v21 sunset in August 2026 and v22 in October 2026, so neither is viable.
 */
const DEFAULT_API_VERSION = "v25";

export interface GoogleAdsConfig {
  developerToken: string;
  /** Manager account id, dashless. Sent as the login-customer-id header. */
  loginCustomerId: string;
  /** The account whose metrics are read, dashless. */
  customerId: string;
  /** Path to the service account JSON, relative to the project root. */
  keyFile: string;
  /** Optional domain-wide delegation subject. */
  impersonate: string | null;
  apiVersion: string;
}

/** Customer ids must be dashless digits in API paths and headers. */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/\D/g, "");
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getGoogleAdsConfig(): GoogleAdsConfig | null {
  const developerToken = readEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const loginCustomerId = normalizeCustomerId(readEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));
  const customerId = normalizeCustomerId(readEnv("GOOGLE_ADS_CUSTOMER_ID"));
  const keyFile = readEnv("GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE");

  if (!developerToken || !loginCustomerId || !customerId || !keyFile) return null;

  return {
    developerToken,
    loginCustomerId,
    customerId,
    keyFile,
    impersonate: readEnv("GOOGLE_ADS_IMPERSONATE_EMAIL") || null,
    apiVersion: readEnv("GOOGLE_ADS_API_VERSION") || DEFAULT_API_VERSION,
  };
}

/** Names of the missing variables. Names only — never values. */
export function missingGoogleAdsEnvNames(): string[] {
  return (
    [
      "GOOGLE_ADS_DEVELOPER_TOKEN",
      "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
      "GOOGLE_ADS_CUSTOMER_ID",
      "GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE",
    ] as const
  ).filter((name) => readEnv(name) === "");
}

export function isGoogleAdsConfigured(): boolean {
  return getGoogleAdsConfig() !== null;
}
