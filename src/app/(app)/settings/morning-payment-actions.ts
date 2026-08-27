'use server';

import { getMorningPaymentDiagnostics } from '@/data/morning-payments-source';
import { hasValidSession } from '@/lib/auth/current-session';
import { resolveRequestedPeriod } from '@/core/period';
import { todayInBusinessTimeZone } from '@/lib/utils/today';
import type { MorningPaymentsView } from '@/components/settings/morning-payments-status';

/**
 * Server action behind the Morning payment diagnostics.
 *
 * Run on demand rather than on every Settings load: it is an inspection tool,
 * and a page render should not spend the account's API budget sweeping pages of
 * payments nobody asked to see.
 *
 * The dates arrive from the browser and are re-resolved here through the same
 * `resolveRequestedPeriod` every screen uses, so a hand-edited value cannot
 * widen the search beyond what the picker allows.
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

export async function readMorningPayments(request: {
  readonly from: string;
  readonly to: string;
}): Promise<MorningPaymentsView> {
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();

  // The proxy already blocks unauthenticated requests; checking again keeps
  // this action safe on its own merits.
  if (!(await hasValidSession())) {
    return {
      status: 'error',
      message: 'Your session has expired.',
      guidance: 'Sign in again to run the diagnostic.',
      httpStatus: null,
      checkedAt,
    };
  }

  if (isRateLimited(now)) {
    return {
      status: 'error',
      message: 'Too many diagnostic reads in the last minute.',
      guidance: 'Wait a moment and try again.',
      httpStatus: null,
      checkedAt,
    };
  }

  const { range } = resolveRequestedPeriod(
    { from: request.from, to: request.to },
    todayInBusinessTimeZone(),
  );

  return await getMorningPaymentDiagnostics(range, checkedAt);
}
