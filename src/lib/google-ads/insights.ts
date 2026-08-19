/**
 * Reading real ad spend and performance from the Google Ads API.
 *
 * `segments.date` is a calendar date in the *ad account's* time zone, which is
 * how Google Ads reports and how its own UI displays. The dashboard's selected
 * range is passed straight through, so a figure here matches what the merchant
 * sees in the Google Ads interface for the same dates.
 *
 * Google omits days with no activity entirely rather than returning a zero row.
 * Callers must treat a missing day as zero, not as a failure — see
 * `applyGoogleAdsSpend`.
 */

import "server-only";

import { type CurrencyCode, type Money, ZERO, fromMinor } from "../money";
import type { ISODate } from "../types";
import { GoogleAdsError, googleAdsSearch } from "./client";
import { getGoogleAdsConfig } from "./config";

const SUPPORTED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "ILS"];

/** 1 currency unit = 1,000,000 micros = 100 minor units, so 1 minor = 10,000. */
const MICROS_PER_MINOR_UNIT = 10_000n;

export interface GoogleAdsAccount {
  id: string;
  name: string;
  currency: CurrencyCode;
  /** Raw code as Google reported it, even if unsupported here. */
  rawCurrency: string;
  timeZone: string;
  status: string;
}

export interface GoogleAdsDailyMetrics {
  date: ISODate;
  spend: Money;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Platform-attributed conversion value, in the account currency. */
  conversionValue: Money;
}

interface CustomerRow {
  customer?: {
    id?: string;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    status?: string;
  };
}

interface MetricsRow {
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
  };
}

function toCurrency(code: string): CurrencyCode | null {
  const upper = code.toUpperCase() as CurrencyCode;
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : null;
}

/**
 * Convert micros to integer minor units, rounding half away from zero.
 *
 * Done in BigInt because micros are exact integers and a large account's spend
 * would lose precision as a float before it ever reached the P&L.
 */
export function microsToMinor(micros: string | number | undefined): Money {
  if (micros === undefined || micros === null || micros === "") return ZERO;

  let value: bigint;
  try {
    value = BigInt(micros);
  } catch {
    return ZERO;
  }

  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = magnitude / MICROS_PER_MINOR_UNIT;
  const remainder = magnitude % MICROS_PER_MINOR_UNIT;
  const rounded = remainder * 2n >= MICROS_PER_MINOR_UNIT ? whole + 1n : whole;

  return fromMinor(Number(negative ? -rounded : rounded));
}

/** A conversion value arrives as a float in account currency, not micros. */
function valueToMinor(value: number | undefined): Money {
  if (!value || !Number.isFinite(value)) return ZERO;
  return fromMinor(Math.round(value * 100));
}

function toInt(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Account metadata: display name, billing currency and reporting time zone. */
export async function fetchGoogleAdsAccount(): Promise<GoogleAdsAccount> {
  const config = getGoogleAdsConfig();
  if (!config) throw new GoogleAdsError("Google Ads is not configured.", "config");

  const rows = await googleAdsSearch<CustomerRow>(
    "SELECT customer.id, customer.descriptive_name, customer.currency_code, " +
      "customer.time_zone, customer.status FROM customer",
  );

  const customer = rows[0]?.customer ?? {};
  const rawCurrency = customer.currencyCode ?? "USD";

  return {
    id: customer.id ?? config.customerId,
    name: customer.descriptiveName ?? `Customer ${config.customerId}`,
    currency: toCurrency(rawCurrency) ?? "USD",
    rawCurrency,
    timeZone: customer.timeZone ?? "unknown",
    status: customer.status ?? "UNKNOWN",
  };
}

/**
 * Daily account-level metrics for an inclusive date range.
 *
 * `FROM customer` aggregates every campaign, which is the account total the
 * P&L needs. Dates are bound directly into the GAQL predicate; they are
 * validated as `YYYY-MM-DD` first so nothing unchecked reaches the query.
 */
export async function fetchGoogleAdsDailyMetrics(
  start: ISODate,
  end: ISODate,
): Promise<GoogleAdsDailyMetrics[]> {
  const config = getGoogleAdsConfig();
  if (!config) throw new GoogleAdsError("Google Ads is not configured.", "config");

  if (!isISODate(start) || !isISODate(end)) {
    throw new GoogleAdsError(
      `Invalid date range for Google Ads: ${start} .. ${end}`,
      "request",
    );
  }

  const rows = await googleAdsSearch<MetricsRow>(
    "SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, " +
      "metrics.conversions, metrics.conversions_value " +
      `FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`,
  );

  const byDate = new Map<ISODate, GoogleAdsDailyMetrics>();

  for (const row of rows) {
    const date = row.segments?.date;
    if (!date || date < start || date > end) continue;

    const metrics = row.metrics ?? {};
    const bucket = byDate.get(date) ?? {
      date,
      spend: ZERO,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValue: ZERO,
    };

    bucket.spend = (bucket.spend + microsToMinor(metrics.costMicros)) as Money;
    bucket.impressions += toInt(metrics.impressions);
    bucket.clicks += toInt(metrics.clicks);
    bucket.conversions += Number(metrics.conversions ?? 0);
    bucket.conversionValue = (bucket.conversionValue +
      valueToMinor(metrics.conversionsValue)) as Money;

    byDate.set(date, bucket);
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Strict `YYYY-MM-DD`, and a real calendar date — not just the right shape. */
function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
