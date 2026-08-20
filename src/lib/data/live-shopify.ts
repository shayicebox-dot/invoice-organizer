/**
 * Overlaying real Shopify data onto the mock P&L.
 *
 * This is the one place where live and mock data meet. It replaces the revenue
 * fields for each day — gross sales, discounts, sales reversals, taxes, order
 * count and units sold — and leaves every cost line untouched. COGS, shipping,
 * payment fees, ad spend, email platform cost and expenses all remain mock
 * until their own integrations land.
 *
 * A failure here is never fatal: the dashboard falls back to the mock series
 * and reports why, so a Shopify outage degrades the numbers rather than the
 * page.
 */

import "server-only";

import type { DailyFinancials } from "../finance";
import { ZERO } from "../money";
import type { ISODate } from "../types";
import { ShopifyError } from "../shopify/client";
import { getShopifyConfig, missingShopifyEnvNames } from "../shopify/config";
import { type ShopInfo, fetchShopInfo } from "../shopify/shop";
import { type ShopifyDailySales, fetchShopifySales } from "../shopify/sales";

export type ShopifyConnectionState = "connected" | "not_configured" | "error";

export interface ShopifyStatus {
  state: ShopifyConnectionState;
  /** Shop display name, once a call has succeeded. */
  shopName: string | null;
  shopDomain: string | null;
  timezone: string | null;
  /** Safe to render — contains no credential material. */
  message: string | null;
  /** Missing environment variable names, when unconfigured. */
  missing: string[];
  lastSyncedAt: string | null;
  /** True when a page cap was hit and the window is incomplete. */
  truncated: boolean;
  ordersFetched: number;
  /** Orders that needed the full Shopify sales ledger (edited or returned). */
  ledgerOrders: number;
}

export const NOT_CONFIGURED: ShopifyStatus = {
  state: "not_configured",
  shopName: null,
  shopDomain: null,
  timezone: null,
  message: null,
  missing: [],
  lastSyncedAt: null,
  truncated: false,
  ordersFetched: 0,
  ledgerOrders: 0,
};

interface CacheEntry {
  fetchedAt: number;
  days: ShopifyDailySales[];
  status: ShopifyStatus;
}

/**
 * Short-lived cache. A dashboard render touches the same window several times
 * (KPIs, charts, table); without this each render would re-query Shopify.
 */
const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/** Cached shop metadata — timezone and currency change very rarely. */
let shopInfoCache: { value: ShopInfo; fetchedAt: number } | null = null;
const SHOP_INFO_TTL_MS = 600_000;

async function getShopInfo(): Promise<ShopInfo> {
  if (shopInfoCache && Date.now() - shopInfoCache.fetchedAt < SHOP_INFO_TTL_MS) {
    return shopInfoCache.value;
  }
  const value = await fetchShopInfo();
  shopInfoCache = { value, fetchedAt: Date.now() };
  return value;
}

function describeError(error: unknown): string {
  if (error instanceof ShopifyError) return error.message;
  return "Unexpected error while reading from Shopify.";
}

/**
 * Real daily sales for a window, or `null` when Shopify is unavailable.
 * Never throws — the caller always gets a usable status.
 */
export async function loadShopifySales(
  start: ISODate,
  end: ISODate,
): Promise<{ days: ShopifyDailySales[] | null; status: ShopifyStatus }> {
  if (!getShopifyConfig()) {
    return { days: null, status: { ...NOT_CONFIGURED, missing: missingShopifyEnvNames() } };
  }

  const key = `${start}:${end}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { days: cached.days, status: cached.status };
  }

  try {
    const shop = await getShopInfo();
    const { days, ordersScanned, ledgerOrders, truncated } = await fetchShopifySales(
      start,
      end,
      shop,
    );

    const status: ShopifyStatus = {
      state: "connected",
      shopName: shop.name,
      shopDomain: shop.domain,
      timezone: shop.timezone,
      message: null,
      missing: [],
      lastSyncedAt: new Date().toISOString(),
      truncated,
      ordersFetched: ordersScanned,
      ledgerOrders,
    };

    cache.set(key, { fetchedAt: Date.now(), days, status });
    return { days, status };
  } catch (error) {
    return {
      days: null,
      status: {
        ...NOT_CONFIGURED,
        state: "error",
        shopName: shopInfoCache?.value.name ?? null,
        shopDomain: shopInfoCache?.value.domain ?? null,
        message: describeError(error),
      },
    };
  }
}

/**
 * Replace the revenue and order fields of each mock day with the real ones.
 *
 * Days the shop had no orders are zeroed rather than left with mock revenue —
 * a quiet day is a real result, and carrying mock sales into it would be a
 * fabricated number.
 */
export function applyShopifySales(
  mockDays: readonly DailyFinancials[],
  liveDays: readonly ShopifyDailySales[],
): DailyFinancials[] {
  const byDate = new Map(liveDays.map((day) => [day.date, day]));

  return mockDays.map((day) => {
    const live = byDate.get(day.date);
    return {
      ...day,
      grossSales: live ? live.grossSales : ZERO,
      discounts: live ? live.discounts : ZERO,
      salesReversals: live ? live.salesReversals : ZERO,
      taxes: live ? live.taxes : ZERO,
      orders: live ? live.orders : 0,
      unitsSold: live ? live.unitsSold : 0,
    } satisfies DailyFinancials;
  });
}

/**
 * Status only — fetches shop metadata without pulling orders. Used by the
 * Connections page, where the cost of a full order sync is not warranted.
 */
export async function probeShopifyStatus(): Promise<ShopifyStatus> {
  if (!getShopifyConfig()) {
    return { ...NOT_CONFIGURED, missing: missingShopifyEnvNames() };
  }

  try {
    const shop = await getShopInfo();
    return {
      ...NOT_CONFIGURED,
      state: "connected",
      shopName: shop.name,
      shopDomain: shop.domain,
      timezone: shop.timezone,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { ...NOT_CONFIGURED, state: "error", message: describeError(error) };
  }
}

/** Which figures on screen are live, for the UI's source labelling. */
export const LIVE_FIELDS = [
  "Gross sales",
  "Discounts",
  "Sales reversals",
  "Taxes",
  "Orders",
  "Units sold",
] as const;
