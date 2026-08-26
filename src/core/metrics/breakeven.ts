import { divideMoney, moneyRatio, subtractMoney, type Money } from '@/core/money';
import type { ProfitAndLoss } from '@/core/metrics/profitability';

/**
 * Break-even on advertising.
 *
 * Pure, and derived entirely from figures the profit engine has already
 * produced — it introduces no new cost model and changes no existing formula.
 * The question it answers is the one an owner actually asks: *how much can
 * advertising cost before this period stops making money?*
 *
 * Everything follows from one line of the P&L:
 *
 *   net profit = contribution profit − ad spend − fixed expenses
 *
 * Setting net profit to zero and solving for ad spend gives the budget the
 * period can afford:
 *
 *   affordable ad spend = contribution profit − fixed expenses
 *   break-even CPA      = affordable ad spend ÷ orders
 *   break-even ROAS     = revenue ex VAT ÷ affordable ad spend
 *
 * Which yields a useful identity, and one worth stating because it is what
 * makes the section trustworthy: **net profit = orders × (break-even CPA −
 * actual CPA)**. The gap shown on screen, multiplied by the order count, is the
 * profit or the loss. The two figures cannot disagree.
 *
 * When contribution profit does not cover fixed expenses, no advertising budget
 * breaks even — not even zero. That is reported as unreachable rather than as a
 * negative CPA, which would look like a target.
 */

export type BreakEvenStatus =
  /** Spending less per order than the period can afford — profitable. */
  | 'above'
  /** Spending more per order than the period can afford — losing money. */
  | 'below'
  /** Fixed costs exceed contribution profit; no ad budget breaks even. */
  | 'unreachable'
  /** Something needed to answer the question is missing. */
  | 'unavailable';

export type BreakEven = {
  readonly status: BreakEvenStatus;

  /** Ad spend ÷ orders, straight from the profit engine. */
  readonly actualCpa: Money | null;
  /** The most a period can pay per order and still break even. */
  readonly breakEvenCpa: Money | null;
  /**
   * Break-even CPA − actual CPA. Positive is headroom, negative is overspend.
   * Multiplied by the order count this is exactly the net profit.
   */
  readonly cpaHeadroom: Money | null;

  /** Revenue ex VAT ÷ ad spend, straight from the profit engine. */
  readonly actualRoas: number | null;
  /** The ROAS at which the period breaks even. */
  readonly breakEvenRoas: number | null;
  /**
   * How far ROAS must rise to break even, as a fraction — 0.28 meaning "+28%".
   * `null` when already at or above break-even.
   */
  readonly roasImprovementRequired: number | null;

  /** Ad budget the period can afford in total. Negative when unreachable. */
  readonly affordableAdSpend: Money | null;
};

const UNAVAILABLE: BreakEven = {
  status: 'unavailable',
  actualCpa: null,
  breakEvenCpa: null,
  cpaHeadroom: null,
  actualRoas: null,
  breakEvenRoas: null,
  roasImprovementRequired: null,
  affordableAdSpend: null,
};

export function computeBreakEven(pnl: ProfitAndLoss): BreakEven {
  const { contributionProfit, fixedExpensesTotal, orderCount, revenueExVat } = pnl;

  if (contributionProfit === null || orderCount === null || orderCount === 0) {
    return UNAVAILABLE;
  }

  // What advertising could cost with net profit landing exactly on zero.
  const affordableAdSpend = subtractMoney(contributionProfit, fixedExpensesTotal);
  const breakEvenCpa = divideMoney(affordableAdSpend, orderCount);

  // Fixed costs already exceed contribution profit: the period loses money even
  // with no advertising at all, so there is no break-even budget to aim at.
  if (affordableAdSpend.minorUnits <= 0) {
    return {
      ...UNAVAILABLE,
      status: 'unreachable',
      actualCpa: pnl.costPerOrder,
      actualRoas: pnl.returnOnAdSpend,
      affordableAdSpend,
    };
  }

  const breakEvenRoas =
    revenueExVat === null ? null : moneyRatio(revenueExVat, affordableAdSpend);

  const actualCpa = pnl.costPerOrder;
  const actualRoas = pnl.returnOnAdSpend;

  if (actualCpa === null || breakEvenCpa === null) {
    return {
      ...UNAVAILABLE,
      breakEvenCpa,
      breakEvenRoas,
      affordableAdSpend,
      actualRoas,
    };
  }

  const cpaHeadroom = subtractMoney(breakEvenCpa, actualCpa);

  const roasImprovementRequired =
    actualRoas === null || breakEvenRoas === null || actualRoas <= 0 || actualRoas >= breakEvenRoas
      ? null
      : breakEvenRoas / actualRoas - 1;

  return {
    status: cpaHeadroom.minorUnits >= 0 ? 'above' : 'below',
    actualCpa,
    breakEvenCpa,
    cpaHeadroom,
    actualRoas,
    breakEvenRoas,
    roasImprovementRequired,
    affordableAdSpend,
  };
}

/**
 * Actual CPA as a ratio of break-even CPA.
 *
 * `1` is exactly on break-even, above 1 is overspending. Deliberately not
 * capped: the screen draws break-even as a marker part-way along the track, so
 * a bar that runs past it is the point rather than an overflow to hide.
 */
export function cpaBarFill(breakEven: BreakEven): number | null {
  const { actualCpa, breakEvenCpa } = breakEven;
  if (actualCpa === null || breakEvenCpa === null || breakEvenCpa.minorUnits <= 0) return null;
  return actualCpa.minorUnits / breakEvenCpa.minorUnits;
}

/** Actual ROAS as a ratio of break-even ROAS. `1` is exactly on break-even. */
export function roasBarFill(breakEven: BreakEven): number | null {
  const { actualRoas, breakEvenRoas } = breakEven;
  if (actualRoas === null || breakEvenRoas === null || breakEvenRoas <= 0) return null;
  return actualRoas / breakEvenRoas;
}
