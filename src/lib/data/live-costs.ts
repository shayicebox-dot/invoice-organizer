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
import { type ShopifyCogsResult, fetchShopifyCogs } from "../shopify/cogs";
import { getGrantedScopes } from "../shopify/client";

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

interface CogsCache {
  fetchedAt: number;
  result: ShopifyCogsResult;
}

const TTL_MS = 60_000;
const cogsCache = new Map<string, CogsCache>();

/** Scopes the per-SKU costing query needs beyond the revenue integration. */
const COGS_SCOPES = ["read_products", "read_inventory"] as const;

/** Whether the configured COGS mode needs Shopify line items at all. */
function needsLineItems(settings: BusinessCostSettings): boolean {
  return settings.cogs.mode !== "not_configured";
}

/**
 * Per-SKU units for the range, or `null` when unavailable. Never throws: a
 * missing scope or an API failure degrades COGS to "incomplete" rather than
 * breaking the page.
 */
async function loadShopifyCogs(
  start: ISODate,
  end: ISODate,
): Promise<{ result: ShopifyCogsResult | null; error: string | null }> {
  if (!getShopifyConfig()) {
    return { result: null, error: "Shopify is not connected, so units sold cannot be costed." };
  }

  const key = `${start}:${end}`;
  const cached = cogsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { result: cached.result, error: null };
  }

  try {
    const shop = await fetchShopInfo();
    const result = await fetchShopifyCogs(start, end, shop);
    cogsCache.set(key, { fetchedAt: Date.now(), result });
    return { result, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read Shopify line items for costing.";

    // Name the missing scope rather than the symptom. The token response tells
    // us what was granted, so this is a fact and not a guess.
    let scopeNote = "";
    try {
      const granted = await getGrantedScopes();
      if (granted.length > 0) {
        const missing = COGS_SCOPES.filter((scope) => !granted.includes(scope));
        if (missing.length > 0) {
          scopeNote = ` The Shopify app is missing ${missing.join(" and ")}; re-authorize it with those scopes.`;
        }
      } else {
        scopeNote = ` Costing needs the ${COGS_SCOPES.join(" and ")} scopes.`;
      }
    } catch {
      scopeNote = ` Costing needs the ${COGS_SCOPES.join(" and ")} scopes.`;
    }

    return { result: null, error: `${message}${scopeNote}` };
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

  const cogsResult = needsLineItems(settings)
    ? await loadShopifyCogs(start, end)
    : { result: null, error: null };

  const cogsByDate = new Map((cogsResult.result?.byDate ?? []).map((day) => [day.date, day]));

  // Units per SKU, derived from the costed lines, for the manual cost table.
  const unitsBySkuByDate = new Map<string, Record<string, number>>();
  for (const line of cogsResult.result?.lines ?? []) {
    const bucket = unitsBySkuByDate.get(line.date) ?? {};
    bucket[line.sku] = (bucket[line.sku] ?? 0) + line.quantityCosted;
    unitsBySkuByDate.set(line.date, bucket);
  }

  const volumes: DailyVolume[] = days.map((day) => ({
    date: day.date,
    orders: day.orders,
    unitsSold: day.unitsSold,
    netSales: netSales(day),
    unitsBySku: unitsBySkuByDate.get(day.date) ?? {},
    shopifyCogs: cogsByDate.get(day.date)?.cogs ?? null,
  }));

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
  if (cogsResult.error && needsLineItems(settings)) {
    issues.unshift({ section: "cogs", message: cogsResult.error, details: [] });
  }

  // SKUs Shopify sold but has no cost per item for. Named, never guessed.
  const shopifyMissing = cogsResult.result?.missingCostSkus ?? [];
  if (settings.cogs.mode === "shopify_cost_per_item" && shopifyMissing.length > 0) {
    const units = cogsResult.result?.unitsMissingCost ?? 0;
    issues.push({
      section: "cogs",
      message:
        `${shopifyMissing.length} SKU${shopifyMissing.length === 1 ? "" : "s"} sold with no cost ` +
        `per item in Shopify (${units} unit${units === 1 ? "" : "s"}). COGS understates until a ` +
        `cost is set on those variants.`,
      details: shopifyMissing,
    });
  }

  const missingSkus =
    settings.cogs.mode === "shopify_cost_per_item" ? shopifyMissing : calculation.missingSkus;

  // A cost source that returned nothing usable, or left units uncosted, must
  // not read as complete.
  const cogsSource =
    settings.cogs.mode === "shopify_cost_per_item" && shopifyMissing.length > 0
      ? "incomplete"
      : sources.cogs;

  return {
    days: applied,
    status: {
      configured: true,
      sources: { ...sources, cogs: cogsSource },
      issues,
      missingSkus,
      lineItemError: cogsResult.error,
      updatedAt: settings.updatedAt,
    },
  };
}
