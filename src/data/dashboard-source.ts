import 'server-only';

import { BUSINESS_CONFIG } from '@/lib/config/business';
import type { DateRange } from '@/core/period';
import type { DailySeries } from '@/core/metrics/daily';
import type { PeriodInputs } from '@/core/metrics/types';

/**
 * The seam between ICEBOX OS and its data.
 *
 * Nothing is connected yet, so every input comes back `null` and every list
 * comes back empty. When Shopify, the ad platforms and the expense records
 * arrive, only this file changes: it starts reading repositories instead of
 * returning empties, and the calculations and UI above it stay as they are.
 *
 * It deliberately does not invent numbers. `null` travels all the way to the
 * screen as "Not connected".
 */

export type DataSourceId =
  | 'shopify'
  | 'meta-ads'
  | 'google-ads'
  | 'product-costs'
  | 'expenses';

export type DataSource = {
  readonly id: DataSourceId;
  readonly label: string;
  readonly connected: boolean;
  /** What this source will provide once connected. */
  readonly provides: string;
};

export const DATA_SOURCES: readonly DataSource[] = [
  { id: 'shopify', label: 'Shopify', connected: false, provides: 'Orders, revenue, discounts, refunds' },
  { id: 'meta-ads', label: 'Meta Ads', connected: false, provides: 'Daily ad spend' },
  { id: 'google-ads', label: 'Google Ads', connected: false, provides: 'Daily ad spend' },
  { id: 'product-costs', label: 'Product costs', connected: false, provides: 'Unit costs for COGS' },
  { id: 'expenses', label: 'Expenses', connected: false, provides: 'Operating expenses' },
];

export type RecentOrder = {
  readonly id: string;
  readonly reference: string;
  readonly placedAt: string;
  readonly customer: string;
  readonly itemCount: number;
  readonly totalMinorUnits: number;
  readonly status: string;
};

export type DashboardData = {
  readonly range: DateRange;
  readonly inputs: PeriodInputs;
  readonly daily: DailySeries;
  readonly recentOrders: readonly RecentOrder[];
  readonly sources: readonly DataSource[];
};

export function connectedSourceCount(sources: readonly DataSource[] = DATA_SOURCES): number {
  return sources.filter((source) => source.connected).length;
}

/** Inputs for a period in which no source has reported anything. */
function emptyInputs(): PeriodInputs {
  return {
    currency: BUSINESS_CONFIG.reportingCurrency,
    grossRevenue: null,
    discounts: null,
    refunds: null,
    orderCount: null,
    cogs: null,
    shippingCost: null,
    processingFees: null,
    metaSpend: null,
    googleSpend: null,
    operatingExpenses: null,
  };
}

/**
 * Everything the dashboard needs for one period.
 * Async from the start so wiring real queries in later does not ripple upwards.
 */
export async function getDashboardData(range: DateRange): Promise<DashboardData> {
  return Promise.resolve({
    range,
    inputs: emptyInputs(),
    daily: [],
    recentOrders: [],
    sources: DATA_SOURCES,
  });
}
