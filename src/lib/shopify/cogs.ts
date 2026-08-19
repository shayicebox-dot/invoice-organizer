/**
 * Cost of goods sold, from Shopify's own cost per item.
 *
 * Every unit is costed individually: the line item names a variant, the
 * variant's inventory item carries a unit cost, and COGS is that cost times the
 * quantity. Nothing here derives a cost from revenue — a percentage of sales is
 * an estimate, and an estimate in a P&L is a number that looks like a fact.
 *
 * A variant with no cost recorded in Shopify contributes zero and its SKU is
 * reported as missing. The P&L is then marked incomplete rather than quietly
 * understating COGS, which would overstate profit.
 *
 * ## Returns
 *
 * A returned unit that went back into sellable inventory is not a cost — the
 * merchant still has the goods — so its cost is reversed. A return that was not
 * restocked (damaged, written off) stays in COGS, because the goods are gone.
 * Shopify reports this per refund line as `restockType`.
 *
 * The reversal is attributed to the *order's* date, matching how `orders.ts`
 * attributes the refunded amount. Revenue and its cost therefore reverse on the
 * same day. Both share the same known limitation — a refund issued later lands
 * on the original order's date — and fixing it means moving both together.
 *
 * Scopes: `read_orders`, `read_products` and `read_inventory`. The revenue
 * query in `orders.ts` still needs only `read_orders` and is untouched.
 */

import "server-only";

import { type CurrencyCode, type Money, ZERO, add, multiply, parseDecimalToMinor, sum } from "../money";
import type { ISODate } from "../types";
import { ShopifyError, shopifyGraphQL } from "./client";
import type { ShopInfo } from "./orders";

const PAGE_SIZE = 50;
const LINE_ITEMS_PER_ORDER = 100;
const REFUNDS_PER_ORDER = 20;
const MAX_PAGES = 40;

/** Restock types that put the unit back into sellable inventory. */
const RESTOCKED_TYPES = new Set(["RETURN", "CANCEL", "LEGACY_RESTOCK"]);

/**
 * Pack mapping needs only the SKU and titles; the inventory item's cost is
 * needed solely by the `shopify_cost_per_item` source. Asking for it always
 * would demand `read_inventory` from stores that never use it, so the field is
 * requested only when it will actually be read.
 */
function buildQuery(includeUnitCost: boolean): string {
  const inventoryItem = includeUnitCost
    ? `inventoryItem {
              unitCost { amount currencyCode }
            }`
    : "";

  return `query EcomPlCogs($first: Int!, $after: String, $query: String) {
  orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      name
      createdAt
      lineItems(first: ${LINE_ITEMS_PER_ORDER}) {
        nodes {
          id
          quantity
          sku
          title
          variant {
            id
            sku
            title
            ${inventoryItem}
          }
        }
      }
      refunds(first: ${REFUNDS_PER_ORDER}) {
        id
        createdAt
        refundLineItems(first: ${LINE_ITEMS_PER_ORDER}) {
          nodes {
            quantity
            restockType
            lineItem { id sku }
          }
        }
      }
    }
  }
}`;
}

interface LineItemNode {
  id: string;
  quantity: number;
  sku: string | null;
  title: string | null;
  variant: {
    id: string | null;
    sku: string | null;
    title: string | null;
    inventoryItem: { unitCost: { amount: string; currencyCode: string } | null } | null;
  } | null;
}

interface OrderNode {
  id: string;
  name: string;
  createdAt: string;
  lineItems: { nodes: LineItemNode[] };
  refunds: Array<{
    id: string;
    createdAt: string;
    refundLineItems: {
      nodes: Array<{
        quantity: number;
        restockType: string | null;
        lineItem: { id: string; sku: string | null } | null;
      }>;
    };
  }>;
}

/** One costed line, as printed by the verification command. */
export interface CogsLine {
  orderId: string;
  orderName: string;
  date: ISODate;
  sku: string;
  title: string;
  variantTitle: string | null;
  /** Units originally on the order. */
  quantitySold: number;
  /** Units returned to sellable inventory, whose cost is reversed. */
  quantityRestocked: number;
  /** Units the cost actually applies to. */
  quantityCosted: number;
  /** Shopify's cost per item, or `null` when the variant has none. */
  unitCost: Money | null;
  /** `unitCost` × `quantityCosted`, or zero when the cost is unknown. */
  lineCogs: Money;
}

export interface ShopifyCogsResult {
  lines: CogsLine[];
  /** Per-day totals, ready for the P&L overlay. */
  byDate: Array<{ date: ISODate; cogs: Money; unitsCosted: number; unitsMissingCost: number }>;
  totalCogs: Money;
  /** SKUs that sold but have no cost per item in Shopify. */
  missingCostSkus: string[];
  /** Units that could not be costed, across the range. */
  unitsMissingCost: number;
  truncated: boolean;
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

function toCurrency(code: string | undefined): CurrencyCode {
  const upper = (code ?? "USD").toUpperCase();
  return (["USD", "EUR", "GBP", "ILS"] as const).includes(upper as CurrencyCode)
    ? (upper as CurrencyCode)
    : "USD";
}

/**
 * Cost every unit sold in the range, reversing units that came back into
 * inventory.
 */
export async function fetchShopifyCogs(
  start: ISODate,
  end: ISODate,
  shop: ShopInfo,
  options: { includeUnitCost?: boolean } = {},
): Promise<ShopifyCogsResult> {
  const includeUnitCost = options.includeUnitCost ?? true;
  const query = buildQuery(includeUnitCost);
  const widened =
    `created_at:>='${shiftIso(`${start}T00:00:00Z`, -1)}' AND ` +
    `created_at:<='${shiftIso(`${end}T23:59:59Z`, 1)}'`;

  const lines: CogsLine[] = [];
  const missingCostSkus = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const data: {
      orders: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: OrderNode[] };
    } = await shopifyGraphQL(query, { first: PAGE_SIZE, after: cursor, query: widened });

    for (const order of data.orders.nodes) {
      const date = dateInTimezone(order.createdAt, shop.timezone);
      if (date < start || date > end) continue;

      // Units returned to inventory, keyed by the line item they came from.
      // Keying on the line item rather than the SKU keeps two lines of the
      // same SKU on one order from stealing each other's returns.
      const restockedByLine = new Map<string, number>();
      for (const refund of order.refunds ?? []) {
        for (const refundLine of refund.refundLineItems?.nodes ?? []) {
          if (!RESTOCKED_TYPES.has(refundLine.restockType ?? "")) continue;
          const lineId = refundLine.lineItem?.id;
          if (!lineId) continue;
          restockedByLine.set(
            lineId,
            (restockedByLine.get(lineId) ?? 0) + Number(refundLine.quantity ?? 0),
          );
        }
      }

      for (const item of order.lineItems.nodes) {
        const quantitySold = Number(item.quantity ?? 0);
        if (quantitySold <= 0) continue;

        const sku = item.sku ?? item.variant?.sku ?? "(no SKU)";
        const restocked = Math.min(restockedByLine.get(item.id) ?? 0, quantitySold);
        const quantityCosted = quantitySold - restocked;

        const rawCost = item.variant?.inventoryItem?.unitCost;
        const unitCost = rawCost
          ? parseDecimalToMinor(rawCost.amount, toCurrency(rawCost.currencyCode))
          : null;

        if (unitCost === null && quantityCosted > 0) missingCostSkus.add(sku);

        lines.push({
          orderId: order.id,
          orderName: order.name,
          date,
          sku,
          title: item.title ?? sku,
          variantTitle: item.variant?.title ?? null,
          quantitySold,
          quantityRestocked: restocked,
          quantityCosted,
          unitCost,
          lineCogs: unitCost === null ? ZERO : multiply(unitCost, quantityCosted),
        });
      }
    }

    cursor = data.orders.pageInfo.hasNextPage ? data.orders.pageInfo.endCursor : null;
    pages += 1;
    if (cursor && pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);

  return summariseCogs(lines, missingCostSkus, truncated);
}

/**
 * Roll costed lines into per-day totals. Exported so the arithmetic can be
 * tested without a network call.
 */
export function summariseCogs(
  lines: CogsLine[],
  missingCostSkus: Set<string>,
  truncated = false,
): ShopifyCogsResult {
  const perDay = new Map<ISODate, { date: ISODate; cogs: Money; unitsCosted: number; unitsMissingCost: number }>();
  let unitsMissingCost = 0;

  for (const line of lines) {
    const bucket = perDay.get(line.date) ?? {
      date: line.date,
      cogs: ZERO,
      unitsCosted: 0,
      unitsMissingCost: 0,
    };

    bucket.cogs = add(bucket.cogs, line.lineCogs);
    if (line.unitCost === null) {
      bucket.unitsMissingCost += line.quantityCosted;
      unitsMissingCost += line.quantityCosted;
    } else {
      bucket.unitsCosted += line.quantityCosted;
    }

    perDay.set(line.date, bucket);
  }

  const byDate = [...perDay.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    lines,
    byDate,
    totalCogs: sum(byDate.map((day) => day.cogs)),
    missingCostSkus: [...missingCostSkus].sort(),
    unitsMissingCost,
    truncated,
  };
}

export { ShopifyError };
