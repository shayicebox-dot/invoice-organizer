import 'server-only';

import type { DateRange } from '@/core/period';
import type { CurrencyCode } from '@/core/money';
import {
  aggregatePeriod,
  emptyTotals,
  type PeriodTotals,
  type SalesOrder,
} from '@/core/metrics/sales';
import { getSalesForPeriod, type PeriodReturn } from '@/data/shopify-orders';
import type { DataCaveats } from '@/data/dashboard-source';
import { BUSINESS_CONFIG } from '@/lib/config/business';
import { aggregateProductProfit, type ProductProfit } from '@/core/metrics/profitability';
import { describeMapping, tallyBoxes, type BoxTally, type ProductMappingRow } from '@/core/metrics/boxes';
import { boxMappingConfig, costRatesForRange } from '@/data/profitability-source';

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
  /** The individual returns that landed in this period. */
  readonly returns: readonly PeriodReturn[];
  /** False when the refund sweep stopped before every page was read. */
  readonly returnsComplete: boolean;
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
  /** Per-variant profitability: boxes, cost and contribution. */
  readonly profitability: readonly ProductProfit[];
  /** How each line's physical box count was arrived at. */
  readonly boxes: BoxTally;
  /** Every distinct pack seen, with its variant ID and how it was mapped. */
  readonly mapping: readonly ProductMappingRow[];
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
  const sales = await getSalesForPeriod(range);

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
      returns: [],
      returnsComplete: true,
      sourceAnswered: false,
    };
  }

  const ordered = [...sales.orders].sort((a, b) => b.processedAt.localeCompare(a.processedAt));

  return {
    orders: ordered,
    totals: aggregatePeriod(sales.orders, sales.currency, sales.salesReversals),
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
    returns: sales.returns,
    returnsComplete: sales.returnsComplete,
    sourceAnswered: true,
  };
}

export async function getProductsPageData(range: DateRange): Promise<ProductsPageData> {
  const currency = BUSINESS_CONFIG.reportingCurrency;
  const sales = await getSalesForPeriod(range);

  if (!sales.ok) {
    return {
      profitability: [],
      boxes: { boxes: 0, unmappedLines: 0, unmappedVariants: [], complete: true },
      mapping: [],
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

  const mapping = await boxMappingConfig();

  return {
    profitability: aggregateProductProfit(sales.orders, mapping, costRatesForRange(range)),
    boxes: tallyBoxes(sales.orders, mapping),
    mapping: describeMapping(sales.orders, mapping),
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
