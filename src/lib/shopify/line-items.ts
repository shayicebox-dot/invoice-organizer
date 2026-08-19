/**
 * Per-SKU units sold, for costing goods against configured unit costs.
 *
 * Additive: the existing revenue query in `orders.ts` is untouched and keeps
 * working on `read_orders` alone. This query is used only when COGS is
 * configured to need it, because it costs two extra scopes:
 * `read_products` and `read_inventory` (the latter for Shopify's own cost per
 * item). A store that has not granted them keeps its revenue integration and
 * simply reports COGS as missing.
 *
 * Days are bucketed in the shop's time zone, exactly as `orders.ts` does, so
 * a unit is costed on the same day its revenue is booked.
 */

import "server-only";

import { type Money, ZERO, add, multiply, parseDecimalToMinor } from "../money";
import type { CurrencyCode } from "../money";
import type { ISODate } from "../types";
import { ShopifyError, shopifyGraphQL } from "./client";
import type { ShopInfo } from "./orders";

const PAGE_SIZE = 50;
const LINE_ITEMS_PER_ORDER = 100;
const MAX_PAGES = 25;

const LINE_ITEMS_QUERY = `query EcomPlLineItems($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      createdAt
      lineItems(first: ${LINE_ITEMS_PER_ORDER}) {
        nodes {
          quantity
          sku
          variant {
            sku
            inventoryItem {
              unitCost { amount currencyCode }
            }
          }
        }
      }
    }
  }
}`;

interface LineItemNode {
  quantity: number;
  sku: string | null;
  variant: {
    sku: string | null;
    inventoryItem: { unitCost: { amount: string; currencyCode: string } | null } | null;
  } | null;
}

interface OrderNode {
  id: string;
  createdAt: string;
  lineItems: { nodes: LineItemNode[] };
}

export interface DailySkuUnits {
  date: ISODate;
  /** Units sold per SKU. */
  unitsBySku: Record<string, number>;
  /**
   * COGS from Shopify's own cost per item, for the units that carried one.
   * `null` when no line item on that day had a cost recorded.
   */
  shopifyCogs: Money | null;
  /** Units whose variant had no cost per item set in Shopify. */
  unitsWithoutCost: number;
}

function dateInTimezone(instant: string, timezone: string): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}

function shiftIso(instant: string, days: number): string {
  const date = new Date(instant);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Units sold per SKU per day, plus Shopify's own cost of those units when it
 * has one recorded.
 */
export async function fetchShopifySkuUnits(
  start: ISODate,
  end: ISODate,
  shop: ShopInfo,
): Promise<{ days: DailySkuUnits[]; truncated: boolean }> {
  const widened =
    `created_at:>='${shiftIso(`${start}T00:00:00Z`, -1)}' AND ` +
    `created_at:<='${shiftIso(`${end}T23:59:59Z`, 1)}'`;

  const byDate = new Map<ISODate, DailySkuUnits & { costedUnits: number }>();
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
    } = await shopifyGraphQL(LINE_ITEMS_QUERY, {
      first: PAGE_SIZE,
      after: cursor,
      query: widened,
    });

    for (const order of data.orders.nodes) {
      const date = dateInTimezone(order.createdAt, shop.timezone);
      if (date < start || date > end) continue;

      const bucket = byDate.get(date) ?? {
        date,
        unitsBySku: {},
        shopifyCogs: null,
        unitsWithoutCost: 0,
        costedUnits: 0,
      };

      for (const item of order.lineItems.nodes) {
        const quantity = Number(item.quantity ?? 0);
        if (quantity <= 0) continue;

        // A line item without a SKU cannot be costed against a SKU table; it
        // is grouped under a stable placeholder so the merchant can see it.
        const sku = item.sku ?? item.variant?.sku ?? "(no SKU)";
        bucket.unitsBySku[sku] = (bucket.unitsBySku[sku] ?? 0) + quantity;

        const unitCost = item.variant?.inventoryItem?.unitCost;
        if (unitCost) {
          const cost = parseDecimalToMinor(
            unitCost.amount,
            (unitCost.currencyCode.toUpperCase() as CurrencyCode) ?? "USD",
          );
          bucket.shopifyCogs = add(bucket.shopifyCogs ?? ZERO, multiply(cost, quantity));
          bucket.costedUnits += quantity;
        } else {
          bucket.unitsWithoutCost += quantity;
        }
      }

      byDate.set(date, bucket);
    }

    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    pages += 1;
    if (cursor && pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);

  const days = [...byDate.values()]
    .map(({ costedUnits, ...day }) => {
      void costedUnits;
      return day;
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  return { days, truncated };
}

export { ShopifyError };
