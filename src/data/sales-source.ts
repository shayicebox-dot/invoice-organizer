import 'server-only';

import type { DateRange } from '@/core/period';
import type { CurrencyCode } from '@/core/money';
import {
  aggregatePeriod,
  aggregateProductSales,
  emptyTotals,
  type PeriodTotals,
  type ProductSales,
  type SalesOrder,
} from '@/core/metrics/sales';
import { getSalesForPeriod } from '@/data/shopify-orders';
import type { DataCaveats } from '@/data/dashboard-source';
import { BUSINESS_CONFIG } from '@/lib/config/business';

/**
 * Order-level and product-level reads for the Sales and Products screens.
 *
 * Both need line items, which the dashboard does not, so they ask for the
 * heavier query. Everything else — the definitions, the timezone bucketing, the
 * history limit — is shared with the dashboard through `getSalesForPeriod`.
 */

export type SalesPageData = {
  readonly orders: readonly SalesOrder[];
  readonly totals: PeriodTotals;
  readonly currency: CurrencyCode;
  readonly caveats: DataCaveats;
  /** True when an order carried more line items than one page returned. */
  readonly lineItemsTruncated: boolean;
  /**
   * True only when Shopify actually answered.
   *
   * `totals` is zero-filled when it did not, and a caller must be able to tell
   * that apart from a genuine period of no sales — "we could not ask" and "no
   * orders were placed" are different statements, and a figure derived from the
   * second when the first is true is simply wrong.
   */
  readonly sourceAnswered: boolean;
};

export type ProductsPageData = {
  readonly products: readonly ProductSales[];
  readonly currency: CurrencyCode;
  readonly caveats: DataCaveats;
  readonly lineItemsTruncated: boolean;
  /** Orders the products were derived from, for context on the screen. */
  readonly orderCount: number;
};

function emptyCaveats(range: DateRange, error: DataCaveats['error']): DataCaveats {
  return {
    coverage: { range, truncated: false, requestedStart: range.start },
    availableFrom: null,
    incomplete: false,
    taxesIncluded: false,
    error,
    // Sales and Products show no advertising figures, so there is nothing to
    // caveat about them here.
    marketing: null,
  };
}

export async function getSalesPageData(range: DateRange): Promise<SalesPageData> {
  const currency = BUSINESS_CONFIG.reportingCurrency;
  const sales = await getSalesForPeriod(range, true);

  if (!sales.ok) {
    return {
      orders: [],
      totals: emptyTotals(currency),
      currency,
      caveats: emptyCaveats(
        range,
        sales.reason === 'not-configured'
          ? null
          : { message: sales.message, guidance: sales.guidance },
      ),
      lineItemsTruncated: false,
      sourceAnswered: false,
    };
  }

  const ordered = [...sales.orders].sort((a, b) => b.processedAt.localeCompare(a.processedAt));

  return {
    orders: ordered,
    totals: aggregatePeriod(sales.orders, sales.currency),
    currency: sales.currency,
    caveats: {
      coverage: sales.coverage,
      availableFrom: sales.availableFrom,
      incomplete: !sales.complete,
      taxesIncluded: sales.taxesIncluded,
      error: null,
      marketing: null,
    },
    lineItemsTruncated: sales.lineItemsTruncated,
    sourceAnswered: true,
  };
}

export async function getProductsPageData(range: DateRange): Promise<ProductsPageData> {
  const currency = BUSINESS_CONFIG.reportingCurrency;
  const sales = await getSalesForPeriod(range, true);

  if (!sales.ok) {
    return {
      products: [],
      currency,
      caveats: emptyCaveats(
        range,
        sales.reason === 'not-configured'
          ? null
          : { message: sales.message, guidance: sales.guidance },
      ),
      lineItemsTruncated: false,
      orderCount: 0,
    };
  }

  return {
    products: aggregateProductSales(sales.orders),
    currency: sales.currency,
    caveats: {
      coverage: sales.coverage,
      availableFrom: sales.availableFrom,
      incomplete: !sales.complete,
      taxesIncluded: sales.taxesIncluded,
      error: null,
      marketing: null,
    },
    lineItemsTruncated: sales.lineItemsTruncated,
    orderCount: sales.orders.length,
  };
}
