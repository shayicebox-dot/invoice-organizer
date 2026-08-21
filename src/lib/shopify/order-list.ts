/**
 * Real orders, one row each, for the Orders page.
 *
 * Separate from `sales.ts` on purpose. That module reconciles revenue against
 * Shopify Analytics and dates every sale by the ledger entry that produced it;
 * this one answers a different question — "what does order #3157 look like?" —
 * and reads the order's own current totals, which is what a merchant sees when
 * they open it in Shopify admin.
 *
 * The two will not tie out to the cent over a period, and that is correct
 * rather than a defect: an item added to a June order in August is August
 * revenue in the P&L and part of that June order on this page. The page says
 * so.
 *
 * ## Customer names
 *
 * A customer's name is protected data. Shopify grants it only to apps with
 * `read_customers` *and* approval for protected customer data, so this asks for
 * it only when the scope is present, and falls back to a query without the
 * field if Shopify refuses. Nothing is ever invented: an order with no name
 * available is a guest, and says so.
 *
 * Scopes: `read_orders` and `read_products`, plus `read_customers` when
 * available.
 */

import "server-only";

import { type CurrencyCode, type Money, ZERO, add, subtract } from "../money";
import type { ISODate } from "../types";
import { ShopifyError, hasScope, shopifyGraphQL } from "./client";
import { getShopifyConfig } from "./config";
import { maxPagesFor } from "./limits";
import { type ShopInfo, bagToMoney, dateInTimezone, shiftIso } from "./shop";

const PAGE_SIZE = 50;
const LINE_ITEMS_PER_ORDER = 100;
const MAX_PAGES = maxPagesFor(PAGE_SIZE);

function buildQuery(includeCustomer: boolean): string {
  const customer = includeCustomer ? "customer { displayName }" : "";

  return `query EcomPlOrderList($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      createdAt
      displayFinancialStatus
      cancelledAt
      test
      ${customer}
      currentSubtotalLineItemsQuantity
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      lineItems(first: ${LINE_ITEMS_PER_ORDER}) {
        nodes {
          id
          quantity
          sku
          name
          title
          variantTitle
          variant { id sku title }
        }
      }
    }
  }
}`;
}

export interface ShopifyOrderLine {
  id: string;
  quantity: number;
  sku: string | null;
  name: string | null;
  title: string | null;
  variantTitle: string | null;
  variantId: string | null;
}

/** One real order, in the terms the Orders page renders. */
export interface ShopifyOrderRow {
  id: string;
  /** Shopify's own order number, e.g. `#3157`. */
  orderNumber: string;
  date: ISODate;
  createdAt: string;
  /** The real customer name, or `null` when Shopify did not supply one. */
  customerName: string | null;
  status: string;
  cancelled: boolean;
  currency: CurrencyCode;
  itemCount: number;
  /** Line value before discounts. */
  grossSales: Money;
  discounts: Money;
  refunded: Money;
  taxes: Money;
  lines: ShopifyOrderLine[];
}

export interface ShopifyOrderListResult {
  rows: ShopifyOrderRow[];
  /** False when Shopify would not supply customer names for this app. */
  customerNamesAvailable: boolean;
  truncated: boolean;
}

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  cancelledAt: string | null;
  test: boolean;
  customer?: { displayName?: string | null } | null;
  currentSubtotalLineItemsQuantity: number;
  subtotalPriceSet: { shopMoney: { amount: string; currencyCode?: string } };
  totalDiscountsSet: { shopMoney: { amount: string } } | null;
  totalRefundedSet: { shopMoney: { amount: string } } | null;
  totalTaxSet: { shopMoney: { amount: string } } | null;
  lineItems: {
    nodes: Array<{
      id: string;
      quantity: number;
      sku: string | null;
      name: string | null;
      title: string | null;
      variantTitle: string | null;
      variant: { id: string | null; sku: string | null; title: string | null } | null;
    }>;
  };
}

/**
 * Orders created in the window, newest first.
 *
 * `limit` caps how many rows are built, but paging still stops as soon as the
 * cap is reached rather than reading the whole range — this is a list view, not
 * a reconciliation.
 */
export async function fetchShopifyOrderList(
  start: ISODate,
  end: ISODate,
  shop: ShopInfo,
  limit: number,
): Promise<ShopifyOrderListResult> {
  if (!getShopifyConfig()) throw new ShopifyError("Shopify is not configured.", "config");

  let includeCustomer = false;
  try {
    includeCustomer = (await hasScope("read_customers")) === true;
  } catch {
    includeCustomer = false;
  }

  const window =
    `created_at:>='${shiftIso(`${start}T00:00:00Z`, -1)}' AND ` +
    `created_at:<='${shiftIso(`${end}T23:59:59Z`, 1)}'`;

  const run = async (withCustomer: boolean) => {
    const query = buildQuery(withCustomer);
    const rows: ShopifyOrderRow[] = [];
    let cursor: string | null = null;
    let pages = 0;
    let truncated = false;

    do {
      const data: {
        orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
      } = await shopifyGraphQL(query, { first: PAGE_SIZE, after: cursor, query: window });

      for (const node of data.orders.nodes) {
        if (node.test) continue;
        const date = dateInTimezone(node.createdAt, shop.timezone);
        if (date < start || date > end) continue;

        const currency = shop.currency;
        const discounts = bagToMoney(node.totalDiscountsSet, currency);
        const subtotal = bagToMoney(node.subtotalPriceSet, currency);

        rows.push({
          id: node.id,
          orderNumber: node.name,
          date,
          createdAt: node.createdAt,
          // Shopify returns an empty display name for a guest checkout, which
          // is a fact about the order rather than a gap to paper over.
          customerName: node.customer?.displayName?.trim() || null,
          status: node.displayFinancialStatus ?? "UNKNOWN",
          cancelled: node.cancelledAt !== null,
          currency,
          itemCount: node.currentSubtotalLineItemsQuantity ?? 0,
          // Shopify's subtotal is already net of discounts; gross adds them back.
          grossSales: add(subtotal, discounts),
          discounts,
          refunded: bagToMoney(node.totalRefundedSet, currency),
          taxes: bagToMoney(node.totalTaxSet, currency),
          lines: node.lineItems.nodes.map((line) => ({
            id: line.id,
            quantity: line.quantity,
            sku: line.sku ?? line.variant?.sku ?? null,
            name: line.name,
            title: line.title,
            variantTitle: line.variantTitle ?? line.variant?.title ?? null,
            variantId: line.variant?.id ?? null,
          })),
        });

        if (rows.length >= limit) break;
      }

      if (rows.length >= limit) break;

      cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
      pages += 1;
      if (cursor && pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    } while (cursor);

    return { rows, truncated };
  };

  if (includeCustomer) {
    try {
      const result = await run(true);
      return { ...result, customerNamesAvailable: true };
    } catch {
      // The scope is granted but Shopify still declined the field — protected
      // customer data needs approval as well. Retry without it rather than
      // failing the page, and say that names are unavailable.
      const result = await run(false);
      return { ...result, customerNamesAvailable: false };
    }
  }

  const result = await run(false);
  return { ...result, customerNamesAvailable: false };
}

/** Net revenue for one order: gross less its own discounts and refunds. */
export function orderNetSales(row: ShopifyOrderRow): Money {
  return subtract(subtract(row.grossSales, row.discounts), row.refunded);
}

export { ZERO };
