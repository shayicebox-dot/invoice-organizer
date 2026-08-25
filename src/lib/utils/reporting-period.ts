import { resolveRequestedPeriod, type ResolvedPeriod } from '@/core/period';
import { todayInBusinessTimeZone } from '@/lib/utils/today';

/**
 * The reporting period for one request, resolved once and the same way
 * everywhere.
 *
 * Every screen calls this and hands the resulting `range` to every data source
 * it reads. That is what makes the dashboard, Sales, Products and Marketing
 * agree: there is no per-screen date logic to drift, and no separate path for
 * presets versus hand-picked dates — a preset is just a shortcut that produces
 * the same `from`/`to` pair.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/** A repeated query parameter is a malformed request, not a list to guess from. */
function single(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

export type ReportingPeriod = ResolvedPeriod & {
  /** Today in the business timezone, so the client picker uses it too. */
  readonly today: string;
};

export function reportingPeriod(params: SearchParams): ReportingPeriod {
  const today = todayInBusinessTimeZone();

  const resolved = resolveRequestedPeriod(
    {
      from: single(params, 'from'),
      to: single(params, 'to'),
      period: single(params, 'period'),
    },
    today,
  );

  return { ...resolved, today };
}

/** The query a link must carry to keep the current period across a navigation. */
export function periodQuery(range: { readonly start: string; readonly end: string }): {
  readonly from: string;
  readonly to: string;
} {
  return { from: range.start, to: range.end };
}
