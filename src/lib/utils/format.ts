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

export function formatPercent(fraction: number): string {
  return new Intl.NumberFormat(BUSINESS_CONFIG.locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(fraction);
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
