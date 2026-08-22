import type { Money } from '@/core/money';

/**
 * One day of the performance series.
 * A day with no source data is absent from the series — it is never emitted as
 * a zero, which would draw a line along the floor as if we had measured it.
 */
export type DailyPoint = {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly revenue: Money;
  readonly marketingSpend: Money;
  readonly orders: number;
};

export type DailySeries = readonly DailyPoint[];

/** Largest revenue value in the series, for scaling a chart. `null` when empty. */
export function maxRevenueMinorUnits(series: DailySeries): number | null {
  if (series.length === 0) return null;
  return series.reduce((max, point) => Math.max(max, point.revenue.minorUnits), 0);
}
