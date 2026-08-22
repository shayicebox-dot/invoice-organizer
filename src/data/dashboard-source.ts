import 'server-only';

import { BUSINESS_CONFIG } from '@/lib/config/business';
import type { ClampedRange, DateRange } from '@/core/period';
import type { DailySeries } from '@/core/metrics/daily';
import type { PeriodInputs } from '@/core/metrics/types';
import { aggregatePeriod, buildDailySeries, type SalesOrder } from '@/core/metrics/sales';
import { getSalesForPeriod } from '@/data/shopify-orders';
import { isShopifyConfigured } from '@/lib/config/env';

/**
 * The seam between ICEBOX OS and its data.
 *
 * Shopify now supplies orders, revenue, discounts and refunds. Everything else
 * — ad spend, product costs, expenses — has no source yet and stays `null`,
 * which travels all the way to the screen as "Not connected". Nothing here
 * substitutes a zero for a number it does not have.
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
  /** What this source provides, or will once connected. */
  readonly provides: string;
};

export type RecentOrder = {
  readonly id: string;
  readonly reference: string;
  readonly placedAt: string;
  readonly customer: string;
  /** `null` when line items were not fetched — shown as a dash, never as 0. */
  readonly itemCount: number | null;
  readonly totalMinorUnits: number;
  readonly status: string;
};

/** Anything the screen must say out loud about how complete these figures are. */
export type DataCaveats = {
  readonly coverage: ClampedRange;
  readonly availableFrom: string | null;
  /** True when the page guard stopped before every order was read. */
  readonly incomplete: boolean;
  /** True when store prices include tax, so figures carry VAT. */
  readonly taxesIncluded: boolean;
  readonly error: { readonly message: string; readonly guidance: string } | null;
};

export type DashboardData = {
  readonly range: DateRange;
  readonly inputs: PeriodInputs;
  readonly daily: DailySeries;
  readonly recentOrders: readonly RecentOrder[];
  readonly sources: readonly DataSource[];
  readonly caveats: DataCaveats;
};

const RECENT_ORDERS_SHOWN = 8;

function buildSources(shopifyConnected: boolean): readonly DataSource[] {
  return [
    {
      id: 'shopify',
      label: 'Shopify',
      connected: shopifyConnected,
      provides: 'Orders, revenue, discounts, refunds',
    },
    { id: 'meta-ads', label: 'Meta Ads', connected: false, provides: 'Daily ad spend' },
    { id: 'google-ads', label: 'Google Ads', connected: false, provides: 'Daily ad spend' },
    {
      id: 'product-costs',
      label: 'Product costs',
      connected: false,
      provides: 'Unit costs for COGS',
    },
    { id: 'expenses', label: 'Expenses', connected: false, provides: 'Operating expenses' },
  ];
}

export function connectedSourceCount(sources: readonly DataSource[]): number {
  return sources.filter((source) => source.connected).length;
}

/** Inputs for a period with no usable source: everything unknown, nothing zero. */
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

/** Everything the dashboard needs for one period. */
export async function getDashboardData(range: DateRange): Promise<DashboardData> {
  const sales = await getSalesForPeriod(range, false);

  if (!sales.ok) {
    return {
      range,
      inputs: emptyInputs(),
      daily: [],
      recentOrders: [],
      sources: buildSources(false),
      caveats: {
        coverage: sales.coverage,
        availableFrom: null,
        incomplete: false,
        taxesIncluded: false,
        error:
          sales.reason === 'not-configured'
            ? null
            : { message: sales.message, guidance: sales.guidance },
      },
    };
  }

  const totals = aggregatePeriod(sales.orders, sales.currency);

  return {
    range: sales.coverage.range,
    inputs: {
      ...emptyInputs(),
      grossRevenue: totals.grossSales,
      discounts: totals.discounts,
      refunds: totals.refunds,
      orderCount: totals.orderCount,
    },
    daily: buildDailySeries(sales.orders, sales.coverage.range, sales.currency),
    recentOrders: toRecentOrders(sales.orders),
    sources: buildSources(isShopifyConfigured()),
    caveats: {
      coverage: sales.coverage,
      availableFrom: sales.availableFrom,
      incomplete: !sales.complete,
      taxesIncluded: sales.taxesIncluded,
      error: null,
    },
  };
}

/** Shopify's status, tidied for display — never replaced with a guess. */
function formatFinancialStatus(status: string | null): string {
  if (status === null) return 'Unknown';
  const words = status.toLowerCase().split('_');
  const [first = '', ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

/**
 * The most recent orders, newest first.
 *
 * `totalMinorUnits` carries net revenue — the same figure the totals above are
 * built from — so a reader adding up this column sees the same definition of
 * revenue as the KPI tiles.
 */
function toRecentOrders(orders: readonly SalesOrder[]): readonly RecentOrder[] {
  return [...orders]
    .sort((a, b) => b.processedAt.localeCompare(a.processedAt))
    .slice(0, RECENT_ORDERS_SHOWN)
    .map((order) => ({
      id: order.id,
      reference: order.orderNumber,
      placedAt: order.businessDate,
      customer: order.customer ?? 'Guest',
      itemCount:
        order.lineItems.length === 0
          ? null
          : order.lineItems.reduce((total, line) => total + line.quantity, 0),
      totalMinorUnits: order.netRevenue.minorUnits,
      status: order.isCancelled ? 'Cancelled' : formatFinancialStatus(order.financialStatus),
    }));
}
