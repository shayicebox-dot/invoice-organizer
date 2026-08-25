import 'server-only';

import { shopifyGraphQL, type ThrottleStatus } from '@/integrations/shopify/client';
import { getShopifyConfig, HISTORICAL_ORDERS_SCOPE } from '@/integrations/shopify/config';
import {
  ORDER_REFUNDS_QUERY,
  ORDERS_DETAILED_QUERY,
  ORDERS_SUMMARY_QUERY,
} from '@/integrations/shopify/queries';
import { ShopifyResponseError } from '@/integrations/shopify/errors';
import { getAccessToken, getTokenSnapshot } from '@/integrations/shopify/token';
import {
  optionalString,
  readField,
  requireArray,
  requireBoolean,
  requireInteger,
  requireRecord,
  requireString,
} from '@/integrations/shopify/json';
import { addMoney, moneyFromDecimalString, parseCurrencyCode, zeroMoney, type Money } from '@/core/money';
import { BUSINESS_CONFIG } from '@/lib/config/business';

/**
 * Reading orders from Shopify.
 *
 * This module maps Shopify's payloads into ICEBOX types and stops there. What
 * counts as revenue, how refunds attribute to a period, and how orders bucket
 * into days are decisions for `src/core` — made once, explicitly, rather than
 * scattered across whichever screen happens to need a number.
 */

/** Line items fetched per order in one page. */
const LINE_ITEMS_PER_ORDER = 100;
const DEFAULT_PAGE_SIZE = 50;

/** Shopify's default order window without the `read_all_orders` scope. */
export const DEFAULT_ORDER_HISTORY_DAYS = 60;

export type ShopifyLineItem = {
  readonly id: string;
  /** Product name as it appeared on the order. */
  readonly title: string;
  readonly sku: string | null;
  readonly quantity: number;
  /** Unit price before any discount. */
  readonly unitPrice: Money;
  /** Line total after line-level and allocated order discounts. */
  readonly discountedTotal: Money;
  readonly productId: string | null;
  /** The variant sold — how a pack size is identified. May be null if deleted. */
  readonly variantId: string | null;
  readonly variantTitle: string | null;
};

export type ShopifyOrder = {
  readonly id: string;
  /** The order number shown to the customer, e.g. `#1042`. */
  readonly orderNumber: string;
  /** When Shopify processed the order — the instant reporting periods use. */
  readonly processedAt: string;
  readonly cancelledAt: string | null;
  /** Test orders must be excluded from every financial figure. */
  readonly isTest: boolean;
  /**
   * Whether the store's prices include tax. When true, `subtotal` — and so
   * every figure derived from it — carries VAT inside it.
   */
  readonly taxesIncluded: boolean;
  readonly financialStatus: string | null;
  /** Line items after discounts, before refunds. Includes tax if `taxesIncluded`. */
  readonly subtotal: Money;
  readonly totalDiscounts: Money;
  readonly totalRefunded: Money;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly lineItems: readonly ShopifyLineItem[];
  /** True when the order has more line items than one page returned. */
  readonly hasMoreLineItems: boolean;
};

export type OrdersPage = {
  readonly orders: readonly ShopifyOrder[];
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
  readonly throttle: ThrottleStatus | null;
};

export type FetchOrdersParams = {
  /** Inclusive start, ISO 8601 instant. */
  readonly processedAtMin: string;
  /** Inclusive end, ISO 8601 instant. */
  readonly processedAtMax: string;
  readonly pageSize?: number;
  readonly after?: string;
  /** Include test orders. Off by default — they are not real money. */
  readonly includeTestOrders?: boolean;
  /** Fetch line items. Off by default: they cost query budget. */
  readonly withLineItems?: boolean;
};

/** Build the Shopify search query string for a period. */
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

/**
 * How far back Shopify will return orders.
 *
 * Without `read_all_orders`, the `orders` connection only covers the last 60
 * days. Reporting that limit is what lets a screen say which period it is
 * really showing, instead of labelling 60 days as a year.
 */
export async function readOrderHistoryLimit(): Promise<{
  readonly historicalOrdersGranted: boolean;
  readonly windowDays: number | null;
}> {
  const config = getShopifyConfig();

  // Ensures a token exists, so the scope readback below is populated.
  await getAccessToken(config);
  const snapshot = getTokenSnapshot(config);
  const granted = snapshot?.grantedScopes ?? [];
  const historicalOrdersGranted = granted.includes(HISTORICAL_ORDERS_SCOPE);

  return {
    historicalOrdersGranted,
    windowDays: historicalOrdersGranted ? null : DEFAULT_ORDER_HISTORY_DAYS,
  };
}

/** Fetch one page of orders. Pagination is the caller's to drive. */
export async function fetchOrdersPage(params: FetchOrdersParams): Promise<OrdersPage> {
  const config = getShopifyConfig();
  const withLineItems = params.withLineItems === true;

  const response = await shopifyGraphQL({
    query: withLineItems ? ORDERS_DETAILED_QUERY : ORDERS_SUMMARY_QUERY,
    config,
    variables: {
      first: params.pageSize ?? DEFAULT_PAGE_SIZE,
      after: params.after ?? null,
      query: buildOrdersSearchQuery(params),
      ...(withLineItems ? { lineItems: LINE_ITEMS_PER_ORDER } : {}),
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

/**
 * One refund, dated by when it happened.
 *
 * `productSubtotal` is the value of the goods returned, excluding tax and
 * shipping. That is what Shopify Analytics counts as a sales reversal, and it
 * is deliberately not `totalRefundedSet` — the latter is the cash returned,
 * which also carries shipping and tax and so cannot be subtracted from a
 * product-only gross sales figure.
 */
export type ShopifyRefund = {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  /** When the refund was created — the date the reversal belongs to. */
  readonly createdAt: string;
  readonly productSubtotal: Money;
  /** Total cash returned, including shipping and tax. Kept for display only. */
  readonly totalRefunded: Money;
  /** True when the refund has more line items than one page returned. */
  readonly hasMoreLines: boolean;
};

export type FetchRefundsParams = {
  /** Orders updated at or after this instant, ISO 8601. */
  readonly updatedAtMin: string;
  readonly updatedAtMax: string;
  readonly after?: string;
};

const REFUNDS_PER_ORDER = 20;
const REFUND_LINES_PER_REFUND = 100;

/**
 * Every refund on orders touched in a window.
 *
 * Searched by `updated_at`, not `processed_at`: refunding an order updates it,
 * so this catches returns processed against orders placed long before the
 * window. The caller then keeps only the refunds whose own date falls inside
 * the reporting range.
 */
export async function fetchRefundsInWindow(
  params: FetchRefundsParams,
  maxPages = 40,
): Promise<{ readonly refunds: readonly ShopifyRefund[]; readonly complete: boolean }> {
  const config = getShopifyConfig();
  const collected: ShopifyRefund[] = [];
  let cursor: string | null = params.after ?? null;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await shopifyGraphQL({
      query: ORDER_REFUNDS_QUERY,
      config,
      variables: {
        first: DEFAULT_PAGE_SIZE,
        ...(cursor === null ? {} : { after: cursor }),
        query: `updated_at:>='${params.updatedAtMin}' AND updated_at:<='${params.updatedAtMax}' AND test:false`,
        refunds: REFUNDS_PER_ORDER,
        refundLines: REFUND_LINES_PER_REFUND,
      },
    });

    const orders = requireRecord(readField(requireRecord(response.data, 'data'), 'orders'), 'data.orders');
    const nodes = requireArray(readField(orders, 'nodes'), 'data.orders.nodes');
    const pageInfo = requireRecord(readField(orders, 'pageInfo'), 'data.orders.pageInfo');

    for (const [index, node] of nodes.entries()) {
      collected.push(...parseOrderRefunds(node, `data.orders.nodes[${index}]`));
    }

    const hasNextPage = readField(pageInfo, 'hasNextPage') === true;
    const endCursor = optionalString(readField(pageInfo, 'endCursor'), 'data.orders.pageInfo.endCursor');

    if (!hasNextPage || endCursor === null) {
      return { refunds: collected, complete: true };
    }

    cursor = endCursor;
  }

  return { refunds: collected, complete: false };
}

function parseOrderRefunds(node: unknown, path: string): readonly ShopifyRefund[] {
  const order = requireRecord(node, path);
  const orderId = requireString(readField(order, 'id'), `${path}.id`);
  const orderNumber = requireString(readField(order, 'name'), `${path}.name`);
  const refunds = readField(order, 'refunds');

  if (!Array.isArray(refunds)) return [];

  return refunds.map((refundNode, index) => {
    const refundPath = `${path}.refunds[${index}]`;
    const refund = requireRecord(refundNode, refundPath);
    const linesField = readField(refund, 'refundLineItems');
    const lines = linesField === null || linesField === undefined
      ? null
      : requireRecord(linesField, `${refundPath}.refundLineItems`);
    const lineNodes = lines === null ? [] : requireArray(readField(lines, 'nodes'), `${refundPath}.refundLineItems.nodes`);
    const linePageInfo = lines === null ? null : requireRecord(readField(lines, 'pageInfo'), `${refundPath}.refundLineItems.pageInfo`);

    const productSubtotal = lineNodes.reduce<Money>((total, lineNode, lineIndex) => {
      const line = requireRecord(lineNode, `${refundPath}.refundLineItems.nodes[${lineIndex}]`);
      return addMoney(
        total,
        parseMoneyBag(readField(line, 'subtotalSet'), `${refundPath}.refundLineItems.nodes[${lineIndex}].subtotalSet`),
      );
    }, zeroMoney(BUSINESS_CONFIG.reportingCurrency));

    return {
      id: requireString(readField(refund, 'id'), `${refundPath}.id`),
      orderId,
      orderNumber,
      createdAt: requireString(readField(refund, 'createdAt'), `${refundPath}.createdAt`),
      productSubtotal,
      totalRefunded: parseMoneyBag(readField(refund, 'totalRefundedSet'), `${refundPath}.totalRefundedSet`),
      hasMoreLines: linePageInfo !== null && readField(linePageInfo, 'hasNextPage') === true,
    };
  });
}

function parseOrder(node: unknown, path: string): ShopifyOrder {
  const order = requireRecord(node, path);
  const customer = readField(order, 'customer');
  const lineItemsField = readField(order, 'lineItems');

  const customerRecord =
    customer === null || customer === undefined ? null : requireRecord(customer, `${path}.customer`);

  const hasLineItems = lineItemsField !== null && lineItemsField !== undefined;
  const lineItems = hasLineItems ? requireRecord(lineItemsField, `${path}.lineItems`) : null;

  const lineItemNodes =
    lineItems === null ? [] : requireArray(readField(lineItems, 'nodes'), `${path}.lineItems.nodes`);

  const hasMoreLineItems =
    lineItems === null
      ? false
      : requireBoolean(
          readField(
            requireRecord(readField(lineItems, 'pageInfo'), `${path}.lineItems.pageInfo`),
            'hasNextPage',
          ),
          `${path}.lineItems.pageInfo.hasNextPage`,
        );

  return {
    id: requireString(readField(order, 'id'), `${path}.id`),
    orderNumber: requireString(readField(order, 'name'), `${path}.name`),
    processedAt: requireString(readField(order, 'processedAt'), `${path}.processedAt`),
    cancelledAt: optionalString(readField(order, 'cancelledAt'), `${path}.cancelledAt`),
    isTest: requireBoolean(readField(order, 'test'), `${path}.test`),
    taxesIncluded: requireBoolean(readField(order, 'taxesIncluded'), `${path}.taxesIncluded`),
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
    customerId:
      customerRecord === null
        ? null
        : requireString(readField(customerRecord, 'id'), `${path}.customer.id`),
    customerName:
      customerRecord === null
        ? null
        : optionalString(readField(customerRecord, 'displayName'), `${path}.customer.displayName`),
    lineItems: lineItemNodes.map((item, index) =>
      parseLineItem(item, `${path}.lineItems.nodes[${index}]`),
    ),
    hasMoreLineItems,
  };
}

function parseLineItem(node: unknown, path: string): ShopifyLineItem {
  const item = requireRecord(node, path);
  const product = readField(item, 'product');
  const variant = readField(item, 'variant');

  const productRecord =
    product === null || product === undefined ? null : requireRecord(product, `${path}.product`);

  // Shopify returns null here for a variant that has since been deleted, so the
  // line still has to be readable without one.
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
    variantTitle:
      variantRecord === null
        ? null
        : optionalString(readField(variantRecord, 'title'), `${path}.variant.title`),
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
