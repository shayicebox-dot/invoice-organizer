import 'server-only';

import { shopifyGraphQL, type ThrottleStatus } from '@/integrations/shopify/client';
import { getShopifyConfig } from '@/integrations/shopify/config';
import { ORDERS_QUERY } from '@/integrations/shopify/queries';
import { ShopifyResponseError } from '@/integrations/shopify/errors';
import {
  optionalString,
  readField,
  requireArray,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
  requireUnsignedInt64,
} from '@/integrations/shopify/json';
import { moneyFromDecimalString, parseCurrencyCode, type Money } from '@/core/money';

/**
 * Reading orders from Shopify.
 *
 * This module maps Shopify's payloads into ICEBOX types and nothing more. It
 * computes no metrics: what counts as revenue, how refunds are attributed to a
 * period, and how discounts are treated are decisions for `src/core`, made once
 * and made explicitly. Mapping here would scatter those rules across the
 * codebase — and this is not yet wired into the dashboard.
 */

/** Maximum line items fetched per order in one page. */
const LINE_ITEMS_PER_ORDER = 100;
const DEFAULT_PAGE_SIZE = 50;

export type ShopifyLineItem = {
  readonly id: string;
  /** Product name as it appeared on the order. */
  readonly title: string;
  readonly sku: string | null;
  readonly quantity: number;
  /** Unit price before any discount. */
  readonly unitPrice: Money;
  /** `unitPrice × quantity`, as reported by Shopify. */
  readonly originalTotal: Money;
  /** Line total after line-level and allocated order discounts. */
  readonly discountedTotal: Money;
  readonly productId: string | null;
  readonly variantId: string | null;
};

export type ShopifyOrder = {
  readonly id: string;
  /** The order number shown to the customer, e.g. `#1042`. */
  readonly orderNumber: string;
  readonly createdAt: string;
  /** When the order was processed — the date reporting periods should use. */
  readonly processedAt: string;
  readonly cancelledAt: string | null;
  /** Test orders must be excluded from every financial figure. */
  readonly isTest: boolean;
  readonly financialStatus: string | null;
  /** Sum of line items after discounts, before shipping and tax. */
  readonly subtotal: Money;
  readonly totalDiscounts: Money;
  readonly totalRefunded: Money;
  readonly total: Money;
  /** Total paid minus refunded, as Shopify reports it. */
  readonly netPayment: Money;
  readonly customerId: string | null;
  /**
   * The customer's lifetime order count **at query time** — not as it stood
   * when this order was placed. Usable for "is this customer new today"; a
   * point-in-time new/returning split for a historical period needs the
   * customer's order history, which arrives when orders are stored.
   */
  readonly customerLifetimeOrderCount: number | null;
  /** `true` when this is the customer's only order to date. See the caveat above. */
  readonly isFirstOrderForCustomer: boolean | null;
  readonly lineItems: readonly ShopifyLineItem[];
  /** `true` when the order has more line items than one page returned. */
  readonly hasMoreLineItems: boolean;
};

export type OrdersPage = {
  readonly orders: readonly ShopifyOrder[];
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
  readonly throttle: ThrottleStatus | null;
};

export type FetchOrdersParams = {
  /** Inclusive start, ISO 8601 with an offset, e.g. `2026-08-01T00:00:00+03:00`. */
  readonly processedAtMin: string;
  /** Inclusive end, ISO 8601 with an offset. */
  readonly processedAtMax: string;
  readonly pageSize?: number;
  readonly after?: string;
  /** Include test orders. Off by default — they are not real money. */
  readonly includeTestOrders?: boolean;
};

/**
 * Build the Shopify search query string for a period.
 *
 * Timestamps carry their offset so the boundary means the same thing on both
 * sides: "the 1st" in Asia/Jerusalem is not "the 1st" in UTC, and an order
 * placed at 00:30 local would otherwise land in the wrong month.
 */
export function buildOrdersSearchQuery(params: FetchOrdersParams): string {
  const terms = [
    `processed_at:>='${params.processedAtMin}'`,
    `processed_at:<='${params.processedAtMax}'`,
  ];

  if (params.includeTestOrders !== true) {
    terms.push('test:false');
  }

  return terms.join(' AND ');
}

/** Fetch one page of orders. Pagination is the caller's to drive. */
export async function fetchOrdersPage(params: FetchOrdersParams): Promise<OrdersPage> {
  const config = getShopifyConfig();

  const response = await shopifyGraphQL({
    query: ORDERS_QUERY,
    config,
    variables: {
      first: params.pageSize ?? DEFAULT_PAGE_SIZE,
      after: params.after ?? null,
      query: buildOrdersSearchQuery(params),
      lineItems: LINE_ITEMS_PER_ORDER,
    },
  });

  const root = requireRecord(response.data, 'data');
  const orders = requireRecord(readField(root, 'orders'), 'data.orders');
  const pageInfo = requireRecord(readField(orders, 'pageInfo'), 'data.orders.pageInfo');
  const nodes = requireArray(readField(orders, 'nodes'), 'data.orders.nodes');

  return {
    orders: nodes.map((node, index) => parseOrder(node, `data.orders.nodes[${index}]`)),
    hasNextPage: requireBoolean(readField(pageInfo, 'hasNextPage'), 'pageInfo.hasNextPage'),
    endCursor: optionalString(readField(pageInfo, 'endCursor'), 'pageInfo.endCursor'),
    throttle: response.throttle,
  };
}

/**
 * Fetch every order in a period by following the cursor.
 *
 * `maxPages` is a guard, not a limit to rely on: if it is reached the result
 * says so, so a caller can never mistake a truncated read for a complete one.
 */
export async function fetchAllOrders(
  params: FetchOrdersParams,
  maxPages = 40,
): Promise<{ readonly orders: readonly ShopifyOrder[]; readonly complete: boolean }> {
  const collected: ShopifyOrder[] = [];
  let cursor: string | null = params.after ?? null;

  for (let page = 0; page < maxPages; page += 1) {
    const result: OrdersPage = await fetchOrdersPage({
      ...params,
      ...(cursor === null ? {} : { after: cursor }),
    });

    collected.push(...result.orders);

    if (!result.hasNextPage || result.endCursor === null) {
      return { orders: collected, complete: true };
    }

    cursor = result.endCursor;
  }

  return { orders: collected, complete: false };
}

function parseOrder(node: unknown, path: string): ShopifyOrder {
  const order = requireRecord(node, path);
  const customer = readField(order, 'customer');
  const lineItems = requireRecord(readField(order, 'lineItems'), `${path}.lineItems`);
  const lineItemNodes = requireArray(readField(lineItems, 'nodes'), `${path}.lineItems.nodes`);
  const lineItemPageInfo = requireRecord(
    readField(lineItems, 'pageInfo'),
    `${path}.lineItems.pageInfo`,
  );

  const customerRecord =
    customer === null || customer === undefined ? null : requireRecord(customer, `${path}.customer`);

  const lifetimeOrderCount =
    customerRecord === null
      ? null
      : requireUnsignedInt64(
          readField(customerRecord, 'numberOfOrders'),
          `${path}.customer.numberOfOrders`,
        );

  return {
    id: requireString(readField(order, 'id'), `${path}.id`),
    orderNumber: requireString(readField(order, 'name'), `${path}.name`),
    createdAt: requireString(readField(order, 'createdAt'), `${path}.createdAt`),
    processedAt: requireString(readField(order, 'processedAt'), `${path}.processedAt`),
    cancelledAt: optionalString(readField(order, 'cancelledAt'), `${path}.cancelledAt`),
    isTest: requireBoolean(readField(order, 'test'), `${path}.test`),
    financialStatus: optionalString(
      readField(order, 'displayFinancialStatus'),
      `${path}.displayFinancialStatus`,
    ),
    subtotal: parseMoneyBag(readField(order, 'subtotalPriceSet'), `${path}.subtotalPriceSet`),
    totalDiscounts: parseMoneyBag(
      readField(order, 'totalDiscountsSet'),
      `${path}.totalDiscountsSet`,
    ),
    totalRefunded: parseMoneyBag(readField(order, 'totalRefundedSet'), `${path}.totalRefundedSet`),
    total: parseMoneyBag(readField(order, 'totalPriceSet'), `${path}.totalPriceSet`),
    netPayment: parseMoneyBag(readField(order, 'netPaymentSet'), `${path}.netPaymentSet`),
    customerId:
      customerRecord === null
        ? null
        : requireString(readField(customerRecord, 'id'), `${path}.customer.id`),
    customerLifetimeOrderCount: lifetimeOrderCount,
    isFirstOrderForCustomer: lifetimeOrderCount === null ? null : lifetimeOrderCount === 1,
    lineItems: lineItemNodes.map((item, index) =>
      parseLineItem(item, `${path}.lineItems.nodes[${index}]`),
    ),
    hasMoreLineItems: requireBoolean(
      readField(lineItemPageInfo, 'hasNextPage'),
      `${path}.lineItems.pageInfo.hasNextPage`,
    ),
  };
}

function parseLineItem(node: unknown, path: string): ShopifyLineItem {
  const item = requireRecord(node, path);
  const product = readField(item, 'product');
  const variant = readField(item, 'variant');

  const productRecord =
    product === null || product === undefined ? null : requireRecord(product, `${path}.product`);
  const variantRecord =
    variant === null || variant === undefined ? null : requireRecord(variant, `${path}.variant`);

  return {
    id: requireString(readField(item, 'id'), `${path}.id`),
    title: requireString(readField(item, 'name'), `${path}.name`),
    sku: optionalString(readField(item, 'sku'), `${path}.sku`),
    quantity: requireInteger(readField(item, 'quantity'), `${path}.quantity`),
    unitPrice: parseMoneyBag(
      readField(item, 'originalUnitPriceSet'),
      `${path}.originalUnitPriceSet`,
    ),
    originalTotal: parseMoneyBag(readField(item, 'originalTotalSet'), `${path}.originalTotalSet`),
    discountedTotal: parseMoneyBag(
      readField(item, 'discountedTotalSet'),
      `${path}.discountedTotalSet`,
    ),
    productId:
      productRecord === null
        ? null
        : requireString(readField(productRecord, 'id'), `${path}.product.id`),
    variantId:
      variantRecord === null
        ? null
        : requireString(readField(variantRecord, 'id'), `${path}.variant.id`),
  };
}

/**
 * Read a `MoneyBag`'s `shopMoney` into `Money`.
 *
 * Shopify sends amounts as decimal strings; they are parsed to integer minor
 * units without ever becoming a float. An unmodelled currency is an error, not
 * something to coerce into ILS.
 */
function parseMoneyBag(value: unknown, path: string): Money {
  const bag = requireRecord(value, path);
  const shopMoney = requireRecord(readField(bag, 'shopMoney'), `${path}.shopMoney`);
  const amount = requireString(readField(shopMoney, 'amount'), `${path}.shopMoney.amount`);
  const currencyCode = requireString(
    readField(shopMoney, 'currencyCode'),
    `${path}.shopMoney.currencyCode`,
  );

  const currency = parseCurrencyCode(currencyCode);

  if (currency === null) {
    throw new ShopifyResponseError(
      `Unsupported currency "${currencyCode}" at ${path}. Add it to CurrencyCode before importing these orders.`,
    );
  }

  return moneyFromDecimalString(amount, currency);
}
