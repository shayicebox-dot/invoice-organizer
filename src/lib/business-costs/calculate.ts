/**
 * Turning configured costs plus real sales volume into daily cost lines.
 *
 * Pure functions: settings and volume in, money out. No I/O, no provider
 * calls, no dates read from the clock — which is what makes the arithmetic
 * testable against a merchant's own spreadsheet.
 *
 * The rule throughout: a section that is not configured, or that is missing an
 * input it needs, reports an issue and returns what it can. It never
 * substitutes a plausible-looking rate, because a P&L that is quietly wrong is
 * worse than one that says it is incomplete.
 */

import { type Money, ZERO, add, multiply, scale, sum } from "../money";
import type { ExpenseCategory, ISODate } from "../types";
import { dailyShareOfAll, effectiveRecord, effectiveRecords } from "./proration";
import type {
  BusinessCostSettings,
  CostIssue,
  CostSource,
  CostSourceMap,
  SkuCost,
} from "./types";

/** What actually sold on one day, from Shopify. */
export interface DailyVolume {
  date: ISODate;
  orders: number;
  unitsSold: number;
  /** Net sales for the day, used for percentage-based processing fees. */
  netSales: Money;
  /** Units sold per SKU. Empty when line-item data is unavailable. */
  unitsBySku: Record<string, number>;
  /**
   * COGS as Shopify itself reports it, from the inventory item's cost per
   * item. Only populated when that data was fetched.
   */
  shopifyCogs: Money | null;
}

/** One day of computed costs. */
export interface DailyCosts {
  date: ISODate;
  cogs: Money;
  shipping: Money;
  paymentFees: Money;
  klaviyo: Money;
  /** Expenses that move with volume — packaging, support, chargebacks. */
  variableExpenses: Money;
  /** Overhead that does not move with volume — rent, payroll, software. */
  fixedExpenses: Money;
  /** Both of the above. */
  otherExpenses: Money;
}

/**
 * Which expense categories are overhead rather than volume-driven.
 *
 * The split is what keeps Contribution Profit meaningful: contribution is
 * what a day's sales left after the costs that scaled with them, and rent did
 * not scale with them.
 */
const FIXED_CATEGORIES = new Set<ExpenseCategory>([
  "rent",
  "payroll",
  "software",
  "professional_services",
]);

export function isFixedCategory(category: ExpenseCategory): boolean {
  return FIXED_CATEGORIES.has(category);
}

export interface CostCalculation {
  days: DailyCosts[];
  issues: CostIssue[];
  sources: CostSourceMap;
  /** SKUs that sold in the range with no configured cost. */
  missingSkus: string[];
}

const EMPTY_DAY = (date: ISODate): DailyCosts => ({
  date,
  cogs: ZERO,
  shipping: ZERO,
  paymentFees: ZERO,
  klaviyo: ZERO,
  variableExpenses: ZERO,
  fixedExpenses: ZERO,
  otherExpenses: ZERO,
});

/** Unit cost in force for a SKU on a date, or `null` if none is configured. */
export function unitCostForSku(
  skuCosts: readonly SkuCost[],
  sku: string,
  date: ISODate,
): Money | null {
  const matching = skuCosts.filter((cost) => cost.sku === sku);
  if (matching.length === 0) return null;
  const record = effectiveRecord(matching, date);
  return record ? record.unitCost : null;
}

// --- COGS ------------------------------------------------------------------

interface CogsResult {
  amount: Money;
  missing: string[];
  usable: boolean;
}

function computeCogs(settings: BusinessCostSettings, volume: DailyVolume): CogsResult {
  if (settings.cogs.mode === "shopify_cost_per_item") {
    // Shopify is authoritative here; if it did not supply a figure we say so
    // rather than falling back to the manual table behind the merchant's back.
    if (volume.shopifyCogs === null) {
      return { amount: ZERO, missing: [], usable: false };
    }
    return { amount: volume.shopifyCogs, missing: [], usable: true };
  }

  if (settings.cogs.mode === "manual_sku_costs") {
    const skus = Object.keys(volume.unitsBySku);
    if (skus.length === 0 && volume.unitsSold > 0) {
      // Units sold but no line-item breakdown — cannot cost them per SKU.
      return { amount: ZERO, missing: [], usable: false };
    }

    let total = ZERO;
    const missing: string[] = [];
    for (const sku of skus) {
      const units = volume.unitsBySku[sku];
      if (units <= 0) continue;
      const unitCost = unitCostForSku(settings.cogs.skuCosts, sku, volume.date);
      if (unitCost === null) {
        missing.push(sku);
        continue;
      }
      total = add(total, multiply(unitCost, units));
    }
    return { amount: total, missing, usable: true };
  }

  return { amount: ZERO, missing: [], usable: false };
}

// --- Shipping --------------------------------------------------------------

function computeShipping(settings: BusinessCostSettings, volume: DailyVolume): Money {
  const rates = effectiveRecords(settings.shipping.rates, volume.date);

  let total = ZERO;

  // A SKU-specific rate covers only its own units; the general rate covers
  // everything else and carries the per-order charge.
  const general = rates.find((rate) => rate.sku === null);
  const specific = rates.filter((rate) => rate.sku !== null);

  const coveredSkus = new Set(specific.map((rate) => rate.sku as string));
  let unitsCoveredBySpecific = 0;

  for (const rate of specific) {
    const units = volume.unitsBySku[rate.sku as string] ?? 0;
    if (units <= 0) continue;
    unitsCoveredBySpecific += units;
    total = add(total, multiply(rate.perUnit, units));
    // A per-order charge on a SKU rate is deliberately not applied: an order
    // has one shipment, and the general rate already charges for it.
  }

  if (general) {
    const remainingUnits = Math.max(0, volume.unitsSold - unitsCoveredBySpecific);
    total = add(total, multiply(general.perOrder, volume.orders));
    total = add(total, multiply(general.perUnit, remainingUnits));
  } else if (coveredSkus.size === 0) {
    return ZERO;
  }

  // 3PL minimums and other fixed fulfillment fees, spread across the month.
  total = add(total, dailyShareOfAll(settings.shipping.fixedFees, volume.date));

  return total;
}

// --- Payment fees ----------------------------------------------------------

function computePaymentFees(settings: BusinessCostSettings, volume: DailyVolume): Money {
  const processors = effectiveRecords(settings.payments.processors, volume.date);
  if (processors.length === 0) return ZERO;

  let total = ZERO;
  for (const processor of processors) {
    const share = Math.max(0, Math.min(1, processor.shareOfOrders));
    if (share === 0) continue;

    // Percentage on the share of sales this processor handled.
    total = add(total, scale(volume.netSales, processor.percentageRate * share));

    // Flat fee on the share of transactions it handled, rounded once.
    const transactions = Math.round(volume.orders * share);
    total = add(total, multiply(processor.fixedPerTransaction, transactions));
  }

  return total;
}

// --- The whole range -------------------------------------------------------

export function calculateCosts(
  settings: BusinessCostSettings,
  volumes: readonly DailyVolume[],
): CostCalculation {
  const days: DailyCosts[] = [];
  const missingSkus = new Set<string>();
  const issues: CostIssue[] = [];

  let cogsUsable = settings.cogs.mode !== "not_configured";
  let anyUnitsSold = false;

  for (const volume of volumes) {
    const day = EMPTY_DAY(volume.date);
    if (volume.unitsSold > 0) anyUnitsSold = true;

    const cogs = computeCogs(settings, volume);
    if (!cogs.usable && volume.unitsSold > 0) cogsUsable = false;
    for (const sku of cogs.missing) missingSkus.add(sku);

    day.cogs = cogs.amount;
    day.shipping = computeShipping(settings, volume);
    day.paymentFees = computePaymentFees(settings, volume);
    day.klaviyo = dailyShareOfAll(settings.klaviyo.plans, volume.date);
    day.variableExpenses = dailyShareOfAll(
      settings.expenses.filter((expense) => !isFixedCategory(expense.category)),
      volume.date,
    );
    day.fixedExpenses = dailyShareOfAll(
      settings.expenses.filter((expense) => isFixedCategory(expense.category)),
      volume.date,
    );
    day.otherExpenses = add(day.variableExpenses, day.fixedExpenses);

    days.push(day);
  }

  // --- Issues and per-section provenance ---------------------------------

  const hasShippingRates =
    settings.shipping.rates.length > 0 || settings.shipping.fixedFees.length > 0;
  const hasProcessors = settings.payments.processors.length > 0;
  const hasKlaviyo = settings.klaviyo.plans.length > 0;
  const hasExpenses = settings.expenses.length > 0;

  if (settings.cogs.mode === "not_configured") {
    issues.push({
      section: "cogs",
      message: "COGS is not configured. Set a cost source on the Business Costs page.",
      details: [],
    });
  } else if (!cogsUsable && anyUnitsSold) {
    issues.push({
      section: "cogs",
      message:
        settings.cogs.mode === "shopify_cost_per_item"
          ? "Shopify did not return a cost per item for this period, so COGS is missing."
          : "Per-SKU costs need Shopify line-item data, which is not available for this period.",
      details: [],
    });
  }

  if (missingSkus.size > 0) {
    issues.push({
      section: "cogs",
      message: `${missingSkus.size} SKU${missingSkus.size === 1 ? "" : "s"} sold with no configured unit cost, so COGS understates.`,
      details: [...missingSkus].sort(),
    });
  }

  if (!hasShippingRates) {
    issues.push({
      section: "shipping",
      message: "No shipping or fulfillment rates configured.",
      details: [],
    });
  }

  if (!hasProcessors) {
    issues.push({
      section: "payments",
      message: "No payment processor configured, so processing fees are missing.",
      details: [],
    });
  }

  if (!hasKlaviyo) {
    issues.push({
      section: "klaviyo",
      message: "No Klaviyo subscription cost configured.",
      details: [],
    });
  }

  if (!hasExpenses) {
    issues.push({
      section: "expenses",
      message: "No other business expenses configured.",
      details: [],
    });
  }

  const cogsSource: CostSource =
    settings.cogs.mode === "not_configured"
      ? "mock"
      : !cogsUsable && anyUnitsSold
        ? "incomplete"
        : missingSkus.size > 0
          ? "incomplete"
          : settings.cogs.mode === "shopify_cost_per_item"
            ? "live"
            : "manual";

  const sources: CostSourceMap = {
    cogs: cogsSource,
    shipping: hasShippingRates ? "manual" : "mock",
    paymentFees: hasProcessors ? "manual" : "mock",
    klaviyo: hasKlaviyo ? "manual" : "mock",
    otherExpenses: hasExpenses ? "manual" : "mock",
  };

  return { days, issues, sources, missingSkus: [...missingSkus].sort() };
}

/** Range totals, for the settings page summary. */
export function totalCosts(days: readonly DailyCosts[]) {
  return {
    cogs: sum(days.map((day) => day.cogs)),
    shipping: sum(days.map((day) => day.shipping)),
    paymentFees: sum(days.map((day) => day.paymentFees)),
    klaviyo: sum(days.map((day) => day.klaviyo)),
    variableExpenses: sum(days.map((day) => day.variableExpenses)),
    fixedExpenses: sum(days.map((day) => day.fixedExpenses)),
    otherExpenses: sum(days.map((day) => day.otherExpenses)),
  };
}
