import 'server-only';

import { metaGet, requireGraphObject } from '@/integrations/meta/client';
import {
  getMetaConfig,
  MetaConfigError,
  REQUIRED_META_PERMISSION,
} from '@/integrations/meta/config';
import {
  META_FAILURE_GUIDANCE,
  MetaError,
  type MetaFailureReason,
} from '@/integrations/meta/errors';
import { optionalString, readField, requireString } from '@/integrations/shopify/json';
import { isMetaConfigured } from '@/lib/config/env';
import { BUSINESS_CONFIG } from '@/lib/config/business';

/**
 * Connectivity check for the Meta Ads integration.
 *
 * Answers what a person actually needs to know when wiring up an ad account:
 * can we reach it, is the token accepted, is it the right account, and is its
 * currency the one this system reports in. It reads no spend and writes
 * nothing — and never returns the token.
 */

/** Account status codes Meta documents. 1 is the only fully active one. */
const ACCOUNT_STATUS_LABELS: Readonly<Record<number, string>> = {
  1: 'Active',
  2: 'Disabled',
  3: 'Unsettled',
  7: 'Pending risk review',
  8: 'Pending settlement',
  9: 'In grace period',
  100: 'Pending closure',
  101: 'Closed',
  201: 'Any active',
  202: 'Any closed',
};

export type MetaAccountIdentity = {
  readonly name: string;
  /** Numeric id as shown in Ads Manager. */
  readonly accountId: string;
  readonly currency: string;
  readonly timeZone: string | null;
  readonly status: string;
  readonly isActive: boolean;
  /**
   * Whether the ad account reports in the same currency ICEBOX reports in.
   * When it does not, spend cannot be combined with Shopify revenue.
   */
  readonly currencyMatchesReporting: boolean;
  readonly reportingCurrency: string;
};

export type MetaConnectionResult =
  | {
      readonly ok: true;
      readonly apiVersion: string;
      readonly account: MetaAccountIdentity;
    }
  | {
      readonly ok: false;
      readonly reason: MetaFailureReason;
      readonly message: string;
      readonly guidance: string;
    };

export async function testMetaConnection(): Promise<MetaConnectionResult> {
  if (!isMetaConfigured()) {
    return failure('not-configured', 'Meta Ads environment variables are not set.');
  }

  try {
    const config = getMetaConfig();

    const payload = await metaGet({
      path: config.adAccountId,
      params: {
        fields: 'id,account_id,name,currency,timezone_name,account_status',
      },
      config,
    });

    return {
      ok: true,
      apiVersion: config.apiVersion,
      account: parseAccount(payload),
    };
  } catch (error) {
    if (error instanceof MetaConfigError) {
      return failure('invalid-configuration', error.message);
    }
    if (error instanceof MetaError) {
      return failure(error.reason, error.message);
    }
    return failure('network-error', 'Meta connection test failed.');
  }
}

function parseAccount(payload: unknown): MetaAccountIdentity {
  const account = requireGraphObject(payload, 'account');
  const reportingCurrency = BUSINESS_CONFIG.reportingCurrency;
  const currency = requireString(readField(account, 'currency'), 'account.currency');
  const statusCode = readField(account, 'account_status');
  const status =
    typeof statusCode === 'number'
      ? (ACCOUNT_STATUS_LABELS[statusCode] ?? `Status ${statusCode}`)
      : 'Unknown';

  return {
    name: requireString(readField(account, 'name'), 'account.name'),
    accountId: requireString(readField(account, 'account_id'), 'account.account_id'),
    currency,
    timeZone: optionalString(readField(account, 'timezone_name'), 'account.timezone_name'),
    status,
    isActive: statusCode === 1,
    currencyMatchesReporting: currency === reportingCurrency,
    reportingCurrency,
  };
}

function failure(reason: MetaFailureReason, message: string): MetaConnectionResult {
  return { ok: false, reason, message, guidance: META_FAILURE_GUIDANCE[reason] };
}

/** The permission the token must carry, for display in Settings. */
export const META_REQUIRED_PERMISSION = REQUIRED_META_PERMISSION;
