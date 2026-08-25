import type { Money } from '@/core/money';
import type { Metric, MetricValue } from '@/core/metrics/types';
import { BUSINESS_CONFIG } from '@/lib/config/business';

/**
 * Presentation-only formatting. Formatting is the last step after a value has
 * been calculated — it never rounds a figure into existence, and it never
 * substitutes a placeholder for a missing one (that is the caller's decision).
 */

const MINOR_UNITS_PER_MAJOR = 100;

export const NOT_CONNECTED_LABEL = 'Not connected';

export function formatMoney(
  amount: Money,
  options?: { readonly compact?: boolean; readonly showDecimals?: boolean },
): string {
  const showDecimals = options?.showDecimals ?? false;
  return new Intl.NumberFormat(BUSINESS_CONFIG.locale, {
    style: 'currency',
    currency: amount.currency,
    notation: options?.compact === true ? 'compact' : 'standard',
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount.minorUnits / MINOR_UNITS_PER_MAJOR);
}

export function formatCount(count: number): string {
  return new Intl.NumberFormat(BUSINESS_CONFIG.locale).format(count);
}

export function formatMultiple(multiple: number): string {
  return `${multiple.toFixed(2)}×`;
}

/**
 * A fraction as a percentage.
 *
 * `digits` defaults to one decimal, which suits margins. Rates that live near
 * zero — a link CTR is routinely under 2% — need two, or every distinct value
 * rounds to the same figure.
 */
export function formatPercent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat(BUSINESS_CONFIG.locale, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

/** Average times one person saw an ad, e.g. "3.62×". */
export function formatFrequency(frequency: number): string {
  return `${frequency.toFixed(2)}×`;
}

export function formatMetricValue(value: MetricValue): string {
  switch (value.kind) {
    case 'money':
      return formatMoney(value.amount);
    case 'count':
      return formatCount(value.count);
    case 'multiple':
      return formatMultiple(value.multiple);
    case 'percent':
      return formatPercent(value.fraction);
  }
}

/** A metric's value, or `null` when it could not be computed. */
export function formatMetric(metric: Metric): string | null {
  return metric.value === null ? null : formatMetricValue(metric.value);
}

/** `YYYY-MM-DD` → short display date, e.g. "22 Aug". */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat(BUSINESS_CONFIG.locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

export function formatDateRange(range: { readonly start: string; readonly end: string }): string {
  if (range.start === range.end) return formatShortDate(range.start);
  return `${formatShortDate(range.start)} – ${formatShortDate(range.end)}`;
}

/**
 * A range with its year, for the date picker and anywhere the exact period
 * must be unambiguous: "18 Aug – 24 Aug 2026".
 *
 * The year is written once when both ends share it, and on both ends when they
 * do not — a range spanning New Year has to say so.
 */
export function formatRangeLabel(range: { readonly start: string; readonly end: string }): string {
  const startYear = range.start.slice(0, 4);
  const endYear = range.end.slice(0, 4);

  if (range.start === range.end) return formatLongDate(range.start);
  if (startYear === endYear) {
    return `${formatShortDate(range.start)} – ${formatLongDate(range.end)}`;
  }
  return `${formatLongDate(range.start)} – ${formatLongDate(range.end)}`;
}

/** `YYYY-MM-DD` → "24 Aug 2026". */
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat(BUSINESS_CONFIG.locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** `YYYY-MM-DD` → "August 2026", for a calendar heading. */
export function formatMonthLabel(isoDate: string): string {
  return new Intl.DateTimeFormat(BUSINESS_CONFIG.locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** `YYYY-MM-DD` → "Monday 24 August 2026", for a calendar cell's screen-reader name. */
export function formatFullDate(isoDate: string): string {
  return new Intl.DateTimeFormat(BUSINESS_CONFIG.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Short weekday initials starting on the business week's first day.
 *
 * Built from a known week in UTC rather than hardcoded, so the labels follow
 * the configured locale instead of being English constants in a component.
 */
export function weekdayInitials(weekStartsOn: number): readonly string[] {
  const formatter = new Intl.DateTimeFormat(BUSINESS_CONFIG.locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });

  // 2024-01-07 was a Sunday, so index 0 of this week is Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(new Date(Date.UTC(2024, 0, 7 + ((weekStartsOn + index) % 7)))),
  );
}
