/**
 * The P&L engine.
 *
 * One place defines how profit is calculated, and every screen reads from it.
 * Nothing downstream is allowed to invent its own arithmetic — a KPI card, a
 * chart point and a table row for the same day always agree because they are
 * all derived from the same `DailyFinancials` record.
 *
 * The ladder, in order:
 *
 *   Net Sales           = Gross Sales - Discounts - Refunds
 *   Contribution Profit = Net Sales
 *                         - COGS
 *                         - Shipping & Fulfillment
 *                         - Payment Fees
 *                         - Marketing Spend
 *                         - Variable Expenses
 *   Operating Profit    = Contribution Profit - allocated Fixed Expenses
 *
 * Operating Profit is what the dashboard calls **Net Profit**.
 */

import { type CurrencyCode, type Money, ZERO, add, ratio, subtract, sum } from "./money";

/** Everything that increases or offsets revenue for a period. */
export interface RevenueInputs {
  grossSales: Money;
  discounts: Money;
  refunds: Money;
}

/** Costs that move with volume. */
export interface VariableCostInputs {
  cogs: Money;
  shipping: Money;
  paymentFees: Money;
  /** Paid ads (Meta, Google) plus email/SMS platform cost. */
  marketingSpend: Money;
  /** Packaging, support tooling, chargebacks and similar. */
  variableExpenses: Money;
}

/** Overheads that do not move with volume, allocated across the period. */
export interface FixedCostInputs {
  fixedExpenses: Money;
}

export interface ProfitInputs extends RevenueInputs, VariableCostInputs, FixedCostInputs {}

/** Net Sales = Gross Sales - Discounts - Refunds. */
export function netSales(input: RevenueInputs): Money {
  return subtract(subtract(input.grossSales, input.discounts), input.refunds);
}

/** Sum of every volume-driven cost. */
export function totalVariableCosts(input: VariableCostInputs): Money {
  return sum([
    input.cogs,
    input.shipping,
    input.paymentFees,
    input.marketingSpend,
    input.variableExpenses,
  ]);
}

/** Contribution Profit = Net Sales - variable costs. */
export function contributionProfit(input: RevenueInputs & VariableCostInputs): Money {
  return subtract(netSales(input), totalVariableCosts(input));
}

/** Operating Profit = Contribution Profit - allocated Fixed Expenses. Shown as "Net Profit". */
export function operatingProfit(input: ProfitInputs): Money {
  return subtract(contributionProfit(input), input.fixedExpenses);
}

/** Every cost line, variable and fixed. */
export function totalCosts(input: VariableCostInputs & FixedCostInputs): Money {
  return add(totalVariableCosts(input), input.fixedExpenses);
}

/** Operating Profit ÷ Net Sales. `null` when there were no sales. */
export function netMargin(input: ProfitInputs): number | null {
  return ratio(operatingProfit(input), netSales(input));
}

/** Contribution Profit ÷ Net Sales. */
export function contributionMargin(input: RevenueInputs & VariableCostInputs): number | null {
  return ratio(contributionProfit(input), netSales(input));
}

/** (Net Sales - COGS) ÷ Net Sales. */
export function grossMargin(input: RevenueInputs & Pick<VariableCostInputs, "cogs">): number | null {
  const net = netSales(input);
  return ratio(subtract(net, input.cogs), net);
}

/**
 * One fully-resolved day of P&L for one scope (a single store, or all stores
 * rolled up). This is the shape the whole UI consumes.
 */
export interface DailyFinancials extends ProfitInputs {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  currency: CurrencyCode;
  orders: number;
  unitsSold: number;
  /** Paid ad spend only — Meta + Google. */
  adSpend: Money;
  /** Email/SMS platform cost (Klaviyo, Omnisend, Mailchimp). */
  emailSpend: Money;
  metaAdSpend: Money;
  googleAdSpend: Money;
}

/** Period totals, plus the derived measures every screen needs. */
export interface PeriodSummary extends ProfitInputs {
  currency: CurrencyCode;
  dayCount: number;
  orders: number;
  unitsSold: number;
  adSpend: Money;
  emailSpend: Money;
  metaAdSpend: Money;
  googleAdSpend: Money;
  netSales: Money;
  totalVariableCosts: Money;
  totalCosts: Money;
  contributionProfit: Money;
  /** Operating Profit. The headline number. */
  netProfit: Money;
  netMargin: number | null;
  contributionMargin: number | null;
  grossMargin: number | null;
  /** Average order value, based on Net Sales. */
  averageOrderValue: Money;
  /** Net Sales ÷ ad spend. */
  roas: number | null;
  /** Marketing spend ÷ Net Sales. */
  marketingCostRatio: number | null;
}

const EMPTY_TOTALS = {
  grossSales: ZERO,
  discounts: ZERO,
  refunds: ZERO,
  cogs: ZERO,
  shipping: ZERO,
  paymentFees: ZERO,
  marketingSpend: ZERO,
  variableExpenses: ZERO,
  fixedExpenses: ZERO,
  adSpend: ZERO,
  emailSpend: ZERO,
  metaAdSpend: ZERO,
  googleAdSpend: ZERO,
};

/** Add up daily records and derive every ratio from the totals. */
export function summarize(
  days: readonly DailyFinancials[],
  currency: CurrencyCode = "USD",
): PeriodSummary {
  const totals = { ...EMPTY_TOTALS };
  let orders = 0;
  let unitsSold = 0;

  for (const day of days) {
    totals.grossSales = add(totals.grossSales, day.grossSales);
    totals.discounts = add(totals.discounts, day.discounts);
    totals.refunds = add(totals.refunds, day.refunds);
    totals.cogs = add(totals.cogs, day.cogs);
    totals.shipping = add(totals.shipping, day.shipping);
    totals.paymentFees = add(totals.paymentFees, day.paymentFees);
    totals.marketingSpend = add(totals.marketingSpend, day.marketingSpend);
    totals.variableExpenses = add(totals.variableExpenses, day.variableExpenses);
    totals.fixedExpenses = add(totals.fixedExpenses, day.fixedExpenses);
    totals.adSpend = add(totals.adSpend, day.adSpend);
    totals.emailSpend = add(totals.emailSpend, day.emailSpend);
    totals.metaAdSpend = add(totals.metaAdSpend, day.metaAdSpend);
    totals.googleAdSpend = add(totals.googleAdSpend, day.googleAdSpend);
    orders += day.orders;
    unitsSold += day.unitsSold;
  }

  const net = netSales(totals);

  return {
    ...totals,
    currency,
    dayCount: days.length,
    orders,
    unitsSold,
    netSales: net,
    totalVariableCosts: totalVariableCosts(totals),
    totalCosts: totalCosts(totals),
    contributionProfit: contributionProfit(totals),
    netProfit: operatingProfit(totals),
    netMargin: netMargin(totals),
    contributionMargin: contributionMargin(totals),
    grossMargin: grossMargin(totals),
    averageOrderValue: orders > 0 ? (Math.round(net / orders) as Money) : ZERO,
    roas: ratio(net, totals.adSpend),
    marketingCostRatio: ratio(totals.marketingSpend, net),
  };
}

/** Per-day Net Profit, for the trend chart. */
export function dailyNetProfit(day: DailyFinancials): Money {
  return operatingProfit(day);
}

/** Per-day Net Sales, for tables and charts. */
export function dailyNetSales(day: DailyFinancials): Money {
  return netSales(day);
}

/** Per-day total cost, for the revenue-vs-expenses chart. */
export function dailyTotalCosts(day: DailyFinancials): Money {
  return totalCosts(day);
}

/** Per-day margin. */
export function dailyNetMargin(day: DailyFinancials): number | null {
  return netMargin(day);
}

/**
 * Percentage change between two period summaries, for the KPI deltas.
 * Returns `null` when the comparison base is zero or the sign flips, since a
 * percentage change across zero is not meaningful.
 */
export function percentChange(current: Money, previous: Money): number | null {
  if (previous === 0) return null;
  if (Math.sign(previous) !== Math.sign(current) && current !== 0) return null;
  return (current - previous) / Math.abs(previous);
}
