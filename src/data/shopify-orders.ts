import 'server-only';

import { cache } from 'react';
import { addMoney, sumMoney, type CurrencyCode, type Money } from '@/core/money';
import {
  addDays,
  clampRangeToAvailable,
  instantToDateInTimeZone,
  type ClampedRange,
  type DateRange,
} from '@/core/period';
import { orderSalesBeforeReturns, type SalesLineItem, type SalesOrder } from '@/core/metrics/sales';
import {
  DEFAULT_ORDER_HISTORY_DAYS,
  fetchAllOrders,
  fetchRefundsInWindow,
  readOrderHistoryLimit,
  type ShopifyOrder,
  type ShopifyRefund,
} from '@/integrations/shopify/orders';
import { ShopifyError, FAILURE_GUIDANCE } from '@/integrations/shopify/errors';
import { ShopifyConfigError } from '@/integrations/shopify/config';
import { BUSINESS_CONFIG } from '@/lib/config/business';
import { isShopifyConfigured } from '@/lib/config/env';
import { todayInBusinessTimeZone } from '@/lib/utils/today';

/**
 * Shopify orders, mapped into the shapes the rest of ICEBOX OS speaks.
 *
 * This is the only place that turns a Shopify payload into a `SalesOrder`. The
 * mapping is the auditable step: gross sales are reconstructed from what
 * Shopify reports, and the reasoning is written down here rather than implied
 * by whichever screen displays the result.
 */

/** One return that landed inside the reporting period. */
export type PeriodReturn = {
  readonly id: string;
  readonly orderNumber: string;
  /** The day the refund happened, in the business timezone. */
  readonly businessDate: string;
  /** Product value returned, excluding tax and shipping. */
  readonly productSubtotal: Money;
  /** Cash actually returned, including shipping and tax. */
  readonly totalRefunded: Money;
  /** True when the order it belongs to was placed before this period. */
  readonly againstEarlierOrder: boolean;
};

export type SalesFetch =
  | {
      readonly ok: true;
      readonly orders: readonly SalesOrder[];
      readonly currency: CurrencyCode;
      /** The period actually covered, after trimming to available history. */
      readonly coverage: ClampedRange;
      /** Earliest date Shopify will serve, or `null` when unrestricted. */
      readonly availableFrom: string | null;
      /** False when more orders exist than the page guard allowed. */
      readonly complete: boolean;
      /** True when the store's prices include tax, so figures carry VAT. */
      readonly taxesIncluded: boolean;
      /** True when an order had more line items than one page returned. */
      readonly lineItemsTruncated: boolean;
      /**
       * Goods returned during this period, product value only, dated by the
       * refund rather than by the order it was against.
       */
      readonly salesReversals: Money;
      /** The individual returns behind that total, for the reconciliation view. */
      readonly returns: readonly PeriodReturn[];
      /** False when the refund sweep stopped before every page was read. */
      readonly returnsComplete: boolean;
    }
  | {
      readonly ok: false;
      readonly reason: 'not-configured' | 'error';
      readonly message: string;
      readonly guidance: string;
      readonly coverage: ClampedRange;
    };

/**
 * Fetch and map the orders for a period.
 *
 * Wrapped in React's `cache` so the dashboard's several sections share one
 * Shopify read per request rather than each triggering their own.
 */
export const getSalesForPeriod = cache(
  async (range: DateRange, withLineItems: boolean): Promise<SalesFetch> => {
    const currency = BUSINESS_CONFIG.reportingCurrency;
    const timeZone = BUSINESS_CONFIG.timeZone;

    if (!isShopifyConfigured()) {
      return {
        ok: false,
        reason: 'not-configured',
        message: 'Shopify is not connected on this deployment.',
        guidance: FAILURE_GUIDANCE['not-configured'],
        coverage: { range, truncated: false, requestedStart: range.start },
      };
    }

    try {
      const limit = await readOrderHistoryLimit();
      const availableFrom =
        limit.windowDays === null
          ? null
          : addDays(todayInBusinessTimeZone(), -(limit.windowDays - 1));

      const coverage = clampRangeToAvailable(range, availableFrom);

      // Query a day wider on each side in UTC, then keep only the orders whose
      // business-timezone day falls inside the range. Widening avoids doing
      // timezone-offset arithmetic against Shopify's filter, which would have
      // to account for daylight saving on the boundary days.
      const { orders, complete } = await fetchAllOrders({
        processedAtMin: `${addDays(coverage.range.start, -1)}T00:00:00Z`,
        processedAtMax: `${addDays(coverage.range.end, 1)}T23:59:59Z`,
        withLineItems,
      });

      const mapped = orders
        .filter((order) => !order.isTest)
        .map((order) => toSalesOrder(order, timeZone))
        .filter(
          (order) =>
            order.businessDate >= coverage.range.start && order.businessDate <= coverage.range.end,
        );

      // Returns are read separately, over orders *updated* in the window rather
      // than placed in it. A return processed this month against last month's
      // order belongs to this month's reversals, and searching by order date
      // would never see it.
      const refundSweep = await fetchRefundsInWindow({
        updatedAtMin: `${addDays(coverage.range.start, -1)}T00:00:00Z`,
        updatedAtMax: `${addDays(coverage.range.end, 1)}T23:59:59Z`,
      });

      const orderDateById = new Map(mapped.map((order) => [order.id, order.businessDate]));

      const returns = refundSweep.refunds
        .map((refund) => toPeriodReturn(refund, timeZone, orderDateById))
        .filter(
          (entry) =>
            entry.businessDate >= coverage.range.start && entry.businessDate <= coverage.range.end,
        );

      return {
        ok: true,
        orders: mapped,
        currency,
        coverage,
        availableFrom,
        complete,
        taxesIncluded: orders.some((order) => order.taxesIncluded),
        lineItemsTruncated: orders.some((order) => order.hasMoreLineItems),
        salesReversals: sumMoney(currency, returns.map((entry) => entry.productSubtotal)),
        returns,
        returnsComplete: refundSweep.complete,
      };
    } catch (error) {
      const coverage = { range, truncated: false, requestedStart: range.start };

      if (error instanceof ShopifyConfigError) {
        return {
          ok: false,
          reason: 'error',
          message: error.message,
          guidance: FAILURE_GUIDANCE['invalid-configuration'],
          coverage,
        };
      }

      if (error instanceof ShopifyError) {
        return {
          ok: false,
          reason: 'error',
          message: error.message,
          guidance: FAILURE_GUIDANCE[error.reason],
          coverage,
        };
      }

      return {
        ok: false,
        reason: 'error',
        message: 'Could not read orders from Shopify.',
        guidance: FAILURE_GUIDANCE['network-error'],
        coverage,
      };
    }
  },
);

/**
 * Map one Shopify order onto the sales shape.
 *
 * Gross sales are reconstructed as `subtotal + discounts`. Shopify's
 * `subtotalPrice` is line items *after* discounts, so adding them back gives
 * what the products were listed at. It is done at order level rather than by
 * summing line items, because line items paginate — an order with more than one
 * page of them would otherwise silently understate gross sales.
 *
 * Note that when the store prices tax-inclusively, these amounts include VAT.
 * That fact travels with the result so screens can say so; separating VAT is a
 * deliberate later step, not something to approximate here.
 */
function toPeriodReturn(
  refund: ShopifyRefund,
  timeZone: string,
  orderDateById: ReadonlyMap<string, string>,
): PeriodReturn {
  return {
    id: refund.id,
    orderNumber: refund.orderNumber,
    businessDate: instantToDateInTimeZone(refund.createdAt, timeZone),
    productSubtotal: refund.productSubtotal,
    totalRefunded: refund.totalRefunded,
    // Worth surfacing: these are exactly the returns an order-dated figure
    // misses, and they are the usual reason a total disagrees with Shopify.
    againstEarlierOrder: !orderDateById.has(refund.orderId),
  };
}

function toSalesOrder(order: ShopifyOrder, timeZone: string): SalesOrder {
  const grossSales = addMoney(order.subtotal, order.totalDiscounts);

  const lineItems: readonly SalesLineItem[] = order.lineItems.map((line) => ({
    id: line.id,
    productTitle: line.title,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountedTotal: line.discountedTotal,
    productId: line.productId,
    variantId: line.variantId,
    variantTitle: line.variantTitle,
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    processedAt: order.processedAt,
    businessDate: instantToDateInTimeZone(order.processedAt, timeZone),
    customer: order.customerName,
    grossSales,
    discounts: order.totalDiscounts,
    refunds: order.totalRefunded,
    netRevenue: orderSalesBeforeReturns(grossSales, order.totalDiscounts),
    isCancelled: order.cancelledAt !== null,
    financialStatus: order.financialStatus,
    lineItems,
    hasMoreLineItems: order.hasMoreLineItems,
  };
}

/** Human-readable description of the history Shopify currently serves. */
export function describeHistoryLimit(availableFrom: string | null): string | null {
  if (availableFrom === null) return null;
  return `Shopify returns only the last ${DEFAULT_ORDER_HISTORY_DAYS} days of orders for this app, from ${availableFrom}.`;
}
