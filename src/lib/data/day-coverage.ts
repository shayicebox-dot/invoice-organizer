/**
 * Did the range we asked for come back whole?
 *
 * This exists because of a bug that hid seven months of trading. The daily
 * series used to be built from a 120-day mock scaffold and then have live data
 * merged onto it, so any requested day outside that scaffold had no row for the
 * data to land in. Shopify, Meta and Google were all read successfully and
 * discarded, and every downstream figure was consistent with every other one —
 * because they were all computed from the same short array.
 *
 * That is the failure mode this guards. Totals reconciling against each other
 * proves nothing when they share a truncated input; the only check that catches
 * it compares what came back against what was *asked for*.
 */

import { daysBetween, enumerateDates } from "../date-range";
import type { ISODate } from "../types";

export interface DayCoverage {
  /** Calendar days in the requested range. */
  requested: number;
  /** Day records actually produced. */
  returned: number;
  /** Requested days with no record. Capped for display; `missingCount` is exact. */
  missing: ISODate[];
  missingCount: number;
  /** Dates appearing more than once, which would double-count every total. */
  duplicates: ISODate[];
  /** Dates returned that fall outside the requested range. */
  outOfRange: ISODate[];
  firstDate: ISODate | null;
  lastDate: ISODate | null;
  complete: boolean;
}

/** How many missing dates to name before the list stops being useful. */
const MAX_LISTED = 10;

export function assessDayCoverage(
  start: ISODate,
  end: ISODate,
  days: readonly { date: ISODate }[],
): DayCoverage {
  const requested = daysBetween(start, end);

  const seen = new Map<ISODate, number>();
  for (const day of days) seen.set(day.date, (seen.get(day.date) ?? 0) + 1);

  const missing: ISODate[] = [];
  for (const date of enumerateDates(start, end)) {
    if (!seen.has(date)) missing.push(date);
  }

  const duplicates = [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([date]) => date)
    .sort();

  const outOfRange = [...seen.keys()].filter((date) => date < start || date > end).sort();

  const dates = days.map((day) => day.date).sort();

  return {
    requested,
    returned: days.length,
    missing: missing.slice(0, MAX_LISTED),
    missingCount: missing.length,
    duplicates,
    outOfRange,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    complete:
      missing.length === 0 &&
      duplicates.length === 0 &&
      outOfRange.length === 0 &&
      days.length === requested,
  };
}
