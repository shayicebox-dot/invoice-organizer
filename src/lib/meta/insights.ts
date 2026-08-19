/**
 * Reading real ad spend from the Meta Marketing API.
 *
 * `time_increment=1` asks Meta for one row per day, which is what the daily
 * P&L needs — a single total for the range could not be spread across days
 * without inventing a distribution.
 *
 * Meta buckets days in the *ad account's* timezone, which may differ from the
 * Shopify store's. The account timezone is fetched so the UI can disclose it.
 */

import "server-only";

import { type CurrencyCode, type Money, ZERO, parseDecimalToMinor } from "../money";
import type { ISODate } from "../types";
import { MetaError, metaGetUrl, metaGetWith } from "./client";
import { type MetaConfig, adAccountNode, getMetaConfig } from "./config";

/** Rows per page. A 31-day range fits in one; the default page size is 25. */
const PAGE_LIMIT = 500;
/** Hard stop so pagination can never loop indefinitely. */
const MAX_PAGES = 10;

const SUPPORTED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "ILS"];

export interface MetaAccount {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Raw currency code as Meta reported it, even if unsupported here. */
  rawCurrency: string;
  timezone: string;
}

export interface MetaDailySpend {
  date: ISODate;
  spend: Money;
  impressions: number;
  clicks: number;
}

interface InsightsRow {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
}

interface Paged<T> {
  data: T[];
  paging?: { next?: string };
}

function toCurrency(code: string): CurrencyCode | null {
  const upper = code.toUpperCase() as CurrencyCode;
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : null;
}

function toInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Account metadata: display name, billing currency and reporting timezone. */
export async function fetchMetaAccount(): Promise<MetaAccount> {
  const config = getMetaConfig();
  if (!config) throw new MetaError("Meta is not configured.", "config");

  const data = await metaGetWith<{
    id?: string;
    name?: string;
    currency?: string;
    timezone_name?: string;
  }>(config, adAccountNode(config), { fields: "id,name,currency,timezone_name" });

  const rawCurrency = data.currency ?? "USD";

  return {
    id: data.id ?? adAccountNode(config),
    name: data.name ?? adAccountNode(config),
    currency: toCurrency(rawCurrency) ?? "USD",
    rawCurrency,
    timezone: data.timezone_name ?? "unknown",
  };
}

/**
 * Daily spend across the whole account for an inclusive date range.
 *
 * `level=account` aggregates every campaign, so this is total Meta spend —
 * the figure the P&L needs — rather than a per-campaign breakdown.
 */
export async function fetchMetaDailySpend(
  start: ISODate,
  end: ISODate,
): Promise<{ days: MetaDailySpend[]; truncated: boolean }> {
  const config = getMetaConfig();
  if (!config) throw new MetaError("Meta is not configured.", "config");

  const first = await metaGetWith<Paged<InsightsRow>>(config, `${adAccountNode(config)}/insights`, {
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since: start, until: end }),
    fields: "spend,impressions,clicks,date_start,date_stop",
    limit: String(PAGE_LIMIT),
  });

  const rows: InsightsRow[] = [...first.data];
  let next = first.paging?.next;
  let pages = 1;
  let truncated = false;

  while (next) {
    if (pages >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const page: Paged<InsightsRow> = await metaGetUrl(config as MetaConfig, next);
    rows.push(...page.data);
    next = page.paging?.next;
    pages += 1;
  }

  return { days: normalizeRows(rows, start, end), truncated };
}

/**
 * Fold raw insight rows into one entry per day.
 *
 * Meta returns `date_start`/`date_stop` already in the account timezone, so
 * `date_start` is the calendar day. Rows outside the requested window are
 * dropped defensively; Meta honours `time_range`, but a stray row would
 * otherwise inflate a day's spend.
 */
function normalizeRows(rows: InsightsRow[], start: ISODate, end: ISODate): MetaDailySpend[] {
  const totals = new Map<ISODate, MetaDailySpend>();

  for (const row of rows) {
    const date = row.date_start;
    if (!date || date < start || date > end) continue;

    const bucket = totals.get(date) ?? {
      date,
      spend: ZERO,
      impressions: 0,
      clicks: 0,
    };

    if (row.spend) {
      // Meta reports spend as a decimal string in the account currency.
      bucket.spend = (bucket.spend + parseDecimalToMinor(row.spend)) as Money;
    }
    bucket.impressions += toInt(row.impressions);
    bucket.clicks += toInt(row.clicks);

    totals.set(date, bucket);
  }

  return [...totals.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
