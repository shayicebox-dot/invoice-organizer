/**
 * Shopify sales, reported the way Shopify Analytics reports them.
 *
 * The Sales report is not a view over an order's current totals. It is a ledger
 * of sale records, and Shopify exposes that ledger directly through
 * `Order.agreements.sales`. Every ledger entry carries the instant it happened,
 * which is what makes the report reconcile:
 *
 *   - an item added by an **order edit** is a sale on the day of the edit, even
 *     when the order itself was placed months earlier;
 *   - a **return** is a reversal on the day the refund was issued, not on the
 *     day the order was placed;
 *   - **taxes** ride alongside each sale and are never revenue.
 *
 * The definitions below are Shopify's, not ours:
 *
 *   Gross Sales     = line value before discounts and returns, excluding taxes,
 *                     shipping, duties and fees
 *   Discounts       = discounts allocated to those sales
 *   Sales Reversals = value of items removed from orders, net of any discount
 *                     that came off with them
 *   Net Sales       = Gross Sales - Discounts - Sales Reversals
 *
 * ## Why two passes
 *
 * The ledger is nested three connections deep, so asking for it on every order
 * blows the Admin API's per-query cost budget. It is also unnecessary: an order
 * that was never edited, returned, refunded or cancelled has exactly one
 * agreement, written at checkout, and its order-level totals are that agreement
 * by definition. So the first pass reads cheap order-level totals for
 * everything, and the second pass reads the full ledger only for orders that
 * can disagree with them.
 *
 * The window is queried on `updated_at`, not `created_at`: an order edited or
 * refunded inside the window may have been placed long before it, and it is
 * exactly those orders that the order-level totals get wrong.
 *
 * Scope: `read_orders`. No new scope beyond what the integration already has.
 */

import "server-only";

import { type CurrencyCode, type Money, ZERO, add, subtract } from "../money";
import type { ISODate } from "../types";
import { ShopifyError, shopifyGraphQL } from "./client";
import { getShopifyConfig } from "./config";
import { type MoneyBag, type ShopInfo, bagToMoney, dateInTimezone, shiftIso } from "./shop";

/** Orders per page in the cheap pass. */
const ORDER_PAGE_SIZE = 50;
/** Hard stop, so a wide range can never loop indefinitely. */
const MAX_ORDER_PAGES = 80;

/**
 * Ledger-pass batching. The Admin API charges a query the product of its nested
 * connection sizes, so these three numbers multiply into the cost budget and
 * cannot be raised independently.
 */
const LEDGER_BATCH_SIZE = 2;
const AGREEMENTS_PER_ORDER = 6;
const SALES_PER_AGREEMENT = 11;
const MAX_LEDGER_BATCHES = 400;

const ORDER_TOTALS_QUERY = `query EcomPlOrderTotals($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      createdAt
      test
      edited
      cancelledAt
      returnStatus
      currentSubtotalLineItemsQuantity
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      refunds(first: 1) { id }
    }
  }
}`;

const ORDER_SALES_QUERY = `query EcomPlOrderSales($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Order {
      id
      name
      agreements(first: ${AGREEMENTS_PER_ORDER}) {
        pageInfo { hasNextPage }
        nodes {
          id
          happenedAt
          reason
          sales(first: ${SALES_PER_AGREEMENT}) {
            pageInfo { hasNextPage }
            nodes {
              id
              actionType
              lineType
              quantity
              totalAmount { shopMoney { amount currencyCode } }
              totalTaxAmount { shopMoney { amount currencyCode } }
              totalDiscountAmountBeforeTaxes { shopMoney { amount currencyCode } }
            }
          }
        }
      }
    }
  }
}`;

/** Cheap order-level totals, enough for an order that was never touched again. */
export interface OrderTotals {
  id: string;
  name: string;
  createdAt: string;
  test: boolean;
  edited: boolean;
  cancelledAt: string | null;
  returnStatus: string;
  currentSubtotalLineItemsQuantity: number;
  subtotalPriceSet: MoneyBag;
  totalDiscountsSet: MoneyBag | null;
  totalTaxSet: MoneyBag | null;
  totalShippingPriceSet: MoneyBag | null;
  refunds: { id: string }[];
}

export interface SaleNode {
  id: string;
  actionType: string;
  lineType: string;
  quantity: number | null;
  totalAmount: MoneyBag;
  totalTaxAmount: MoneyBag;
  totalDiscountAmountBeforeTaxes: MoneyBag;
}

export interface AgreementNode {
  id: string;
  happenedAt: string;
  reason: string;
  sales: { pageInfo: { hasNextPage: boolean }; nodes: SaleNode[] };
}

export interface OrderLedger {
  id: string;
  name: string;
  agreements: { pageInfo: { hasNextPage: boolean }; nodes: AgreementNode[] };
}

/** One calendar day of Shopify sales, in the terms Shopify Analytics uses. */
export interface ShopifyDailySales {
  date: ISODate;
  grossSales: Money;
  discounts: Money;
  /** Net of any discount that came off with the returned items. */
  salesReversals: Money;
  /** Collected on behalf of the authorities. Never revenue. */
  taxes: Money;
  /** Shipping charged to the customer. Not part of Net Sales. */
  shippingCharges: Money;
  orders: number;
  unitsSold: number;
}

export interface ShopifySalesResult {
  days: ShopifyDailySales[];
  /** Orders returned by the window query, including ones outside the range. */
  ordersScanned: number;
  /** Orders that needed the full sales ledger. */
  ledgerOrders: number;
  /** True when a page cap was hit and the window is incomplete. */
  truncated: boolean;
}

/**
 * Whether an order's current totals can still be trusted as its whole sales
 * history. Anything that writes a second agreement disqualifies it.
 */
export function needsSalesLedger(order: OrderTotals): boolean {
  return (
    order.edited ||
    order.cancelledAt !== null ||
    order.refunds.length > 0 ||
    order.returnStatus !== "NO_RETURN"
  );
}

/** Line types that are money but are not sales: excluded from Net Sales. */
const NON_SALES_LINE_TYPES = new Set(["DUTY", "FEE", "ADDITIONAL_FEE", "TIP", "GIFT_CARD"]);

interface Bucket extends ShopifyDailySales {
  grossReversals: Money;
  discountReversals: Money;
}

function emptyBucket(date: ISODate): Bucket {
  return {
    date,
    grossSales: ZERO,
    discounts: ZERO,
    salesReversals: ZERO,
    taxes: ZERO,
    shippingCharges: ZERO,
    orders: 0,
    unitsSold: 0,
    grossReversals: ZERO,
    discountReversals: ZERO,
  };
}

/**
 * Book one sale line. `net` is the sale less its tax, which is Shopify's gross
 * less the discount allocated to it; adding the discount back recovers gross.
 * A negative gross is a reversal, and the discount reversed with it is tracked
 * separately so Net Sales stays exact.
 */
function applySale(bucket: Bucket, net: Money, discount: Money): void {
  const gross = add(net, discount);
  if (gross >= 0) {
    bucket.grossSales = add(bucket.grossSales, gross);
    bucket.discounts = add(bucket.discounts, discount);
  } else {
    bucket.grossReversals = subtract(bucket.grossReversals, gross);
    bucket.discountReversals = subtract(bucket.discountReversals, discount);
  }
}

/**
 * Roll orders and ledgers into daily totals.
 *
 * Pure, so the whole reconciliation is testable without touching the network.
 */
export function aggregateDailySales(input: {
  start: ISODate;
  end: ISODate;
  timezone: string;
  currency: CurrencyCode;
  orders: readonly OrderTotals[];
  ledgers: ReadonlyMap<string, OrderLedger>;
}): ShopifyDailySales[] {
  const { start, end, timezone, currency, orders, ledgers } = input;
  const buckets = new Map<ISODate, Bucket>();

  const bucketFor = (date: ISODate): Bucket => {
    const existing = buckets.get(date);
    if (existing) return existing;
    const created = emptyBucket(date);
    buckets.set(date, created);
    return created;
  };

  /**
   * Adjustments are netted per order and day before being booked. Shopify
   * writes a refund as an item reversal plus a balancing adjustment, and splits
   * it across two agreements; taken individually those entries would inflate
   * both gross sales and reversals. Their sum is the real adjustment — the
   * difference between what was returned and what was actually refunded.
   */
  const adjustments = new Map<string, { date: ISODate; amount: Money }>();

  for (const order of orders) {
    if (order.test) continue;

    const orderDate = dateInTimezone(order.createdAt, timezone);
    const placedInRange = orderDate >= start && orderDate <= end;
    if (placedInRange) bucketFor(orderDate).orders += 1;

    const ledger = ledgers.get(order.id);

    if (!ledger) {
      if (!placedInRange) continue;
      const bucket = bucketFor(orderDate);
      const discounts = bagToMoney(order.totalDiscountsSet, currency);
      // Shopify's subtotal is already net of discounts; gross adds them back.
      const gross = add(bagToMoney(order.subtotalPriceSet, currency), discounts);
      bucket.grossSales = add(bucket.grossSales, gross);
      bucket.discounts = add(bucket.discounts, discounts);
      bucket.taxes = add(bucket.taxes, bagToMoney(order.totalTaxSet, currency));
      bucket.shippingCharges = add(
        bucket.shippingCharges,
        bagToMoney(order.totalShippingPriceSet, currency),
      );
      bucket.unitsSold += order.currentSubtotalLineItemsQuantity ?? 0;
      continue;
    }

    for (const agreement of ledger.agreements.nodes) {
      const date = dateInTimezone(agreement.happenedAt, timezone);
      if (date < start || date > end) continue;
      const bucket = bucketFor(date);

      for (const sale of agreement.sales.nodes) {
        const amount = bagToMoney(sale.totalAmount, currency);
        const tax = bagToMoney(sale.totalTaxAmount, currency);
        const net = subtract(amount, tax);
        bucket.taxes = add(bucket.taxes, tax);

        if (sale.lineType === "SHIPPING") {
          bucket.shippingCharges = add(bucket.shippingCharges, net);
          continue;
        }
        if (NON_SALES_LINE_TYPES.has(sale.lineType)) continue;

        if (sale.lineType === "ADJUSTMENT") {
          const key = `${order.id}:${date}`;
          const running = adjustments.get(key);
          adjustments.set(key, { date, amount: add(running?.amount ?? ZERO, net) });
          continue;
        }

        applySale(bucket, net, bagToMoney(sale.totalDiscountAmountBeforeTaxes, currency));
        if (sale.lineType === "PRODUCT") bucket.unitsSold += sale.quantity ?? 0;
      }
    }
  }

  for (const { date, amount } of adjustments.values()) {
    if (amount === 0) continue;
    applySale(bucketFor(date), amount, ZERO);
  }

  return [...buckets.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map(({ grossReversals, discountReversals, ...day }) => ({
      ...day,
      salesReversals: subtract(grossReversals, discountReversals),
    }));
}

/** Net Sales = Gross Sales - Discounts - Sales Reversals. */
export function netSalesOf(day: ShopifyDailySales): Money {
  return subtract(subtract(day.grossSales, day.discounts), day.salesReversals);
}

/**
 * Read every sale that Shopify attributes to the window and roll it into days.
 *
 * The API window is widened by a day on each side, because the filters work on
 * UTC instants while the buckets are shop-local days. The surplus is discarded
 * during aggregation, so nothing lands on the wrong day or is counted twice.
 */
export async function fetchShopifySales(
  start: ISODate,
  end: ISODate,
  shop: ShopInfo,
): Promise<ShopifySalesResult> {
  if (!getShopifyConfig()) throw new ShopifyError("Shopify is not configured.", "config");

  const updatedFrom = shiftIso(`${start}T00:00:00Z`, -1);
  const createdTo = shiftIso(`${end}T23:59:59Z`, 1);
  const window = `updated_at:>='${updatedFrom}' AND created_at:<='${createdTo}'`;

  const orders: OrderTotals[] = [];
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderTotals[] };
    } = await shopifyGraphQL(ORDER_TOTALS_QUERY, {
      first: ORDER_PAGE_SIZE,
      after: cursor,
      query: window,
    });

    orders.push(...data.orders.nodes);
    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    pages += 1;

    if (cursor && pages >= MAX_ORDER_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);

  const ledgerIds = orders.filter((order) => !order.test && needsSalesLedger(order)).map((o) => o.id);
  const ledgers = new Map<string, OrderLedger>();

  for (let i = 0; i < ledgerIds.length; i += LEDGER_BATCH_SIZE) {
    if (i / LEDGER_BATCH_SIZE >= MAX_LEDGER_BATCHES) {
      truncated = true;
      break;
    }

    const ids = ledgerIds.slice(i, i + LEDGER_BATCH_SIZE);
    const data = await shopifyGraphQL<{ nodes: (OrderLedger | null)[] }>(ORDER_SALES_QUERY, { ids });

    for (const node of data.nodes) {
      if (!node) continue;
      if (node.agreements.pageInfo.hasNextPage) truncated = true;
      if (node.agreements.nodes.some((a) => a.sales.pageInfo.hasNextPage)) truncated = true;
      ledgers.set(node.id, node);
    }
  }

  const days = aggregateDailySales({
    start,
    end,
    timezone: shop.timezone,
    currency: shop.currency,
    orders,
    ledgers,
  });

  return { days, ordersScanned: orders.length, ledgerOrders: ledgers.size, truncated };
}
