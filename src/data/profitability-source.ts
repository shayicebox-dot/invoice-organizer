import 'server-only';

import { money, moneyRatio, sumMoney, type CurrencyCode, type Money } from '@/core/money';
import type { DateRange } from '@/core/period';
import type { PeriodTotals, SalesOrder } from '@/core/metrics/sales';
import {
  describeMapping,
  tallyBoxes,
  type BoxMappingConfig,
  type BoxTally,
  type ProductMappingRow,
} from '@/core/metrics/boxes';
import {
  computeProfitAndLoss,
  type CostRates,
  type ProfitAndLoss,
  type ProfitInputs,
} from '@/core/metrics/profitability';
import { BUSINESS_CONFIG, VAT_RATE_SCHEDULE, vatRateOn } from '@/lib/config/business';
import { readBoxMapping } from '@/data/box-mapping-store';


/**
 * Assembles the profit and loss for a period from the sources that feed it.
 *
 * Shopify supplies revenue and the line items a box count is built from; Meta
 * supplies ad spend; configuration supplies the cost model. This module's job
 * is to hand `src/core` exactly those inputs and to carry back everything the
 * screen must disclose about how solid they are.
 */

export type VatResolution = {
  readonly basisPoints: number;
  /** False when the range spans a VAT rate change, so one rate cannot be right. */
  readonly uniform: boolean;
  /** The date the rate changed inside this range, when it did. */
  readonly changedOn: string | null;
};

/**
 * The VAT rate to apply to a period.
 *
 * Israel's rate is legislated and has changed — 17% to 18% on 1 January 2025 —
 * so a period is charged at the rate that applied then, not today's. A range
 * that straddles a change cannot be settled with one rate: the rate at the end
 * is used and the straddle is reported, so the reader can split the period
 * rather than be handed a figure that is wrong at one end.
 */
export function resolveVatForRange(range: DateRange): VatResolution {
  const atEnd = vatRateOn(range.end);
  const atStart = vatRateOn(range.start);

  if (atEnd === null) {
    throw new Error(`No VAT rate is configured for ${range.end}.`);
  }

  const changeInside = VAT_RATE_SCHEDULE.find(
    (period) => period.from > range.start && period.from <= range.end,
  );

  return {
    basisPoints: atEnd,
    uniform: atStart === atEnd && changeInside === undefined,
    changedOn: changeInside?.from ?? null,
  };
}

/** The cost model for a period, read from configuration. */
export function costRatesForRange(range: DateRange): CostRates {
  const { costs } = BUSINESS_CONFIG;
  const vat = resolveVatForRange(range);

  const perBox = (minorUnits: number | null, currency: CurrencyCode): Money | null =>
    minorUnits === null ? null : money(minorUnits, currency);

  return {
    productCostPerBoxInclVat: perBox(
      costs.productCost.costPerBoxInclVatMinorUnits,
      costs.productCost.currency,
    ),
    shippingPerBoxInclVat: perBox(
      costs.shipping.costPerBoxInclVatMinorUnits,
      costs.shipping.currency,
    ),
    variableOperatingRateBasisPoints: costs.variableOperatingRateBasisPoints,
    vatRateBasisPoints: vat.basisPoints,
  };
}

/** Fixed monthly costs, as the engine expects them. */
export function fixedExpenseInputs(): ProfitInputs['fixedExpenses'] {
  return BUSINESS_CONFIG.costs.fixedExpenses.map((expense) => ({
    id: expense.id,
    label: expense.label,
    monthly: money(expense.monthlyMinorUnits, expense.currency),
  }));
}

/** The box mapping in force, read from the store. */
export async function boxMappingConfig(): Promise<BoxMappingConfig> {
  const { config } = await readBoxMapping();
  return config;
}

/**
 * Every expense line for a period, with its share of revenue.
 *
 * Built from the P&L rather than recomputed, so the Expenses screen and the
 * dashboard can never disagree about what a cost was.
 */
export type ExpenseLine = {
  readonly id: string;
  readonly label: string;
  readonly amount: Money | null;
  /** Share of revenue ex VAT, or `null` when either side is unknown. */
  readonly shareOfRevenue: number | null;
  readonly basis: string;
  /** The full monthly cost, for a fixed expense. Formatted by the screen. */
  readonly monthly: Money | null;
};

export function expenseLines(pnl: ProfitAndLoss): readonly ExpenseLine[] {
  const share = (amount: Money | null): number | null =>
    amount === null || pnl.revenueExVat === null ? null : moneyRatio(amount, pnl.revenueExVat);

  const lines: ExpenseLine[] = [
    {
      id: 'product-cogs',
      label: 'Product COGS',
      amount: pnl.productCogsExVat,
      shareOfRevenue: share(pnl.productCogsExVat),
      basis: 'Physical boxes × landed cost per box, ex VAT',
      monthly: null,
    },
    {
      id: 'shipping',
      label: 'Customer shipping',
      amount: pnl.shippingExVat,
      shareOfRevenue: share(pnl.shippingExVat),
      basis: 'Physical boxes × shipping per box, ex VAT',
      monthly: null,
    },
    {
      id: 'variable',
      label: 'Variable operating costs',
      amount: pnl.variableOperating,
      shareOfRevenue: share(pnl.variableOperating),
      basis: '5% of revenue ex VAT',
      monthly: null,
    },
    {
      id: 'advertising',
      label: 'Meta Ads',
      amount: pnl.adSpend,
      shareOfRevenue: share(pnl.adSpend),
      basis: 'Meta ad spend for the same period',
      monthly: null,
    },
  ];

  for (const fixed of pnl.fixedExpenseLines) {
    lines.push({
      id: fixed.id,
      label: `${fixed.label} allocation`,
      amount: fixed.allocated,
      shareOfRevenue: share(fixed.allocated),
      basis: 'a month, allocated across the period’s days',
      monthly: fixed.monthly,
    });
  }

  return lines;
}

/** Total of every expense line, or `null` when any of them is unknown. */
export function totalExpenses(lines: readonly ExpenseLine[], currency: CurrencyCode): Money | null {
  const amounts: Money[] = [];

  for (const line of lines) {
    if (line.amount === null) return null;
    amounts.push(line.amount);
  }

  return sumMoney(currency, amounts);
}

export type ProfitabilityResult = {
  readonly pnl: ProfitAndLoss;
  readonly boxes: BoxTally;
  readonly mapping: readonly ProductMappingRow[];
  readonly vat: VatResolution;
  readonly rates: CostRates;
};

/**
 * Build the P&L from orders already fetched.
 *
 * Takes orders rather than fetching them so a screen that has already read
 * Shopify — the dashboard reads them for its chart and recent orders — does not
 * read them twice.
 *
 * `sourceAnswered` is not a formality: when Shopify could not be reached its
 * totals are zero-filled, and a P&L built on a stand-in zero would report a
 * confident loss equal to the fixed expenses. The engine is handed `null`
 * instead, so every derived figure reports as unavailable.
 */
export async function buildProfitability(params: {
  readonly range: DateRange;
  readonly orders: readonly SalesOrder[];
  readonly totals: PeriodTotals;
  readonly sourceAnswered: boolean;
  readonly adSpend: Money | null;
}): Promise<ProfitabilityResult> {
  const { range, orders, totals, sourceAnswered, adSpend } = params;
  const currency = BUSINESS_CONFIG.reportingCurrency;

  const rates = costRatesForRange(range);
  const vat = resolveVatForRange(range);
  const mappingConfig = await boxMappingConfig();

  const boxes = tallyBoxes(orders, mappingConfig);
  const mapping = describeMapping(orders, mappingConfig);

  // A variant with no decision recorded contributes no boxes, so an ordinary
  // product is never costed as packaging. `boxes.complete` says whether that
  // silence is hiding a real box pack, and the screens act on it.
  const physicalBoxes = sourceAnswered ? boxes.boxes : null;

  const pnl = computeProfitAndLoss({
    currency,
    range,
    netRevenueInclVat: sourceAnswered ? totals.netRevenue : null,
    grossSales: sourceAnswered ? totals.grossSales : null,
    discounts: sourceAnswered ? totals.discounts : null,
    salesReversals: sourceAnswered ? totals.salesReversals : null,
    orderCount: sourceAnswered ? totals.orderCount : null,
    physicalBoxes,
    adSpend,
    rates,
    fixedExpenses: fixedExpenseInputs(),
  });

  return { pnl, boxes, mapping, vat, rates };
}
