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
import { type Money, ZERO, add } from "../money";
import type { ISODate } from "../types";
import { type DailyVolume, calculateCosts } from "../business-costs/calculate";
import { readSettings } from "../business-costs/store";
import type { BusinessCostSettings, CostIssue, CostSourceMap } from "../business-costs/types";
import { netSales } from "../finance";
import { getShopifyConfig } from "../shopify/config";
import { fetchShopInfo } from "../shopify/shop";
import { type ShopifyCogsResult, fetchShopifyCogs } from "../shopify/cogs";
import { costLine } from "../business-costs/pack-model";
import { buildIdentityInventory, unmappedRows } from "../business-costs/inventory";
import { describeIdentity } from "../business-costs/pack-mapping";
import type { LineIdentity } from "../business-costs/pack-mapping";
import type { IdentityInput, ProductIdentityRow } from "../business-costs/inventory";
import type { PackMappingEntry } from "../business-costs/pack-model";
import { NO_SKU } from "../shopify/cogs";
import { getGrantedScopes } from "../shopify/client";

export interface BusinessCostStatus {
  configured: boolean;
  sources: CostSourceMap;
  issues: CostIssue[];
  missingSkus: string[];
  /** Set when per-SKU data was needed but could not be read. */
  lineItemError: string | null;
  /**
   * False when any order line in the range has no pack assignment.
   *
   * While this is false the P&L is INCOMPLETE and every profit figure is
   * withheld. A partial cost total makes profit look better than it is, which
   * is worse than showing no profit at all.
   */
  mappingComplete: boolean;
  /** The identities that need assigning, worst first. */
  unmapped: ProductIdentityRow[];
  unmappedLineItems: number;
  unmappedQuantity: number;
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
  mappingComplete: true,
  unmapped: [],
  unmappedLineItems: 0,
  unmappedQuantity: 0,
  updatedAt: new Date(0).toISOString(),
};

interface CogsCache {
  fetchedAt: number;
  result: ShopifyCogsResult;
}

const TTL_MS = 60_000;
const cogsCache = new Map<string, CogsCache>();

/**
 * Scopes the costing query needs beyond the revenue integration. Pack mapping
 * reads only SKUs and titles, so it needs one fewer than cost-per-item does.
 */
const PACK_SCOPES = ["read_products"] as const;
const UNIT_COST_SCOPES = ["read_products", "read_inventory"] as const;

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
  includeUnitCost: boolean,
): Promise<{ result: ShopifyCogsResult | null; error: string | null }> {
  if (!getShopifyConfig()) {
    return { result: null, error: "Shopify is not connected, so units sold cannot be costed." };
  }

  const key = `${start}:${end}:${includeUnitCost ? "cost" : "packs"}`;
  const cached = cogsCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { result: cached.result, error: null };
  }

  try {
    const shop = await fetchShopInfo();
    const result = await fetchShopifyCogs(start, end, shop, { includeUnitCost });
    cogsCache.set(key, { fetchedAt: Date.now(), result });
    return { result, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not read Shopify line items for costing.";

    // Name the missing scope rather than the symptom. The token response tells
    // us what was granted, so this is a fact and not a guess.
    let scopeNote = "";
    try {
      const needed = includeUnitCost ? UNIT_COST_SCOPES : PACK_SCOPES;
      const granted = await getGrantedScopes();
      if (granted.length > 0) {
        const missing = needed.filter((scope) => !granted.includes(scope));
        if (missing.length > 0) {
          scopeNote = ` The Shopify app is missing ${missing.join(" and ")}; re-authorize it with those scopes.`;
        }
      } else {
        scopeNote = ` Costing needs the ${needed.join(" and ")} scope${needed.length > 1 ? "s" : ""}.`;
      }
    } catch {
      const needed = includeUnitCost ? UNIT_COST_SCOPES : PACK_SCOPES;
      scopeNote = ` Costing needs the ${needed.join(" and ")} scope${needed.length > 1 ? "s" : ""}.`;
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

  // Only the cost-per-item source reads the inventory item, so only it needs
  // read_inventory. The pack model gets by with read_products.
  const cogsResult = needsLineItems(settings)
    ? await loadShopifyCogs(start, end, settings.cogs.mode === "shopify_cost_per_item")
    : { result: null, error: null };

  const cogsByDate = new Map((cogsResult.result?.byDate ?? []).map((day) => [day.date, day]));

  // Units per SKU, derived from the costed lines, for the manual cost table.
  const unitsBySkuByDate = new Map<string, Record<string, number>>();
  for (const line of cogsResult.result?.lines ?? []) {
    const bucket = unitsBySkuByDate.get(line.date) ?? {};
    bucket[line.sku] = (bucket[line.sku] ?? 0) + line.quantityCosted;
    unitsBySkuByDate.set(line.date, bucket);
  }

  // Pack costing: each line is resolved to a 10, 20 or 50 pack and costed at
  // that pack's flat operational cost. A line that cannot be resolved
  // contributes nothing, is named, and blocks the profit figures entirely.
  const packByDate = new Map<string, Money>();
  const unmappedByDate = new Map<string, Set<string>>();
  const identityInputs: IdentityInput[] = [];

  if (settings.cogs.mode === "pack_cost_model") {
    for (const line of cogsResult.result?.lines ?? []) {
      const identity = identityOf(line);
      identityInputs.push({ ...identity, date: line.date, quantity: line.quantityCosted });

      const costed = costLine(settings.packModel, line.date, line.quantityCosted, identity);
      packByDate.set(line.date, add(packByDate.get(line.date) ?? ZERO, costed.operationalCost));

      if (costed.unmapped) {
        const dayBucket = unmappedByDate.get(line.date) ?? new Set<string>();
        dayBucket.add(describeIdentity(identity));
        unmappedByDate.set(line.date, dayBucket);
      }
    }
  }

  const inventory = buildIdentityInventory(settings.packModel, identityInputs);
  const unmappedList = unmappedRows(inventory);
  const unmappedQuantity = unmappedList.reduce((acc, row) => acc + row.quantity, 0);
  const unmappedLineItems = unmappedList.reduce((acc, row) => acc + row.lineItems, 0);

  const packAvailable = cogsResult.result !== null;

  const volumes: DailyVolume[] = days.map((day) => ({
    date: day.date,
    orders: day.orders,
    unitsSold: day.unitsSold,
    netSales: netSales(day),
    unitsBySku: unitsBySkuByDate.get(day.date) ?? {},
    shopifyCogs: cogsByDate.get(day.date)?.cogs ?? null,
    packOperationalCost: packAvailable ? (packByDate.get(day.date) ?? ZERO) : null,
    unmappedLines: [...(unmappedByDate.get(day.date) ?? [])],
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

  // Products that could not be resolved to a pack. Named, never guessed.
  if (settings.cogs.mode === "pack_cost_model" && unmappedList.length > 0) {
    issues.push({
      section: "cogs",
      message:
        `P&L INCOMPLETE — ${unmappedList.length} historical product${unmappedList.length === 1 ? "" : "s"} ` +
        `${unmappedList.length === 1 ? "is" : "are"} not mapped to a 10, 20 or 50 pack ` +
        `(${unmappedLineItems} line item${unmappedLineItems === 1 ? "" : "s"}, ` +
        `${unmappedQuantity} pack${unmappedQuantity === 1 ? "" : "s"}). ` +
        `Profit is withheld until they are assigned on the Historical Product Mapping page.`,
      details: unmappedList.map(
        (row) =>
          `${row.label} — ${row.quantity} pack(s) across ${row.lineItems} line item(s), ` +
          `${row.firstSeen} to ${row.lastSeen}`,
      ),
    });
  }

  // SKUs Shopify sold but has no cost per item for. Named, never guessed.
  const shopifyMissing = cogsResult.result?.missingCostSkus ?? [];
  if (settings.cogs.mode === "shopify_cost_per_item" && shopifyMissing.length > 0) {
    const units = cogsResult.result?.packQuantitiesMissingCost ?? 0;
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
    settings.cogs.mode === "pack_cost_model"
      ? unmappedList.map((row) => row.label)
      : settings.cogs.mode === "shopify_cost_per_item"
        ? shopifyMissing
        : calculation.missingSkus;

  // A cost source that returned nothing usable, or left units uncosted, must
  // not read as complete.
  const cogsSource =
    settings.cogs.mode === "shopify_cost_per_item" && shopifyMissing.length > 0
      ? "incomplete"
      : sources.cogs;

  // Under the pack model the P&L is only trustworthy when every line is
  // mapped. A failure to read line items at all counts as incomplete too.
  const mappingComplete =
    settings.cogs.mode !== "pack_cost_model" ||
    (unmappedList.length === 0 && packAvailable && cogsResult.error === null);

  return {
    days: applied,
    status: {
      configured: true,
      sources: { ...sources, cogs: cogsSource },
      issues,
      missingSkus,
      lineItemError: cogsResult.error,
      mappingComplete,
      unmapped: unmappedList,
      unmappedLineItems,
      unmappedQuantity,
      updatedAt: settings.updatedAt,
    },
  };
}

/** The identity a line carries, as the order recorded it. */
export function identityOf(line: {
  sku: string;
  title: string;
  variantTitle: string | null;
  lineName: string | null;
  variantId: string | null;
}): LineIdentity {
  return {
    sku: line.sku === NO_SKU ? null : line.sku,
    title: line.title,
    variantTitle: line.variantTitle,
    variantId: line.variantId,
    lineName: line.lineName,
  };
}


/** What the Historical Product Mapping page renders. */
export interface HistoricalMapping {
  /** Every product identity seen in the window, unmapped ones first. */
  rows: ProductIdentityRow[];
  /** The mapping table itself, manual entries and built-in aliases. */
  entries: PackMappingEntry[];
  start: ISODate;
  end: ISODate;
  ordersScanned: number;
  /** Set when Shopify line items could not be read at all. */
  error: string | null;
  /** True when the window was cut short by a page cap. */
  truncated: boolean;
}

/**
 * Every product identity that appeared on an order in the window.
 *
 * Deliberately scans a wide window rather than the dashboard's selected range:
 * the point of the page is to close mapping gaps everywhere, so that a P&L for
 * any past range is trustworthy. Mapping something that last sold in June from
 * a page showing August would be impossible otherwise.
 */
export async function loadHistoricalMapping(
  start: ISODate,
  end: ISODate,
): Promise<HistoricalMapping> {
  const settings = await readSettings();
  const { result, error } = await loadShopifyCogs(start, end, false);

  const inputs: IdentityInput[] = (result?.lines ?? []).map((line) => ({
    ...identityOf(line),
    date: line.date,
    quantity: line.quantityCosted,
  }));

  return {
    rows: buildIdentityInventory(settings.packModel, inputs),
    entries: [...settings.packModel.mappings].sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === "manual" ? -1 : 1;
      return a.value.localeCompare(b.value);
    }),
    start,
    end,
    ordersScanned: new Set((result?.lines ?? []).map((line) => line.orderId)).size,
    error,
    truncated: result?.truncated ?? false,
  };
}
