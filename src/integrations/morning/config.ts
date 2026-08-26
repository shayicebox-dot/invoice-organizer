import 'server-only';

import { morningEnv } from '@/lib/config/env';

/**
 * Morning (Green Invoice) connection configuration, resolved from the
 * environment.
 *
 * Authentication is an API key pair created in the Morning dashboard under
 * אזור אישי → כלים למפתחים → מפתחות API. The pair is exchanged server-side for
 * a short-lived JWT; there is no browser step and no long-lived token to store.
 *
 * The product was rebranded from "חשבונית ירוקה" to "Morning", but the API host
 * did not move: there is no api.morning.co.il. Both hosts below are fixed
 * constants, so no configured value ever chooses where credentials are sent —
 * the same rule `normaliseShopDomain` enforces for Shopify.
 */

const HOSTS = {
  production: 'https://api.greeninvoice.co.il/api/v1',
  sandbox: 'https://sandbox.d.greeninvoice.co.il/api/v1',
} as const;

export type MorningEnvironment = keyof typeof HOSTS;

/** The read-only endpoint the connection test calls. Returns the signed-in account. */
export const IDENTITY_PATH = 'users/me';

/** Where the API keys come from, quoted in guidance so the owner can find it. */
export const CREDENTIALS_LOCATION = 'אזור אישי → כלים למפתחים → מפתחות API';

export type MorningConfig = {
  readonly environment: MorningEnvironment;
  /** Base URL including the version segment. */
  readonly baseUrl: string;
  /** Host only, safe to display — it identifies the environment, not the account. */
  readonly host: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

export class MorningConfigError extends Error {
  override readonly name = 'MorningConfigError';
}

function validateEnvironment(value: string | undefined): MorningEnvironment {
  if (value === undefined || value.length === 0) return 'production';

  const normalised = value.trim().toLowerCase();

  if (normalised === 'production' || normalised === 'sandbox') return normalised;

  throw new MorningConfigError(
    `MORNING_ENVIRONMENT must be "production" or "sandbox", received "${value}".`,
  );
}

/**
 * Credentials are opaque strings, so there is no format to check — only that
 * something usable is present. Surrounding whitespace is stripped because a
 * value pasted into a dashboard field commonly carries a trailing newline, and
 * that alone would produce an unexplained 401.
 */
function validateCredential(value: string, name: string): string {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new MorningConfigError(`${name} is empty.`);
  }

  if (/\s/.test(trimmed)) {
    throw new MorningConfigError(`${name} contains whitespace, so it was probably copied wrongly.`);
  }

  return trimmed;
}

/** Resolve and validate the configuration. Throws `MorningConfigError` if unusable. */
export function getMorningConfig(): MorningConfig {
  const env = morningEnv();
  const environment = validateEnvironment(env.environment);

  return {
    environment,
    baseUrl: HOSTS[environment],
    host: new URL(HOSTS[environment]).host,
    clientId: validateCredential(env.clientId, 'MORNING_CLIENT_ID'),
    clientSecret: validateCredential(env.clientSecret, 'MORNING_CLIENT_SECRET'),
  };
}
