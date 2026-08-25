import {
  divideMoney,
  moneyRatio,
  scaleMoney,
  zeroMoney,
  type CurrencyCode,
  type Money,
} from '@/core/money';

/**
 * Advertising performance calculations.
 *
 * Pure: no I/O, no dates, no environment access. Every figure is a function of
 * the delivery measures alone and can be reproduced from them.
 *
 * The definitions, stated once so they are not re-invented per screen:
 *
 * - **Spend** — what the platform charged for the period.
 * - **Impressions** — times an ad was shown.
 * - **Reach** — people it was shown to. Deduplicated by the platform, so reach
 *   does NOT sum across campaigns: the same person reached by two campaigns is
 *   one person at account level and two rows below it.
 * - **Frequency** — impressions ÷ reach. Average times one person saw an ad.
 * - **CPM** — spend ÷ impressions × 1000. Cost per thousand impressions.
 * - **Link clicks** — clicks on the ad's link, not every click on the ad.
 * - **Link CTR** — link clicks ÷ impressions.
 * - **Link CPC** — spend ÷ link clicks.
 * - **Purchases / purchase value** — what the platform attributes to these ads
 *   in its own attribution window. These are the platform's claims about its
 *   own effectiveness, not the store's record of what was sold.
 * - **CPA** — spend ÷ purchases.
 * - **ROAS** — purchase value ÷ spend.
 *
 * The derived figures above are computed here rather than read from the
 * platform's own pre-computed fields, so each one carries its inputs and can be
 * checked. They were verified to reproduce Meta's reported values exactly.
 *
 * `computeBlendedAdMetrics` is the one place that combines advertising with
 * store sales. It is kept separate because the two come from different systems
 * with different attribution and different day boundaries — see its comment.
 */

export type AdPlatformId = 'meta' | 'google';

/** Directly measured by the ad platform. Nothing here is derived. */
export type AdDelivery = {
  readonly spend: Money;
  readonly impressions: number;
  /** Deduplicated by the platform — does not sum across rows. */
  readonly reach: number;
  readonly linkClicks: number;
  /** `null` when the platform attributes none, which is not the same as zero. */
  readonly purchases: number | null;
  readonly purchaseValue: Money | null;
};

/** Everything derived from `AdDelivery`. `null` means undefined, never zero. */
export type AdEfficiency = {
  readonly frequency: number | null;
  readonly cpm: Money | null;
  /** Fraction, e.g. 0.0123 for 1.23%. */
  readonly linkCtr: number | null;
  readonly linkCpc: Money | null;
  readonly cpa: Money | null;
  readonly roas: number | null;
};

export type AdCampaignPerformance = {
  readonly id: string;
  /** The campaign's name as the platform reports it. Never rewritten. */
  readonly name: string;
  readonly delivery: AdDelivery;
  readonly efficiency: AdEfficiency;
};

const IMPRESSIONS_PER_MILLE = 1000;

export function computeAdEfficiency(delivery: AdDelivery): AdEfficiency {
  const { spend, impressions, reach, linkClicks, purchases, purchaseValue } = delivery;

  return {
    // Reproduces the platform's own frequency exactly.
    frequency: reach === 0 ? null : impressions / reach,

    // Scaled before dividing: dividing first would round to whole agorot per
    // impression, which for any realistic spend is zero.
    cpm: impressions === 0 ? null : divideMoney(scaleMoney(spend, IMPRESSIONS_PER_MILLE), impressions),

    linkCtr: impressions === 0 ? null : linkClicks / impressions,
    linkCpc: linkClicks === 0 ? null : divideMoney(spend, linkClicks),

    // A cost per purchase needs purchases to have been attributed at all.
    cpa: purchases === null || purchases === 0 ? null : divideMoney(spend, purchases),

    // Return on spend is undefined without spend to return on.
    roas: purchaseValue === null ? null : moneyRatio(purchaseValue, spend),
  };
}

export function emptyAdDelivery(currency: CurrencyCode): AdDelivery {
  return {
    spend: zeroMoney(currency),
    impressions: 0,
    reach: 0,
    linkClicks: 0,
    purchases: null,
    purchaseValue: null,
  };
}

/** Campaigns ordered by spend, largest first — where the money went. */
export function rankCampaignsBySpend(
  campaigns: readonly AdCampaignPerformance[],
): readonly AdCampaignPerformance[] {
  return [...campaigns].sort((a, b) => b.delivery.spend.minorUnits - a.delivery.spend.minorUnits);
}

/**
 * Campaigns that actually ran in the period.
 *
 * An ad account accumulates hundreds of campaigns over its life, nearly all of
 * them dormant in any given period. A row of dashes for each one is noise, not
 * information, so only campaigns with delivery are listed — and the count of
 * those dropped is returned so the screen can say the list is filtered rather
 * than implying the account holds nothing else.
 */
export function withDelivery(campaigns: readonly AdCampaignPerformance[]): {
  readonly active: readonly AdCampaignPerformance[];
  readonly dormant: number;
} {
  const active = campaigns.filter(
    (campaign) => campaign.delivery.spend.minorUnits !== 0 || campaign.delivery.impressions !== 0,
  );

  return { active, dormant: campaigns.length - active.length };
}

export type BlendedAdMetrics = {
  /** Ad spend ÷ orders the store actually recorded. */
  readonly cpa: Money | null;
  /** Store net revenue ÷ ad spend. */
  readonly roas: number | null;
};

/**
 * Advertising measured against the store's own books rather than the platform's
 * attribution.
 *
 * This is the honest version of "what did the advertising return": the
 * denominator is spend the platform charged, the numerator is revenue the store
 * recorded. It deliberately does not attribute — it does not claim these orders
 * came from these ads, only that both happened in the same period.
 *
 * Two conditions the caller must satisfy, because they cannot be checked here:
 * the two figures must cover the same period, and they must be in the same
 * currency (`moneyRatio` throws otherwise rather than mixing currencies).
 */
export function computeBlendedAdMetrics(
  adSpend: Money,
  orderCount: number,
  netRevenue: Money,
): BlendedAdMetrics {
  return {
    cpa: orderCount === 0 ? null : divideMoney(adSpend, orderCount),
    roas: moneyRatio(netRevenue, adSpend),
  };
}
