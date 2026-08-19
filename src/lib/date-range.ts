/**
 * Date handling for the reporting period selector.
 *
 * Dates are plain `YYYY-MM-DD` strings throughout the app. All arithmetic runs
 * in UTC so a period never shifts because of the server's timezone; per-store
 * reporting timezones are applied upstream when raw platform data is ingested.
 */

import type { ISODate } from "./types";

export const DATE_RANGE_PRESETS = [
  "today",
  "yesterday",
  "7d",
  "30d",
  "this-month",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 Days",
  "30d": "30 Days",
  "this-month": "This Month",
  custom: "Custom",
};

export interface DateRange {
  preset: DateRangePreset;
  /** Inclusive. */
  start: ISODate;
  /** Inclusive. */
  end: ISODate;
  label: string;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): value is ISODate {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toISODate(parsed) === value;
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function parseISODate(date: ISODate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: ISODate, days: number): ISODate {
  const parsed = parseISODate(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return toISODate(parsed);
}

/** Inclusive day count between two dates. */
export function daysBetween(start: ISODate, end: ISODate): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Every date from `start` to `end`, inclusive. */
export function enumerateDates(start: ISODate, end: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function daysInMonth(date: ISODate): number {
  const parsed = parseISODate(date);
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Today, in UTC. Single source of "now" for the whole app. */
export function today(): ISODate {
  return toISODate(new Date());
}

export function isSameDay(a: ISODate, b: ISODate): boolean {
  return a === b;
}

/**
 * Resolve the selector state into concrete boundaries. Unknown or malformed
 * input falls back to the last 30 days rather than throwing, so a hand-edited
 * URL can never break the dashboard.
 */
export function resolveDateRange(
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined,
  anchor: ISODate = today(),
): DateRange {
  const normalized = (DATE_RANGE_PRESETS as readonly string[]).includes(preset ?? "")
    ? (preset as DateRangePreset)
    : "30d";

  switch (normalized) {
    case "today":
      return range("today", anchor, anchor);
    case "yesterday": {
      const yesterday = addDays(anchor, -1);
      return range("yesterday", yesterday, yesterday);
    }
    case "7d":
      return range("7d", addDays(anchor, -6), anchor);
    case "this-month":
      return range("this-month", startOfMonth(anchor), anchor);
    case "custom": {
      if (from && to && isISODate(from) && isISODate(to) && from <= to) {
        return range("custom", from, to);
      }
      return range("30d", addDays(anchor, -29), anchor);
    }
    case "30d":
    default:
      return range("30d", addDays(anchor, -29), anchor);
  }
}

function range(preset: DateRangePreset, start: ISODate, end: ISODate): DateRange {
  return { preset, start, end, label: describeRange(preset, start, end) };
}

/**
 * The equally long period immediately before this one, used for KPI deltas.
 */
export function previousPeriod(current: DateRange): { start: ISODate; end: ISODate } {
  const length = daysBetween(current.start, current.end);
  return {
    start: addDays(current.start, -length),
    end: addDays(current.start, -1),
  };
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_DAY_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const WEEKDAY_MONTH_DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatDateShort(date: ISODate): string {
  return MONTH_DAY.format(parseISODate(date));
}

export function formatDateLong(date: ISODate): string {
  return MONTH_DAY_YEAR.format(parseISODate(date));
}

export function formatDateWithWeekday(date: ISODate): string {
  return WEEKDAY_MONTH_DAY.format(parseISODate(date));
}

export function describeRange(preset: DateRangePreset, start: ISODate, end: ISODate): string {
  if (start === end) return formatDateLong(start);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? formatDateShort(start) : formatDateLong(start)} – ${formatDateLong(end)}`;
}

/** Comparison caption such as "vs previous 30 days". */
export function describeComparison(range: DateRange): string {
  const length = daysBetween(range.start, range.end);
  if (length === 1) return "vs previous day";
  return `vs previous ${length} days`;
}
