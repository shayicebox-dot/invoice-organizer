/**
 * The Orders page's data, entirely from Shopify.
 *
 * There is no fallback here, deliberately. Every other page degrades to
 * generated data when a provider is unreachable, which is fine for a total that
 * is labelled `mock` — but an order row is a claim about a specific transaction
 * with a specific customer. A plausible-looking invented one is not a degraded
 * answer, it is a false one. So when Shopify cannot be read this returns no
 * rows and an error, and the page says "Unavailable".
 */

import "server-only";

import { type Money, ZERO, add, scale, subtract } from "../money";
import type { ISODate } from "../types";
import { ShopifyError } from "../shopify/client";
import { getShopifyConfig, missingShopifyEnvNames } from "../shopify/config";
import { fetchShopInfo } from "../shopify/shop";
import type { ShopInfo } from "../shopify/shop";
import {
  type ShopifyOrderRow,
  fetchShopifyOrderList,
  orderNetSales,
} from "../shopify/order-list";
import { readSettings } from "../business-costs/store";
import { costLine } from "../business-costs/pack-model";
import { describeIdentity } from "../business-costs/pack-mapping";

/** One order, costed and ready to render. */
export interface LiveOrderRow extends ShopifyOrderRow {
  /** Net of the order's own discounts and refunds. */
  netSales: Money;
  /**
   * Product, shipping, storage and pick & pack for every line, from the pack
   * model. `null` when a line could not be mapped — never a partial total.
   */
  operationalCost: Money | null;
  /** The configured share of net revenue: processing, platform and app fees. */
  variableCost: Money;
  /** Net sales less operational and variable cost. `null` when cost is unknown. */
  contribution: Money | null;
  /** Lines with no box quantity, named. */
  unmappedLines: string[];
}

export interface LiveOrdersResult {
  rows: LiveOrderRow[];
  /** Display name of the connected shop. Never a placeholder. */
  storeName: string | null;
  storeDomain: string | null;
  /** False when Shopify would not supply customer names to this app. */
  customerNamesAvailable: boolean;
  /** Set when nothing could be read. The page shows "Unavailable". */
  error: string | null;
  /** Missing environment variable names, when unconfigured. */
  missing: string[];
  truncated: boolean;
  /** The rate applied for variable cost, for the column caption. */
  variableRate: number;
}

const EMPTY: LiveOrdersResult = {
  rows: [],
  storeName: null,
  storeDomain: null,
  customerNamesAvailable: false,
  error: null,
  missing: [],
  truncated: false,
  variableRate: 0,
};

interface CacheEntry {
  fetchedAt: number;
  value: LiveOrdersResult;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

let shopCache: { value: ShopInfo; fetchedAt: number } | null = null;
const SHOP_TTL_MS = 600_000;

async function getShop(): Promise<ShopInfo> {
  if (shopCache && Date.now() - shopCache.fetchedAt < SHOP_TTL_MS) return shopCache.value;
  const value = await fetchShopInfo();
  shopCache = { value, fetchedAt: Date.now() };
  return value;
}

/**
 * Recent real orders for a window, costed with the pack model.
 *
 * Never throws: a failure returns no rows and a message, which the page renders
 * instead of a table.
 */
export async function loadLiveOrders(
  start: ISODate,
  end: ISODate,
  limit: number,
): Promise<LiveOrdersResult> {
  if (!getShopifyConfig()) {
    return {
      ...EMPTY,
      error: "Shopify is not connected, so no order detail can be shown.",
      missing: missingShopifyEnvNames(),
    };
  }

  const key = `${start}:${end}:${limit}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.value;

  try {
    const [shop, settings] = await Promise.all([getShop(), readSettings()]);
    const list = await fetchShopifyOrderList(start, end, shop, limit);
    const rate = settings.packModel.variableRateOfNetRevenue;

    const rows: LiveOrderRow[] = list.rows.map((row) => {
      const netSales = orderNetSales(row);
      const variableCost = scale(netSales, rate);

      let operational: Money | null = ZERO;
      const unmappedLines: string[] = [];

      for (const line of row.lines) {
        const identity = {
          sku: line.sku,
          title: line.title,
          variantTitle: line.variantTitle,
          variantId: line.variantId,
          lineName: line.name,
        };
        const costed = costLine(settings.packModel, row.date, line.quantity, identity);
        if (costed.unmapped) {
          unmappedLines.push(describeIdentity(identity));
          // One unmapped line makes the whole order's cost unknown. A partial
          // total here would understate cost and overstate contribution.
          operational = null;
        }
        if (operational !== null) operational = add(operational, costed.operationalCost);
      }

      return {
        ...row,
        netSales,
        operationalCost: operational,
        variableCost,
        contribution:
          operational === null ? null : subtract(subtract(netSales, operational), variableCost),
        unmappedLines,
      };
    });

    const value: LiveOrdersResult = {
      rows,
      storeName: shop.name,
      storeDomain: shop.domain,
      customerNamesAvailable: list.customerNamesAvailable,
      error: null,
      missing: [],
      truncated: list.truncated,
      variableRate: rate,
    };

    cache.set(key, { fetchedAt: Date.now(), value });
    return value;
  } catch (error) {
    return {
      ...EMPTY,
      storeName: shopCache?.value.name ?? null,
      storeDomain: shopCache?.value.domain ?? null,
      error:
        error instanceof ShopifyError
          ? error.message
          : "Shopify order detail could not be loaded.",
    };
  }
}
