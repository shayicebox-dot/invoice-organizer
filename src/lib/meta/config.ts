/**
 * Meta Marketing API configuration, read from the environment.
 *
 * Same contract as the Shopify config: returns `null` when the integration is
 * not set up, which drives a fallback to mock data rather than an error. No
 * value here is ever logged, serialized or returned to a caller.
 */

/**
 * Pinned Graph API version. Meta retires versions on a rolling schedule, so
 * this is overridable without a code change — see META_API_VERSION.
 */
const DEFAULT_API_VERSION = "v23.0";

export interface MetaConfig {
  accessToken: string;
  /** Numeric account id, without the `act_` prefix. */
  adAccountId: string;
  apiVersion: string;
}

/**
 * Accepts `act_123456789` or `123456789`. The Graph API path needs the
 * prefixed form, but pasting either is a coin flip, so both are absorbed here.
 */
export function normalizeAdAccountId(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.replace(/^act_/i, "");
}

/** The `act_`-prefixed node id used in Graph API paths. */
export function adAccountNode(config: MetaConfig): string {
  return `act_${config.adAccountId}`;
}

function readEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function getMetaConfig(): MetaConfig | null {
  const accessToken = readEnv("META_ACCESS_TOKEN");
  const adAccountId = normalizeAdAccountId(readEnv("META_AD_ACCOUNT_ID"));

  if (!accessToken || !adAccountId) return null;

  return {
    accessToken,
    adAccountId,
    apiVersion: readEnv("META_API_VERSION") || DEFAULT_API_VERSION,
  };
}

/** Names of the missing variables. Names only — never values. */
export function missingMetaEnvNames(): string[] {
  return (["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"] as const).filter(
    (name) => readEnv(name) === "",
  );
}

export function isMetaConfigured(): boolean {
  return getMetaConfig() !== null;
}
