'use server';

import { testMorningConnection } from '@/integrations/morning/connection';
import { hasValidSession } from '@/lib/auth/current-session';
import { isMorningConfigured } from '@/lib/config/env';
import type { MorningConnectionView } from '@/components/settings/morning-status';

/**
 * Server action behind the "Test connection" button for Morning.
 *
 * The check runs entirely on the server: the API key pair and the token it
 * mints never leave it. The result is mapped explicitly onto
 * `MorningConnectionView`, so a field added to the integration later cannot
 * leak to the browser by being passed through unnoticed.
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

export async function checkMorningConnection(): Promise<MorningConnectionView> {
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

  if (!isMorningConfigured()) {
    return {
      status: 'not-connected',
      message: 'Morning credentials are not set on this deployment.',
      guidance: 'Add MORNING_CLIENT_ID and MORNING_CLIENT_SECRET in Vercel, then redeploy.',
      checkedAt,
    };
  }

  const result = await testMorningConnection();

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
    businessName: result.account.businessName,
    environment: result.account.environment,
    host: result.account.host,
    checkedAt,
  };
}
