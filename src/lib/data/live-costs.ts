/**
 * Applying configured business costs to the P&L.
 *
 * Replaces the mock cost lines with real, merchant-supplied figures: COGS from
 * units actually sold, shipping from configured rates, processing fees from
 * the real processor terms, the Klaviyo bill, and every other expense.
 *
 * A section that is not configured keeps its mock value and is labelled `mock`
 * so nothing on screen claims to be real. A section that is configured but
 * missing an input is labelled `incomplete` and the missing pieces are named,
 * because an understated cost silently inflates profit.
 */

import "server-only";

import type { DailyFinancials } from "../finance";
import { add } from "../money";
import type { ISODate } from "../types";
import { type DailyVolume, calculateCosts } from "../business-costs/calculate";
import { readSettings } from "../business-costs/store";
import type { BusinessCostSettings, CostIssue, CostSourceMap } from "../business-costs/types";
import { netSales } from "../finance";
import { getShopifyConfig } from "../shopify/config";
import { fetchShopInfo } from "../shopify/orders";
import { fetchShopifySkuUnits } from "../shopify/line-items";

export interface BusinessCostStatus {
  configured: boolean;
  sources: CostSourceMap;
  issues: CostIssue[];
  missingSkus: string[];
  /** Set when per-SKU data was needed but could not be read. */
  lineItemError: string | null;
  updatedAt: string;
}

export const COSTS_NOT_CONFIGURED: BusinessCostStatus = {
  configured: false,
  sources: {
    cogs: "mock",
    shipping: "mock",
    paymentFees: "mock",
    klaviyo: "mock",
    otherExpenses: "mock",
  },
  issues: [],
  missingSkus: [],
  lineItemError: null,
  updatedAt: new Date(0).toISOString(),
};

interface SkuUnitsCache {
  fetchedAt: number;
  days: Awaited<ReturnType<typeof fetchShopifySkuUnits>>["days"];
}

const TTL_MS = 60_000;
const skuCache = new Map<string, SkuUnitsCache>();

/** Whether the configured COGS mode needs Shopify line items at all. */
function needsLineItems(settings: BusinessCostSettings): boolean {
  return settings.cogs.mode !== "not_configured";
}

/**
 * Per-SKU units for the range, or `null` when unavailable. Never throws: a
 * missing scope or an API failure degrades COGS to "incomplete" rather than
 * breaking the page.
 */
async function loadSkuUnits(
  start: ISODate,
  end: ISODate,
): Promise<{ days: SkuUnitsCache["days"] | null; error: string | null }> {
  if (!getShopifyConfig()) {
    return { days: null, error: "Shopify is not connected, so units sold cannot be costed." };
  }

  const key = `${start}:${end}`;
  const cached = skuCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { days: cached.days, error: null };
  }

  try {
    const shop = await fetchShopInfo();
    const { days } = await fetchShopifySkuUnits(start, end, shop);
    skuCache.set(key, { fetchedAt: Date.now(), days });
    return { days, error: null };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not read Shopify line items for per-SKU costing.";
    // read_products and read_inventory are the usual cause; say so plainly.
    return {
      days: null,
      error: `${message} Per-SKU costing needs the read_products and read_inventory scopes.`,
    };
  }
}

/**
 * Compute real costs for the range and overlay them onto the daily records.
 *
 * Only the lines that are actually configured are replaced. Everything else
 * keeps whatever it already had — mock, or a live provider figure — so this
 * composes safely with the Shopify, Meta and Google Ads overlays.
 */
export async function applyBusinessCosts(
  days: readonly DailyFinancials[],
  start: ISODate,
  end: ISODate,
): Promise<{ days: DailyFinancials[]; status: BusinessCostStatus }> {
  const settings = await readSettings();

  const anyConfigured =
    settings.cogs.mode !== "not_configured" ||
    settings.shipping.rates.length > 0 ||
    settings.shipping.fixedFees.length > 0 ||
    settings.payments.processors.length > 0 ||
    settings.klaviyo.plans.length > 0 ||
    settings.expenses.length > 0;

  if (!anyConfigured) {
    return {
      days: [...days],
      status: { ...COSTS_NOT_CONFIGURED, updatedAt: settings.updatedAt },
    };
  }

  const skuResult = needsLineItems(settings)
    ? await loadSkuUnits(start, end)
    : { days: null, error: null };

  const skuByDate = new Map((skuResult.days ?? []).map((day) => [day.date, day]));

  const volumes: DailyVolume[] = days.map((day) => {
    const sku = skuByDate.get(day.date);
    return {
      date: day.date,
      orders: day.orders,
      unitsSold: day.unitsSold,
      netSales: netSales(day),
      unitsBySku: sku?.unitsBySku ?? {},
      shopifyCogs: sku?.shopifyCogs ?? null,
    };
  });

  const calculation = calculateCosts(settings, volumes);
  const byDate = new Map(calculation.days.map((day) => [day.date, day]));
  const { sources } = calculation;

  const applied = days.map((day) => {
    const costs = byDate.get(day.date);
    if (!costs) return day;

    // Each line is replaced only when its section is genuinely configured.
    // A `mock` section keeps the generated figure it already had.
    const cogs = sources.cogs === "mock" ? day.cogs : costs.cogs;
    const shipping = sources.shipping === "mock" ? day.shipping : costs.shipping;
    const paymentFees = sources.paymentFees === "mock" ? day.paymentFees : costs.paymentFees;
    const emailSpend = sources.klaviyo === "mock" ? day.emailSpend : costs.klaviyo;
    // Configured expenses replace both mock expense lines. They are split by
    // category so Contribution Profit still means "after the costs that scaled
    // with sales" — rent does not belong above that line.
    const variableExpenses =
      sources.otherExpenses === "mock" ? day.variableExpenses : costs.variableExpenses;
    const fixedExpenses =
      sources.otherExpenses === "mock" ? day.fixedExpenses : costs.fixedExpenses;

    const marketingSpend = add(day.adSpend, emailSpend);

    return {
      ...day,
      cogs,
      shipping,
      paymentFees,
      emailSpend,
      variableExpenses,
      fixedExpenses,
      marketingSpend,
    } satisfies DailyFinancials;
  });

  const issues = [...calculation.issues];
  if (skuResult.error && needsLineItems(settings)) {
    issues.unshift({ section: "cogs", message: skuResult.error, details: [] });
  }

  return {
    days: applied,
    status: {
      configured: true,
      sources,
      issues,
      missingSkus: calculation.missingSkus,
      lineItemError: skuResult.error,
      updatedAt: settings.updatedAt,
    },
  };
}
