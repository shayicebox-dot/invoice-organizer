/**
 * Reporting periods.
 *
 * Pure date arithmetic over `YYYY-MM-DD` strings, done in UTC so results never
 * depend on the server's local timezone. The caller decides what "today" is in
 * the business timezone (see `BUSINESS_CONFIG.timeZone`) and passes it in.
 */

export type PeriodPreset = 'today' | 'last7' | 'last30' | 'mtd' | 'ytd';

export type DateRange = {
  /** Inclusive start, `YYYY-MM-DD`. */
  readonly start: string;
  /** Inclusive end, `YYYY-MM-DD`. */
  readonly end: string;
};

export type PeriodPresetOption = {
  readonly id: PeriodPreset;
  readonly label: string;
  /** Abbreviated label for narrow screens. */
  readonly shortLabel: string;
};

export const PERIOD_PRESETS: readonly PeriodPresetOption[] = [
  { id: 'today', label: 'Today', shortLabel: 'Today' },
  { id: 'last7', label: '7 days', shortLabel: '7D' },
  { id: 'last30', label: '30 days', shortLabel: '30D' },
  { id: 'mtd', label: 'Month to date', shortLabel: 'MTD' },
  { id: 'ytd', label: 'Year to date', shortLabel: 'YTD' },
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toUtcMillis(isoDate: string): number {
  if (!isIsoDate(isoDate)) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${isoDate}".`);
  }
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function toIsoDate(utcMillis: number): string {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(toUtcMillis(isoDate) + days * MS_PER_DAY);
}

export function daysBetween(range: DateRange): number {
  return Math.round((toUtcMillis(range.end) - toUtcMillis(range.start)) / MS_PER_DAY) + 1;
}

/** Every date in the range, inclusive, ascending. */
export function eachDay(range: DateRange): readonly string[] {
  const count = daysBetween(range);
  return Array.from({ length: Math.max(count, 0) }, (_, index) => addDays(range.start, index));
}

export function parsePeriodPreset(value: string | undefined): PeriodPreset {
  const match = PERIOD_PRESETS.find((preset) => preset.id === value);
  return match?.id ?? 'last30';
}

/** Resolve a preset against the given "today" (business timezone, `YYYY-MM-DD`). */
export function resolvePeriod(preset: PeriodPreset, today: string): DateRange {
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'last7':
      return { start: addDays(today, -6), end: today };
    case 'last30':
      return { start: addDays(today, -29), end: today };
    case 'mtd':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'ytd':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
}
