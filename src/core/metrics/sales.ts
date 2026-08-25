import { addMoney, subtractMoney, sumMoney, zeroMoney, type CurrencyCode, type Money } from '@/core/money';
import type { DateRange } from '@/core/period';
import { eachDay } from '@/core/period';
import type { DailyPoint, DailySeries } from '@/core/metrics/daily';

/**
 * Sales aggregation.
 *
 * Pure: takes orders that have already been normalised and returns totals. It
 * knows nothing about Shopify, HTTP or React, so every figure here can be
 * reproduced from its inputs alone.
 *
 * The definitions, stated once so they are not re-invented per screen:
 *
 * - **Gross sales** — what the products were listed at: line item prices
 *   × quantity, before any discount. Excludes shipping charged to the customer
 *   and excludes tax.
 * - **Discounts** — everything taken off those prices at checkout.
 * - **Refunds** — money returned to customers, as reported by Shopify.
 * - **Net revenue** — gross sales − discounts − refunds.
 *
 * Net revenue is therefore product revenue actually kept. It is not the same
 * as money received: it excludes shipping income and tax, both of which arrive
 * when those are modelled deliberately.
 */

export type SalesLineItem = {
  readonly id: string;
  readonly productTitle: string;
  readonly sku: string | null;
  readonly quantity: number;
  /** Unit price before discount. */
  readonly unitPrice: Money;
  /** Line total after discounts, before refunds. */
  readonly discountedTotal: Money;
  readonly productId: string | null;
  /**
   * The variant sold, which is what a pack size actually is in Shopify.
   *
   * Carried because costing needs to know how many physical boxes one unit of
   * this line represents, and a variant ID is the only stable way to say so —
   * see `src/core/metrics/boxes.ts`.
   */
  readonly variantId: string | null;
  readonly variantTitle: string | null;
};

export type SalesOrder = {
  readonly id: string;
  /** Customer-facing order number, e.g. `#1042`. */
  readonly orderNumber: string;
  /** The instant Shopify processed the order. */
  readonly processedAt: string;
  /** Calendar day in the business timezone — the day this order belongs to. */
  readonly businessDate: string;
  readonly customer: string | null;
  readonly grossSales: Money;
  readonly discounts: Money;
  readonly refunds: Money;
  readonly netRevenue: Money;
  readonly isCancelled: boolean;
  /** Shopify's own status, e.g. `PAID`, `PARTIALLY_REFUNDED`. Never invented. */
  readonly financialStatus: string | null;
  readonly lineItems: readonly SalesLineItem[];
  /** True when the order has more line items than one page returned. */
  readonly hasMoreLineItems: boolean;
};

export type PeriodTotals = {
  readonly grossSales: Money;
  readonly discounts: Money;
  readonly refunds: Money;
  readonly netRevenue: Money;
  readonly orderCount: number;
};

/** Net revenue for one order: gross − discounts − refunds. */
export function orderNetRevenue(gross: Money, discounts: Money, refunds: Money): Money {
  return subtractMoney(subtractMoney(gross, discounts), refunds);
}

export function aggregatePeriod(
  orders: readonly SalesOrder[],
  currency: CurrencyCode,
): PeriodTotals {
  return {
    grossSales: sumMoney(currency, orders.map((order) => order.grossSales)),
    discounts: sumMoney(currency, orders.map((order) => order.discounts)),
    refunds: sumMoney(currency, orders.map((order) => order.refunds)),
    netRevenue: sumMoney(currency, orders.map((order) => order.netRevenue)),
    orderCount: orders.length,
  };
}

/**
 * Net revenue and order count for every day in the range.
 *
 * Days without orders are included as zero, and that is not an invented value:
 * inside a window Shopify fully covers, "no orders that day" is something we
 * measured. This differs from a missing data source, which stays `null` all the
 * way to the screen.
 */
export function buildDailySeries(
  orders: readonly SalesOrder[],
  range: DateRange,
  currency: CurrencyCode,
): DailySeries {
  const byDate = new Map<string, { revenue: Money; orders: number }>();

  for (const order of orders) {
    const existing = byDate.get(order.businessDate) ?? {
      revenue: zeroMoney(currency),
      orders: 0,
    };

    byDate.set(order.businessDate, {
      revenue: addMoney(existing.revenue, order.netRevenue),
      orders: existing.orders + 1,
    });
  }

  return eachDay(range).map((date): DailyPoint => {
    const totals = byDate.get(date);
    return {
      date,
      revenue: totals?.revenue ?? zeroMoney(currency),
      marketingSpend: null,
      orders: totals?.orders ?? 0,
    };
  });
}

/** Quantity sold and revenue per product, ordered by revenue descending. */

/** True when any order carried more line items than were fetched. */
export function hasTruncatedLineItems(orders: readonly SalesOrder[]): boolean {
  return orders.some((order) => order.hasMoreLineItems);
}

/** Sum of `zeroMoney` when there is nothing to add, for callers that need it. */
export function emptyTotals(currency: CurrencyCode): PeriodTotals {
  return {
    grossSales: zeroMoney(currency),
    discounts: zeroMoney(currency),
    refunds: zeroMoney(currency),
    netRevenue: zeroMoney(currency),
    orderCount: 0,
  };
}
