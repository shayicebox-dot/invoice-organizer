import type { Money } from '@/core/money';

/**
 * One day of the performance series.
 *
 * Within a window a source fully covers, a day with no orders is a measured
 * zero and belongs in the series. A day outside that window is absent
 * entirely — never emitted as a zero, which would draw a line along the floor
 * as if we had measured it.
 */
export type DailyPoint = {
  /** `YYYY-MM-DD`. */
  readonly date: string;
  readonly revenue: Money;
  /** `null` until an ad platform is connected — never a stand-in zero. */
  readonly marketingSpend: Money | null;
  readonly orders: number;
};

export type DailySeries = readonly DailyPoint[];

/** Largest revenue value in the series, for scaling a chart. `null` when empty. */
export function maxRevenueMinorUnits(series: DailySeries): number | null {
  if (series.length === 0) return null;
  return series.reduce((max, point) => Math.max(max, point.revenue.minorUnits), 0);
}
