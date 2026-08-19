/**
 * Fetching real orders from the Shopify Admin GraphQL API.
 *
 * Both operations below were validated against the published Admin schema.
 * The only scope required is `read_orders` — no customer field is selected, so
 * the integration reads no personal data.
 *
 * Orders are bucketed into calendar days using the shop's own reporting
 * timezone, which is what the merchant sees in Shopify's own analytics. Doing
 * this in UTC would move late-evening orders into the following day.
 */

import "server-only";

import { type Money, ZERO, add, parseDecimalToMinor, subtract } from "../money";
import type { CurrencyCode } from "../money";
import type { ISODate } from "../types";
import { ShopifyError, shopifyGraphQL } from "./client";
import { getShopifyConfig } from "./config";

/** Orders per page. Well inside the Admin API's cost budget for this shape. */
const PAGE_SIZE = 100;
/** Hard stop, so a wide range can never loop indefinitely. */
const MAX_PAGES = 25;

const SHOP_QUERY = `query EcomPlShop {
  shop {
    name
    myshopifyDomain
    ianaTimezone
    currencyCode
  }
}`;

const ORDERS_QUERY = `query EcomPlOrders($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      id
      name
      createdAt
      displayFinancialStatus
      currentSubtotalLineItemsQuantity
      subtotalPriceSet { shopMoney { amount currencyCode } }
      totalDiscountsSet { shopMoney { amount currencyCode } }
      totalRefundedSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
    }
  }
}`;

export interface ShopInfo {
  name: string;
  domain: string;
  timezone: string;
  currency: CurrencyCode;
}

interface MoneyBag {
  shopMoney: { amount: string; currencyCode: string };
}

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string | null;
  currentSubtotalLineItemsQuantity: number;
  subtotalPriceSet: MoneyBag;
  totalDiscountsSet: MoneyBag | null;
  totalRefundedSet: MoneyBag | null;
  totalShippingPriceSet: MoneyBag | null;
  totalTaxSet: MoneyBag | null;
}

/** One day of real Shopify sales, in the same units the P&L engine uses. */
export interface ShopifyDailySales {
  date: ISODate;
  grossSales: Money;
  discounts: Money;
  refunds: Money;
  orders: number;
  unitsSold: number;
}

const SUPPORTED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "ILS"];

function toCurrency(code: string): CurrencyCode {
  const upper = code.toUpperCase() as CurrencyCode;
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : "USD";
}

function bagToMoney(bag: MoneyBag | null, currency: CurrencyCode): Money {
  if (!bag) return ZERO;
  return parseDecimalToMinor(bag.shopMoney.amount, currency);
}

export async function fetchShopInfo(): Promise<ShopInfo> {
  const data = await shopifyGraphQL<{
    shop: { name: string; myshopifyDomain: string; ianaTimezone: string; currencyCode: string };
  }>(SHOP_QUERY);

  return {
    name: data.shop.name,
    domain: data.shop.myshopifyDomain,
    timezone: data.shop.ianaTimezone,
    currency: toCurrency(data.shop.currencyCode),
  };
}

/**
 * Format an instant as a calendar date in the shop's timezone. `en-CA` yields
 * `YYYY-MM-DD`, which is the format used everywhere else in the app.
 */
function dateInTimezone(instant: string, timezone: string): ISODate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(instant));
}

/**
 * Pull every order created in the window and roll it into daily totals.
 *
 * The API is queried one day wider on each side than requested, because the
 * filter works on UTC instants while the buckets are in shop-local days. The
 * surplus is discarded after bucketing, so no order lands in the wrong day and
 * none is double counted.
 */
export async function fetchShopifyDailySales(
  start: ISODate,
  end: ISODate,
  shop: ShopInfo,
): Promise<{ days: ShopifyDailySales[]; orderCount: number; truncated: boolean }> {
  const config = getShopifyConfig();
  if (!config) throw new ShopifyError("Shopify is not configured.", "config");

  const filterStart = `${start}T00:00:00Z`;
  const filterEnd = `${end}T23:59:59Z`;
  const widened = `created_at:>='${shiftIso(filterStart, -1)}' AND created_at:<='${shiftIso(filterEnd, 1)}'`;

  const totals = new Map<ISODate, ShopifyDailySales>();
  let cursor: string | null = null;
  let pages = 0;
  let orderCount = 0;
  let truncated = false;

  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
    } = await shopifyGraphQL(ORDERS_QUERY, {
      first: PAGE_SIZE,
      after: cursor,
      query: widened,
    });

    for (const node of data.orders.nodes) {
      const date = dateInTimezone(node.createdAt, shop.timezone);
      if (date < start || date > end) continue;

      const currency = toCurrency(node.subtotalPriceSet.shopMoney.currencyCode);
      const subtotal = bagToMoney(node.subtotalPriceSet, currency);
      const discounts = bagToMoney(node.totalDiscountsSet, currency);
      const refunds = bagToMoney(node.totalRefundedSet, currency);

      const bucket = totals.get(date) ?? {
        date,
        grossSales: ZERO,
        discounts: ZERO,
        refunds: ZERO,
        orders: 0,
        unitsSold: 0,
      };

      // Shopify's subtotal is already net of discounts. The P&L ladder starts
      // from gross, so the discount is added back and subtracted again there.
      bucket.grossSales = add(bucket.grossSales, add(subtotal, discounts));
      bucket.discounts = add(bucket.discounts, discounts);
      bucket.refunds = add(bucket.refunds, refunds);
      bucket.orders += 1;
      bucket.unitsSold += node.currentSubtotalLineItemsQuantity ?? 0;

      totals.set(date, bucket);
      orderCount += 1;
    }

    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    pages += 1;

    if (cursor && pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);

  const days = [...totals.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { days, orderCount, truncated };
}

/** Shift an ISO instant by whole days, used to widen the query window. */
function shiftIso(instant: string, days: number): string {
  const date = new Date(instant);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Exported for the reconciliation note in the UI. */
export function netSalesOf(day: ShopifyDailySales): Money {
  return subtract(subtract(day.grossSales, day.discounts), day.refunds);
}
