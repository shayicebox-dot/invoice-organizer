import type { Money } from '@/core/money';
import type { ProfitAndLoss } from '@/core/metrics/profitability';
import type { BreakEven } from '@/core/metrics/breakeven';

/**
 * One plain sentence about how the business is doing, and why.
 *
 * Derived, not written: every clause is a statement the numbers already support,
 * and the cause it names is established by comparing figures rather than
 * guessed at. When the data cannot support a cause, none is offered.
 *
 * Written the way a bookkeeper would say it out loud. No hedging, no advice, no
 * exclamation — the reader is the owner of this business and knows what to do
 * about a loss once they can see one.
 */

export type StatusTone = 'positive' | 'negative' | 'warning' | 'neutral';

export type BusinessStatus = {
  readonly tone: StatusTone;
  /** The headline fact. Always safe to show on its own. */
  readonly headline: string;
  /** Why, when the figures establish a why. */
  readonly detail: string | null;
};

export type StatusFormatters = {
  readonly money: (amount: Money) => string;
  readonly percent: (fraction: number) => string;
};

export function describeBusinessStatus(
  pnl: ProfitAndLoss,
  breakEven: BreakEven,
  format: StatusFormatters,
): BusinessStatus {
  const { netProfit, netMargin, contributionProfit, adSpend, fixedExpensesTotal } = pnl;

  if (netProfit === null) {
    return {
      tone: 'neutral',
      headline: 'Profit cannot be calculated for this period yet.',
      detail: missingReason(pnl),
    };
  }

  const losing = netProfit.minorUnits < 0;
  const magnitude = format.money(absolute(netProfit));
  const margin = netMargin === null ? null : format.percent(netMargin);

  const headline = losing
    ? `The business is losing ${magnitude} over this period.`
    : `The business is making ${magnitude} over this period${margin === null ? '' : `, a ${margin} margin`}.`;

  // Advertising is named as the cause only when the arithmetic shows it: the
  // period covers its fixed costs before advertising, and does not after.
  const coversFixedBeforeAds =
    contributionProfit !== null && contributionProfit.minorUnits > fixedExpensesTotal.minorUnits;

  if (losing && coversFixedBeforeAds && adSpend !== null && breakEven.status === 'below') {
    const overspend = breakEven.cpaHeadroom === null ? null : format.money(absolute(breakEven.cpaHeadroom));

    return {
      tone: 'negative',
      headline,
      detail:
        overspend === null
          ? 'Advertising is what turns a profitable period into a loss: the business covers its fixed costs before advertising, and does not after.'
          : `CPA is ${overspend} above break-even, and advertising is the reason profit is negative — the period covers its fixed costs before advertising, and does not after.`,
    };
  }

  if (losing && !coversFixedBeforeAds) {
    return {
      tone: 'negative',
      headline,
      detail:
        'Costs before advertising already exceed what the period earns, so no change to ad spend alone would make it profitable.',
    };
  }

  if (!losing && breakEven.status === 'above' && breakEven.cpaHeadroom !== null) {
    return {
      tone: 'positive',
      headline,
      detail: `There is ${format.money(breakEven.cpaHeadroom)} of headroom per order before the period stops breaking even.`,
    };
  }

  return { tone: losing ? 'negative' : 'positive', headline, detail: null };
}

/** Which missing input is stopping profit being calculated. */
function missingReason(pnl: ProfitAndLoss): string | null {
  if (pnl.netRevenueInclVat === null) return 'Sales are not available for this period.';
  if (pnl.productCogsExVat === null) return 'Product costs are not available for this period.';
  if (pnl.adSpend === null) return 'Ad spend is not available for this period.';
  return null;
}

function absolute(amount: Money): Money {
  return amount.minorUnits < 0 ? { ...amount, minorUnits: -amount.minorUnits } : amount;
}
