import { BUSINESS_CONFIG } from '@/lib/config/business';

/**
 * Today's date in the business timezone, as `YYYY-MM-DD`.
 *
 * Reading the clock is impure, so it lives here rather than in `src/core`:
 * period maths stays a pure function of the date it is given.
 */
export function todayInBusinessTimeZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_CONFIG.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts;
}
