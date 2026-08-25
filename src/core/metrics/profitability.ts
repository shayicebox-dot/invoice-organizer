import {
  addMoney,
  applyBasisPoints,
  divideMoney,
  excludeVat,
  moneyRatio,
  subtractMoney,
  sumMoney,
  vatPortion,
  zeroMoney,
  type CurrencyCode,
  type Money,
} from '@/core/money';
import { monthSlices, type DateRange } from '@/core/period';
import { resolveOrderBoxes, type BoxCountSource, type BoxMappingConfig } from '@/core/metrics/boxes';
import type { SalesOrder } from '@/core/metrics/sales';

/**
 * The ICEBOX profit and loss engine.
 *
 * Pure: no I/O, no dates beyond the range it is handed, no configuration
 * lookups. Every figure is a function of its inputs and can be reproduced from
 * them by hand, which is the point — an accountant has to be able to check it.
 *
 * The shape of the calculation:
 *
 *   Net revenue incl VAT      what Shopify actually took, after discounts and refunds
 *   − VAT                     stripped once, from the total
 *   = Revenue ex VAT          the top line of everything below
 *   − Product COGS ex VAT     physical boxes × landed cost per box
 *   − Shipping ex VAT         physical boxes × shipping cost per box
 *   − Variable operating      a percentage of revenue ex VAT
 *   = Contribution profit     before any advertising
 *   − Advertising             ad spend for the same period
 *   = Profit after advertising
 *   − Fixed expenses          monthly costs, allocated across the period's days
 *   = Net profit
 *
 * Two rules govern the whole thing:
 *
 * **Everything below the VAT line is ex VAT.** Costs arrive VAT inclusive, as
 * ICEBOX pays them, and VAT is removed once from each total rather than per
 * box — rounding once is what makes the figures reconcile.
 *
 * **Nothing is defaulted to zero.** A missing box count makes COGS unavailable,
 * not free; a missing ad spend makes profit-after-advertising unavailable, not
 * equal to contribution profit. `null` travels through to the screen and shows
 * as "Not connected", never as a number that flatters the business.
 */

export type CostRates = {
  /** Landed cost of one physical box, VAT inclusive. `null` if unconfigured. */
  readonly productCostPerBoxInclVat: Money | null;
  /** Shipping one physical box to the customer, VAT inclusive. */
  readonly shippingPerBoxInclVat: Money | null;
  /** Variable operating costs as basis points of revenue ex VAT. */
  readonly variableOperatingRateBasisPoints: number | null;
  /** VAT rate in basis points, e.g. 1800 for 18%. */
  readonly vatRateBasisPoints: number;
};

export type FixedExpenseLine = {
  readonly id: string;
  readonly label: string;
  /** Cost of a whole month, VAT treatment as configured. */
  readonly monthly: Money;
  /** The share of it that falls inside the reporting range. */
  readonly allocated: Money;
};

export type ProfitInputs = {
  readonly currency: CurrencyCode;
  readonly range: DateRange;
  /** Shopify net revenue: gross − discounts − refunds, VAT inclusive. */
  readonly netRevenueInclVat: Money | null;
  readonly orderCount: number | null;
  /** Physical boxes shipped. `null` when no line could be mapped. */
  readonly physicalBoxes: number | null;
  /** Ad spend over the same range, already checked for currency and period. */
  readonly adSpend: Money | null;
  readonly rates: CostRates;
  readonly fixedExpenses: readonly { readonly id: string; readonly label: string; readonly monthly: Money }[];
};

export type ProfitAndLoss = {
  readonly currency: CurrencyCode;
  readonly range: DateRange;

  // 1–3. The revenue line, before and after VAT.
  readonly netRevenueInclVat: Money | null;
  readonly vat: Money | null;
  readonly revenueExVat: Money | null;

  // 4. What was physically shipped.
  readonly orderCount: number | null;
  readonly physicalBoxes: number | null;
  readonly averageOrderValueInclVat: Money | null;
  readonly boxesPerOrder: number | null;

  // 5–7. Variable costs, all ex VAT.
  readonly productCogsInclVat: Money | null;
  readonly productCogsExVat: Money | null;
  readonly shippingInclVat: Money | null;
  readonly shippingExVat: Money | null;
  readonly variableOperating: Money | null;

  // 8–10. Down to profit after advertising.
  readonly contributionProfit: Money | null;
  readonly contributionMargin: number | null;
  readonly adSpend: Money | null;
  readonly profitAfterAdvertising: Money | null;

  // 11–13. Fixed costs.
  readonly fixedExpenseLines: readonly FixedExpenseLine[];
  readonly fixedExpensesTotal: Money;

  // 14–15. The bottom line.
  readonly netProfit: Money | null;
  readonly netMargin: number | null;

  /** Ad spend ÷ orders — cost of acquiring an order the store actually recorded. */
  readonly costPerOrder: Money | null;
  /** Revenue ex VAT ÷ ad spend. */
  readonly returnOnAdSpend: number | null;
};

/**
 * A monthly cost's share of a reporting range.
 *
 * Allocated month by month: a day of a 28-day February carries 1/28 of that
 * month's cost, a day of a 31-day January 1/31. Each month's share is rounded
 * once, at the month, rather than per day — rounding a daily rate and
 * multiplying it back up drifts by several agorot across a long range.
 */
export function allocateMonthlyCost(monthly: Money, range: DateRange): Money {
  const slices = monthSlices(range);

  return sumMoney(
    monthly.currency,
    slices.map((slice) => {
      const share = (monthly.minorUnits * slice.daysInRange) / slice.daysInMonth;
      return {
        minorUnits: share < 0 ? -Math.round(-share) : Math.round(share),
        currency: monthly.currency,
      };
    }),
  );
}

/** Cost of `boxes` boxes at a per-box rate, VAT inclusive. */
function costForBoxes(boxes: number | null, perBox: Money | null): Money | null {
  if (boxes === null || perBox === null) return null;
  return { minorUnits: perBox.minorUnits * boxes, currency: perBox.currency };
}

export function computeProfitAndLoss(inputs: ProfitInputs): ProfitAndLoss {
  const { currency, range, rates } = inputs;

  // 1–3. VAT is stripped once, from the period total. Stripping it per order
  // and summing would round on every order and disagree with the VAT return.
  const netRevenueInclVat = inputs.netRevenueInclVat;
  const vat = netRevenueInclVat === null ? null : vatPortion(netRevenueInclVat, rates.vatRateBasisPoints);
  const revenueExVat = netRevenueInclVat === null ? null : excludeVat(netRevenueInclVat, rates.vatRateBasisPoints);

  // 5–6. Costs are per physical box, VAT removed once from each total.
  const productCogsInclVat = costForBoxes(inputs.physicalBoxes, rates.productCostPerBoxInclVat);
  const productCogsExVat =
    productCogsInclVat === null ? null : excludeVat(productCogsInclVat, rates.vatRateBasisPoints);

  const shippingInclVat = costForBoxes(inputs.physicalBoxes, rates.shippingPerBoxInclVat);
  const shippingExVat =
    shippingInclVat === null ? null : excludeVat(shippingInclVat, rates.vatRateBasisPoints);

  // 7. A share of revenue ex VAT, so it scales with the business.
  const variableOperating =
    revenueExVat === null || rates.variableOperatingRateBasisPoints === null
      ? null
      : applyBasisPoints(revenueExVat, rates.variableOperatingRateBasisPoints);

  // 8. Contribution profit needs every variable cost; one missing makes it
  // unavailable rather than overstated.
  const contributionProfit =
    revenueExVat === null || productCogsExVat === null || shippingExVat === null || variableOperating === null
      ? null
      : subtractMoney(
          revenueExVat,
          sumMoney(currency, [productCogsExVat, shippingExVat, variableOperating]),
        );

  const contributionMargin =
    contributionProfit === null || revenueExVat === null
      ? null
      : moneyRatio(contributionProfit, revenueExVat);

  // 10. Advertising.
  const adSpend = inputs.adSpend;
  const profitAfterAdvertising =
    contributionProfit === null || adSpend === null ? null : subtractMoney(contributionProfit, adSpend);

  // 11–13. Fixed expenses always have a value: they are configured amounts, not
  // measurements, so their allocation is known even when sales are not.
  const fixedExpenseLines: readonly FixedExpenseLine[] = inputs.fixedExpenses.map((expense) => ({
    id: expense.id,
    label: expense.label,
    monthly: expense.monthly,
    allocated: allocateMonthlyCost(expense.monthly, range),
  }));

  const fixedExpensesTotal = sumMoney(
    currency,
    fixedExpenseLines.map((line) => line.allocated),
  );

  // 14–15.
  const netProfit =
    profitAfterAdvertising === null ? null : subtractMoney(profitAfterAdvertising, fixedExpensesTotal);

  const netMargin =
    netProfit === null || revenueExVat === null ? null : moneyRatio(netProfit, revenueExVat);

  const averageOrderValueInclVat =
    netRevenueInclVat === null || inputs.orderCount === null || inputs.orderCount === 0
      ? null
      : divideMoney(netRevenueInclVat, inputs.orderCount);

  const boxesPerOrder =
    inputs.physicalBoxes === null || inputs.orderCount === null || inputs.orderCount === 0
      ? null
      : inputs.physicalBoxes / inputs.orderCount;

  const costPerOrder =
    adSpend === null || inputs.orderCount === null || inputs.orderCount === 0
      ? null
      : divideMoney(adSpend, inputs.orderCount);

  const returnOnAdSpend = adSpend === null || revenueExVat === null ? null : moneyRatio(revenueExVat, adSpend);

  return {
    currency,
    range,
    netRevenueInclVat,
    vat,
    revenueExVat,
    orderCount: inputs.orderCount,
    physicalBoxes: inputs.physicalBoxes,
    averageOrderValueInclVat,
    boxesPerOrder,
    productCogsInclVat,
    productCogsExVat,
    shippingInclVat,
    shippingExVat,
    variableOperating,
    contributionProfit,
    contributionMargin,
    adSpend,
    profitAfterAdvertising,
    fixedExpenseLines,
    fixedExpensesTotal,
    netProfit,
    netMargin,
    costPerOrder,
    returnOnAdSpend,
  };
}

/** One step of the profitability waterfall, in reading order. */
export type WaterfallStep = {
  readonly id: string;
  readonly label: string;
  /** `deduction` is subtracted from the running total; `subtotal` restates it. */
  readonly kind: 'start' | 'deduction' | 'subtotal' | 'total';
  readonly amount: Money | null;
  /** The running total after this step, for a subtotal or total. */
  readonly runningTotal: Money | null;
  readonly formula: string;
};

/**
 * The waterfall from what customers paid down to what the business kept.
 *
 * Built here rather than in a component so the steps and the figures cannot
 * disagree: the same values the cards show are the ones the waterfall walks.
 */
export function profitWaterfall(pnl: ProfitAndLoss): readonly WaterfallStep[] {
  return [
    {
      id: 'revenue-incl-vat',
      label: 'Revenue incl VAT',
      kind: 'start',
      amount: pnl.netRevenueInclVat,
      runningTotal: pnl.netRevenueInclVat,
      formula: 'Shopify gross sales − discounts − refunds',
    },
    {
      id: 'vat',
      label: 'VAT',
      kind: 'deduction',
      amount: pnl.vat,
      runningTotal: pnl.revenueExVat,
      formula: 'Revenue incl VAT − (revenue incl VAT ÷ 1.18)',
    },
    {
      id: 'revenue-ex-vat',
      label: 'Revenue ex VAT',
      kind: 'subtotal',
      amount: pnl.revenueExVat,
      runningTotal: pnl.revenueExVat,
      formula: 'Revenue incl VAT ÷ 1.18',
    },
    {
      id: 'product-cost',
      label: 'Product cost',
      kind: 'deduction',
      amount: pnl.productCogsExVat,
      runningTotal: runningAfter(pnl.revenueExVat, [pnl.productCogsExVat]),
      formula: 'Physical boxes × cost per box, ex VAT',
    },
    {
      id: 'shipping',
      label: 'Shipping',
      kind: 'deduction',
      amount: pnl.shippingExVat,
      runningTotal: runningAfter(pnl.revenueExVat, [pnl.productCogsExVat, pnl.shippingExVat]),
      formula: 'Physical boxes × shipping per box, ex VAT',
    },
    {
      id: 'variable',
      label: 'Variable costs',
      kind: 'deduction',
      amount: pnl.variableOperating,
      runningTotal: pnl.contributionProfit,
      formula: '5% of revenue ex VAT',
    },
    {
      id: 'contribution',
      label: 'Contribution profit',
      kind: 'subtotal',
      amount: pnl.contributionProfit,
      runningTotal: pnl.contributionProfit,
      formula: 'Revenue ex VAT − product cost − shipping − variable costs',
    },
    {
      id: 'advertising',
      label: 'Meta Ads',
      kind: 'deduction',
      amount: pnl.adSpend,
      runningTotal: pnl.profitAfterAdvertising,
      formula: 'Meta ad spend for the same period',
    },
    {
      id: 'fixed',
      label: 'Fixed expenses',
      kind: 'deduction',
      amount: pnl.fixedExpensesTotal,
      runningTotal: pnl.netProfit,
      formula: 'Monthly fixed costs, allocated across the period’s days',
    },
    {
      id: 'net-profit',
      label: 'Net profit',
      kind: 'total',
      amount: pnl.netProfit,
      runningTotal: pnl.netProfit,
      formula: 'Contribution profit − advertising − fixed expenses',
    },
  ];
}

function runningAfter(start: Money | null, deductions: readonly (Money | null)[]): Money | null {
  if (start === null) return null;

  let total = start;
  for (const deduction of deductions) {
    if (deduction === null) return null;
    total = subtractMoney(total, deduction);
  }
  return total;
}

/** Profitability of one product line, for the Products screen. */
export type ProductProfit = {
  readonly key: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly sku: string | null;
  /** Packs sold. */
  readonly unitsSold: number;
  readonly boxesSold: number | null;
  readonly boxSource: BoxCountSource;
  /** Revenue after discounts, VAT inclusive, as Shopify reported it. */
  readonly revenueInclVat: Money;
  readonly revenueExVat: Money;
  readonly productCogsExVat: Money | null;
  readonly shippingExVat: Money | null;
  readonly contributionProfit: Money | null;
  readonly contributionMargin: number | null;
};

/**
 * Per-product contribution.
 *
 * Deliberately stops at contribution: advertising and fixed expenses are not
 * attributed to a product, because nothing in the data says which product an ad
 * sold or which product the warehouse held. Splitting them by revenue share
 * would invent a precision the business does not have.
 *
 * The 5% variable operating cost is also left out for the same reason it is
 * included at period level — it is a blanket rate, and applying it per product
 * would imply it was measured per product.
 */
export function computeProductProfit(
  line: {
    readonly key: string;
    readonly productTitle: string;
    readonly variantTitle: string | null;
    readonly sku: string | null;
    readonly unitsSold: number;
    readonly boxesSold: number | null;
    readonly boxSource: BoxCountSource;
    readonly revenueInclVat: Money;
  },
  rates: CostRates,
): ProductProfit {
  const revenueExVat = excludeVat(line.revenueInclVat, rates.vatRateBasisPoints);

  const productCogsInclVat = costForBoxes(line.boxesSold, rates.productCostPerBoxInclVat);
  const productCogsExVat =
    productCogsInclVat === null ? null : excludeVat(productCogsInclVat, rates.vatRateBasisPoints);

  const shippingInclVat = costForBoxes(line.boxesSold, rates.shippingPerBoxInclVat);
  const shippingExVat =
    shippingInclVat === null ? null : excludeVat(shippingInclVat, rates.vatRateBasisPoints);

  const contributionProfit =
    productCogsExVat === null || shippingExVat === null
      ? null
      : subtractMoney(revenueExVat, addMoney(productCogsExVat, shippingExVat));

  return {
    ...line,
    revenueExVat,
    productCogsExVat,
    shippingExVat,
    contributionProfit,
    contributionMargin:
      contributionProfit === null ? null : moneyRatio(contributionProfit, revenueExVat),
  };
}

/**
 * Per-product profitability across a period.
 *
 * Grouped by **variant**, not by product: a "10 pack" and a "50 pack" of the
 * same product are different things to cost, because they are different numbers
 * of physical boxes. Grouping them together would average two cost structures
 * into one meaningless line.
 *
 * Revenue is the line's discounted total as Shopify reported it. Refunds are
 * not deducted here because Shopify reports them at order level, not per line —
 * so a product's revenue can exceed what the period's net revenue implies, and
 * the screen says so rather than silently apportioning refunds by guesswork.
 */
export function aggregateProductProfit(
  orders: readonly SalesOrder[],
  mapping: BoxMappingConfig,
  rates: CostRates,
): readonly ProductProfit[] {
  type Accumulated = {
    key: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    unitsSold: number;
    boxesSold: number | null;
    boxSource: BoxCountSource;
    revenueInclVat: Money;
  };

  const byVariant = new Map<string, Accumulated>();

  for (const order of orders) {
    const resolved = resolveOrderBoxes(order, mapping);

    order.lineItems.forEach((line, index) => {
      const boxes = resolved[index];
      if (boxes === undefined) return;

      const key = line.variantId ?? line.productId ?? `${line.productTitle}|${line.variantTitle ?? ''}`;
      const existing = byVariant.get(key);

      byVariant.set(key, {
        key,
        productTitle: line.productTitle,
        variantTitle: line.variantTitle,
        sku: line.sku,
        unitsSold: (existing?.unitsSold ?? 0) + line.quantity,
        boxesSold:
          boxes.boxes === null ? existing?.boxesSold ?? null : (existing?.boxesSold ?? 0) + boxes.boxes,
        boxSource: boxes.source,
        revenueInclVat:
          existing === undefined
            ? line.discountedTotal
            : addMoney(existing.revenueInclVat, line.discountedTotal),
      });
    });
  }

  return [...byVariant.values()]
    .map((line) => computeProductProfit(line, rates))
    .sort((a, b) => b.revenueInclVat.minorUnits - a.revenueInclVat.minorUnits);
}

/** An empty P&L for a period with no usable source. */
export function emptyProfitAndLoss(
  currency: CurrencyCode,
  range: DateRange,
  rates: CostRates,
  fixedExpenses: ProfitInputs['fixedExpenses'],
): ProfitAndLoss {
  return computeProfitAndLoss({
    currency,
    range,
    netRevenueInclVat: null,
    orderCount: null,
    physicalBoxes: null,
    adSpend: null,
    rates,
    fixedExpenses,
  });
}

/** Zero money in the reporting currency, for callers assembling totals. */
export function zeroFor(currency: CurrencyCode): Money {
  return zeroMoney(currency);
}
