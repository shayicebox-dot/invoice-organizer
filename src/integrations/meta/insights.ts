import 'server-only';

import { metaGet, requireGraphObject } from '@/integrations/meta/client';
import { getMetaConfig } from '@/integrations/meta/config';
import { MetaResponseError } from '@/integrations/meta/errors';
import { isRecord, readField, requireArray, requireString } from '@/integrations/shopify/json';
import { moneyFromDecimalString, parseCurrencyCode, zeroMoney, type Money } from '@/core/money';
import type { AdDelivery } from '@/core/metrics/marketing';
import type { DateRange } from '@/core/period';

/**
 * Reading spend and performance from Meta's Insights API.
 *
 * This module maps Meta's payloads into ICEBOX types and stops there. It reads
 * only what is measured — spend, impressions, reach, link clicks, attributed
 * purchases and their value — and computes nothing. Frequency, CPM, CTR, CPC,
 * CPA and ROAS are all derived in `src/core/metrics/marketing.ts` from these
 * measures, so each carries its inputs and can be checked. Meta publishes its
 * own pre-computed versions of those; they are deliberately not read, so there
 * is one definition of each rather than two that can drift apart.
 */

/**
 * Action types Meta uses for a purchase, in the order we prefer them.
 *
 * `omni_purchase` is Meta's deduplicated cross-channel purchase and is the
 * closest match to "a sale happened". The pixel-specific types are fallbacks
 * for accounts that do not report the omni variant.
 */
const PURCHASE_ACTION_TYPES: readonly string[] = [
  'omni_purchase',
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
];

/**
 * Fields requested from the Insights endpoint.
 *
 * `account_currency` is requested with the metrics deliberately: Meta returns
 * amounts as bare decimal strings, so without it an amount would arrive with no
 * currency attached and have to be assumed.
 */
const INSIGHT_FIELDS: readonly string[] = [
  'account_currency',
  'spend',
  'impressions',
  'reach',
  'inline_link_clicks',
  'actions',
  'action_values',
];

const CAMPAIGN_FIELDS: readonly string[] = ['campaign_id', 'campaign_name', ...INSIGHT_FIELDS];

/** Campaigns Meta will return in one page. Accounts accumulate hundreds. */
const CAMPAIGN_PAGE_LIMIT = 500;

export type MetaCampaignInsight = {
  readonly campaignId: string;
  readonly campaignName: string;
  readonly delivery: AdDelivery;
};

export type MetaInsights = {
  /** Account-level totals. `null` when Meta reports no row for the period. */
  readonly account: AdDelivery | null;
  readonly campaigns: readonly MetaCampaignInsight[];
  /** The ad account's currency — spend is meaningless without it. */
  readonly currency: string;
  /**
   * True when Meta returned a full page of campaigns, so there may be more.
   * Surfaced rather than silently ignored: a truncated list would understate
   * the account.
   */
  readonly campaignsTruncated: boolean;
};

/**
 * Insights for a period, at account level and per campaign.
 *
 * Meta's `time_range` is interpreted in the ad account's own timezone, which
 * may differ from the business timezone Shopify figures are bucketed by. That
 * difference is real and belongs in the caveats a screen shows, not in a
 * silent adjustment here.
 *
 * Account totals come from Meta's own account-level row, never from summing the
 * campaign rows: reach is deduplicated across campaigns, so summing it would
 * overcount people, and a truncated campaign page would understate spend.
 */
export async function fetchMetaInsights(range: DateRange): Promise<MetaInsights> {
  const config = getMetaConfig();
  const timeRange = JSON.stringify({ since: range.start, until: range.end });

  const [accountPayload, campaignPayload] = await Promise.all([
    metaGet({
      path: `${config.adAccountId}/insights`,
      params: { fields: INSIGHT_FIELDS.join(','), time_range: timeRange, level: 'account' },
      config,
    }),
    metaGet({
      path: `${config.adAccountId}/insights`,
      params: {
        fields: CAMPAIGN_FIELDS.join(','),
        time_range: timeRange,
        level: 'campaign',
        limit: String(CAMPAIGN_PAGE_LIMIT),
      },
      config,
    }),
  ]);

  const accountRows = parseRows(accountPayload, 'account insights');
  const campaignRows = parseRows(campaignPayload, 'campaign insights');
  const currency = readCurrency(accountRows, campaignRows);

  const firstAccountRow = accountRows[0];

  return {
    account: firstAccountRow === undefined ? null : toDelivery(firstAccountRow, currency),
    campaigns: campaignRows.flatMap((row) => toCampaign(row, currency)),
    currency,
    campaignsTruncated: campaignRows.length >= CAMPAIGN_PAGE_LIMIT,
  };
}

function parseRows(payload: unknown, path: string): readonly Record<string, unknown>[] {
  const envelope = requireGraphObject(payload, path);
  const data = requireArray(readField(envelope, 'data'), `${path}.data`);

  return data.map((row, index) => {
    if (!isRecord(row)) {
      throw new MetaResponseError(`Expected an object at ${path}.data[${index}].`);
    }
    return row;
  });
}

/**
 * The currency every amount in the response is denominated in.
 *
 * Meta returns bare decimal strings with no currency attached, so the account's
 * currency has to come from somewhere. Requesting it alongside the metrics
 * keeps the amount and its currency together, rather than assuming.
 */
function readCurrency(
  accountRows: readonly Record<string, unknown>[],
  campaignRows: readonly Record<string, unknown>[],
): string {
  for (const row of [...accountRows, ...campaignRows]) {
    const currency = readField(row, 'account_currency');
    if (typeof currency === 'string' && currency.length > 0) return currency;
  }

  // Insights omit the currency when there is no spend to report. The caller
  // resolves it from the account itself in that case.
  return '';
}

/** A campaign row, or nothing when Meta omits the identity fields. */
function toCampaign(row: Record<string, unknown>, currency: string): readonly MetaCampaignInsight[] {
  const campaignId = readOptionalString(row, 'campaign_id');
  if (campaignId === null) return [];

  return [
    {
      campaignId,
      // Campaign names are the advertiser's own text — Hebrew, emoji and
      // bidirectional marks included. Carried through exactly as Meta reports
      // it; presentation is the screen's problem.
      campaignName: readOptionalString(row, 'campaign_name') ?? campaignId,
      delivery: toDelivery(row, currency),
    },
  ];
}

function toDelivery(row: Record<string, unknown>, currency: string): AdDelivery {
  return {
    spend: readMoney(row, 'spend', currency) ?? zeroFor(currency),
    impressions: readCount(row, 'impressions'),
    reach: readCount(row, 'reach'),
    linkClicks: readCount(row, 'inline_link_clicks'),
    purchases: readActionCount(row, 'actions'),
    purchaseValue: readActionMoney(row, 'action_values', currency),
  };
}

function readOptionalString(row: Record<string, unknown>, key: string): string | null {
  const value = readField(row, key);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Meta returns counts as decimal strings. */
function readCount(row: Record<string, unknown>, key: string): number {
  const value = readField(row, key);
  if (typeof value === 'number') return Math.round(value);
  if (typeof value !== 'string' || value.length === 0) return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

function readMoney(row: Record<string, unknown>, key: string, currency: string): Money | null {
  const value = readField(row, key);
  if (typeof value !== 'string' || value.length === 0) return null;
  return toMoney(value, currency);
}

/** Sum the purchase action, preferring Meta's deduplicated `omni_purchase`. */
function readActionCount(row: Record<string, unknown>, key: string): number | null {
  const entry = findPurchaseAction(row, key);
  if (entry === null) return null;

  const parsed = Number(entry);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function readActionMoney(
  row: Record<string, unknown>,
  key: string,
  currency: string,
): Money | null {
  const entry = findPurchaseAction(row, key);
  return entry === null ? null : toMoney(entry, currency);
}

function findPurchaseAction(row: Record<string, unknown>, key: string): string | null {
  const list = readField(row, key);
  if (!Array.isArray(list)) return null;

  for (const preferred of PURCHASE_ACTION_TYPES) {
    for (const item of list) {
      if (!isRecord(item)) continue;
      if (readField(item, 'action_type') !== preferred) continue;

      const value = readField(item, 'value');
      if (typeof value === 'string' && value.length > 0) return value;
      if (typeof value === 'number') return String(value);
    }
  }

  return null;
}

/**
 * Meta amounts are decimal strings; they become integer minor units without
 * ever passing through a float. An unmodelled currency is an error rather than
 * something to coerce.
 */
function toMoney(amount: string, currency: string): Money {
  return moneyFromDecimalString(amount, requireCurrency(currency));
}

function zeroFor(currency: string): Money {
  return zeroMoney(requireCurrency(currency));
}

function requireCurrency(currency: string) {
  const code = parseCurrencyCode(currency);

  if (code === null) {
    throw new MetaResponseError(
      `Unsupported ad account currency "${currency}". Add it to CurrencyCode before reading this account.`,
    );
  }

  return code;
}

/** Field list, exported so the connection test can explain what will be read. */
export function describeRequestedMetrics(): readonly string[] {
  return INSIGHT_FIELDS;
}

/** Account-level currency lookup used when insights report none. */
export async function fetchAccountCurrency(): Promise<string> {
  const config = getMetaConfig();
  const payload = await metaGet({
    path: config.adAccountId,
    params: { fields: 'currency' },
    config,
  });

  return requireString(
    readField(requireGraphObject(payload, 'account'), 'currency'),
    'account.currency',
  );
}
