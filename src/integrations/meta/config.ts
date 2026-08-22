import 'server-only';

import { metaEnv } from '@/lib/config/env';

/**
 * Meta Ads connection configuration, resolved from the environment.
 *
 * Authentication is a long-lived system user token from Meta Business Manager.
 * There is no OAuth redirect to implement and no browser step: the token is
 * created once in Meta's own UI and pasted into the deployment's environment.
 */

/**
 * Graph API version to call.
 *
 * Meta supports each version for about two years and releases new ones
 * regularly. Pinning is deliberate — an unversioned call would silently drift.
 * Override with `META_API_VERSION`; the connection test names this variable if
 * Meta reports the pinned version is no longer served.
 */
export const DEFAULT_META_API_VERSION = 'v23.0';

/** Permission the access token needs to read spend and performance. */
export const REQUIRED_META_PERMISSION = 'ads_read';

/** Meta's Graph API host. Fixed, so no configured value ever chooses the host. */
const GRAPH_HOST = 'https://graph.facebook.com';

const ACCOUNT_ID_PATTERN = /^\d{5,20}$/;
const API_VERSION_PATTERN = /^v\d{1,3}\.\d{1,3}$/;

export type MetaConfig = {
  /** Canonical `act_<digits>` account identifier used by the Graph API. */
  readonly adAccountId: string;
  /** The bare numeric id, as shown in Ads Manager. */
  readonly adAccountNumber: string;
  readonly apiVersion: string;
  /** Base URL for Graph API calls, version included. */
  readonly baseUrl: string;
  readonly accessToken: string;
};

export class MetaConfigError extends Error {
  override readonly name = 'MetaConfigError';
}

/**
 * Normalise whatever was pasted into `META_AD_ACCOUNT_ID`.
 *
 * Ads Manager shows the id both bare and with an `act_` prefix, and people copy
 * either. Both are accepted; anything else is rejected rather than sent to Meta
 * as a malformed path.
 */
export function normaliseAdAccountId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const bare = trimmed.startsWith('act_') ? trimmed.slice(4) : trimmed;

  if (!ACCOUNT_ID_PATTERN.test(bare)) {
    throw new MetaConfigError(
      'META_AD_ACCOUNT_ID must be the numeric ad account id from Ads Manager, for example "213807172876665" or "act_213807172876665".',
    );
  }

  return bare;
}

function validateApiVersion(value: string): string {
  if (!API_VERSION_PATTERN.test(value)) {
    throw new MetaConfigError(`META_API_VERSION must look like "v23.0", received "${value}".`);
  }
  return value;
}

function validateAccessToken(value: string): string {
  const token = value.trim();

  if (token.length === 0 || /\s/.test(token)) {
    throw new MetaConfigError('META_ACCESS_TOKEN is empty or contains whitespace.');
  }

  return token;
}

/** Resolve and validate the configuration. Throws `MetaConfigError` if unusable. */
export function getMetaConfig(): MetaConfig {
  const env = metaEnv();
  const adAccountNumber = normaliseAdAccountId(env.adAccountId);
  const apiVersion = validateApiVersion(env.apiVersion ?? DEFAULT_META_API_VERSION);

  return {
    adAccountId: `act_${adAccountNumber}`,
    adAccountNumber,
    apiVersion,
    baseUrl: `${GRAPH_HOST}/${apiVersion}`,
    accessToken: validateAccessToken(env.accessToken),
  };
}
