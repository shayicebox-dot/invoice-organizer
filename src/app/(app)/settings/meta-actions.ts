'use server';

import { testMetaConnection } from '@/integrations/meta/connection';
import { hasValidSession } from '@/lib/auth/current-session';
import { isMetaConfigured } from '@/lib/config/env';
import type { MetaConnectionView } from '@/components/settings/meta-status';

/**
 * Server action behind the "Test connection" button for Meta Ads.
 *
 * The check runs entirely on the server: the ad account id and access token
 * never leave it. The result is mapped explicitly onto `MetaConnectionView`, so
 * a field added to the integration later cannot leak to the browser by being
 * passed through unnoticed.
 */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;

/** Per server instance; a courtesy limit on API budget, not access control. */
const recentAttempts: number[] = [];

function isRateLimited(now: number): boolean {
  while (recentAttempts.length > 0 && now - (recentAttempts[0] ?? 0) > RATE_LIMIT_WINDOW_MS) {
    recentAttempts.shift();
  }

  if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) return true;

  recentAttempts.push(now);
  return false;
}

export async function checkMetaConnection(): Promise<MetaConnectionView> {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();

  // The proxy already blocks unauthenticated requests; checking again keeps
  // this action safe on its own merits.
  if (!(await hasValidSession())) {
    return {
      status: 'error',
      message: 'Your session has expired.',
      guidance: 'Sign in again to run the connection test.',
      checkedAt,
    };
  }

  if (isRateLimited(now)) {
    return {
      status: 'error',
      message: 'Too many connection tests in the last minute.',
      guidance: 'Wait a moment and try again.',
      checkedAt,
    };
  }

  if (!isMetaConfigured()) {
    return {
      status: 'not-connected',
      message: 'Meta Ads credentials are not set on this deployment.',
      guidance: 'Add META_AD_ACCOUNT_ID and META_ACCESS_TOKEN in Vercel, then redeploy.',
      checkedAt,
    };
  }

  const result = await testMetaConnection();

  if (!result.ok) {
    return {
      status: result.reason === 'not-configured' ? 'not-connected' : 'error',
      message: result.message,
      guidance: result.guidance,
      checkedAt,
    };
  }

  return {
    status: 'connected',
    accountName: result.account.name,
    accountId: result.account.accountId,
    currency: result.account.currency,
    timeZone: result.account.timeZone,
    accountStatus: result.account.status,
    isActive: result.account.isActive,
    currencyMatchesReporting: result.account.currencyMatchesReporting,
    reportingCurrency: result.account.reportingCurrency,
    apiVersion: result.apiVersion,
    checkedAt,
  };
}
