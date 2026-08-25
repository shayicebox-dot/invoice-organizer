import 'server-only';

import { cache } from 'react';

import type { CurrencyCode, Money } from '@/core/money';
import { hoursAheadOf, type DateRange } from '@/core/period';
import {
  computeAdEfficiency,
  rankCampaignsBySpend,
  withDelivery,
  type AdCampaignPerformance,
  type AdDelivery,
  type AdEfficiency,
} from '@/core/metrics/marketing';
import { fetchMetaInsights } from '@/integrations/meta/insights';
import { testMetaConnection } from '@/integrations/meta/connection';
import { MetaError } from '@/integrations/meta/errors';
import { META_FAILURE_GUIDANCE } from '@/integrations/meta/errors';
import { BUSINESS_CONFIG } from '@/lib/config/business';
import { isMetaConfigured } from '@/lib/config/env';

/**
 * Meta Ads reads for the dashboard and the Marketing screen.
 *
 * Reads only. Nothing here creates, edits, pauses or budgets anything — the
 * access token carries `ads_read` and this layer never asks for more.
 *
 * Two things are checked before a single figure is passed on, because getting
 * either wrong produces a confident wrong number rather than a visible gap:
 *
 * 1. **Currency.** Meta's amounts are only combinable with Shopify's if the ad
 *    account reports in the business's reporting currency. When it does not,
 *    spend is withheld rather than mixed, and the reason travels to the screen.
 * 2. **Day boundaries.** Meta buckets a day in the ad account's timezone and
 *    Shopify in the business timezone. The gap is measured and reported; it is
 *    never silently adjusted for, because shifting one source's dates to match
 *    the other would invent figures neither system reported.
 */

export type MetaFailure = {
  readonly message: string;
  readonly guidance: string;
};

/** What a screen must say out loud about these advertising figures. */
export type MarketingCaveats = {
  /** Ad account timezone, as Meta reports it. `null` if it could not be read. */
  readonly adAccountTimeZone: string | null;
  readonly businessTimeZone: string;
  /**
   * Hours the business day starts ahead of the ad account's day. `0` means the
   * two agree; anything else means a "day" is not the same day in both systems.
   */
  readonly timeZoneOffsetHours: number | null;
  /** Meta's own currency for this account. */
  readonly adAccountCurrency: string | null;
  /** False when spend cannot be combined with store revenue at all. */
  readonly currencyMatchesReporting: boolean;
  /** True when Meta filled a whole page of campaigns and may have more. */
  readonly campaignsTruncated: boolean;
  /** Campaigns that existed but did not run in this period. */
  readonly dormantCampaigns: number;
  readonly error: MetaFailure | null;
};

export type MarketingData = {
  readonly range: DateRange;
  readonly configured: boolean;
  /** Account name from Meta, for confirming which account is being read. */
  readonly accountName: string | null;
  /** Account-level totals, from Meta's own account row — never summed up. */
  readonly delivery: AdDelivery | null;
  readonly efficiency: AdEfficiency | null;
  readonly campaigns: readonly AdCampaignPerformance[];
  readonly currency: CurrencyCode;
  readonly caveats: MarketingCaveats;
};

function emptyCaveats(error: MetaFailure | null): MarketingCaveats {
  return {
    adAccountTimeZone: null,
    businessTimeZone: BUSINESS_CONFIG.timeZone,
    timeZoneOffsetHours: null,
    adAccountCurrency: null,
    currencyMatchesReporting: true,
    campaignsTruncated: false,
    dormantCampaigns: 0,
    error,
  };
}

function unavailable(range: DateRange, configured: boolean, error: MetaFailure | null): MarketingData {
  return {
    range,
    configured,
    accountName: null,
    delivery: null,
    efficiency: null,
    campaigns: [],
    currency: BUSINESS_CONFIG.reportingCurrency,
    caveats: emptyCaveats(error),
  };
}

/**
 * Meta performance for one period.
 *
 * `cache` de-duplicates within a single render, so a page that needs both the
 * totals and the campaign rows costs one set of requests, not two.
 */
export const getMarketingData = cache(async (range: DateRange): Promise<MarketingData> => {
  if (!isMetaConfigured()) {
    return unavailable(range, false, null);
  }

  try {
    // The identity call supplies the ad account's timezone and currency, which
    // decide whether these figures may be combined with Shopify's at all.
    const [connection, insights] = await Promise.all([
      testMetaConnection(),
      fetchMetaInsights(range),
    ]);

    if (!connection.ok) {
      return unavailable(range, true, {
        message: connection.message,
        guidance: connection.guidance,
      });
    }

    const { account } = connection;
    const reportingCurrency = BUSINESS_CONFIG.reportingCurrency;

    // Insights omit the currency when there was no spend; fall back to the
    // account's own, rather than assuming the reporting currency.
    const adAccountCurrency = insights.currency.length > 0 ? insights.currency : account.currency;
    const currencyMatchesReporting = adAccountCurrency === reportingCurrency;

    const campaigns = insights.campaigns.map((campaign) => ({
      id: campaign.campaignId,
      name: campaign.campaignName,
      delivery: campaign.delivery,
      efficiency: computeAdEfficiency(campaign.delivery),
    }));

    const { active, dormant } = withDelivery(campaigns);

    return {
      range,
      configured: true,
      accountName: account.name,
      delivery: insights.account,
      efficiency: insights.account === null ? null : computeAdEfficiency(insights.account),
      campaigns: rankCampaignsBySpend(active),
      currency: reportingCurrency,
      caveats: {
        adAccountTimeZone: account.timeZone,
        businessTimeZone: BUSINESS_CONFIG.timeZone,
        timeZoneOffsetHours:
          account.timeZone === null
            ? null
            : hoursAheadOf(BUSINESS_CONFIG.timeZone, account.timeZone, new Date()),
        adAccountCurrency,
        currencyMatchesReporting,
        campaignsTruncated: insights.campaignsTruncated,
        dormantCampaigns: dormant,
        error: null,
      },
    };
  } catch (error) {
    if (error instanceof MetaError) {
      return unavailable(range, true, {
        message: error.message,
        guidance: META_FAILURE_GUIDANCE[error.reason],
      });
    }

    return unavailable(range, true, {
      message: 'Meta ad performance could not be read.',
      guidance: 'Check the Meta Ads connection in Settings.',
    });
  }
});

/**
 * Ad spend for a period, ready to be combined with store figures — or `null`.
 *
 * `null` covers every case where combining would be wrong or impossible: no
 * credentials, a failed read, no row for the period, or an ad account reporting
 * in a currency other than the one ICEBOX reports in. The dashboard turns that
 * `null` into "Not connected" rather than a zero.
 */
export async function getMetaSpend(range: DateRange): Promise<{
  readonly spend: Money | null;
  readonly caveats: MarketingCaveats;
  readonly configured: boolean;
}> {
  const data = await getMarketingData(range);

  const combinable =
    data.delivery !== null &&
    data.caveats.currencyMatchesReporting &&
    data.delivery.spend.currency === data.currency;

  return {
    spend: combinable && data.delivery !== null ? data.delivery.spend : null,
    caveats: data.caveats,
    configured: data.configured,
  };
}
