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
 *
 * ## Why the daily amounts are derived, not rounded independently
 *
 * Costs arrive as `cost_micros`. Rounding each day to cents and then adding
 * those up loses money: ten days each half a cent short lands five cents below
 * the real total, and the dashboard would disagree with the Google Ads UI for
 * no visible reason.
 *
 * So the range total is computed from the raw micros in BigInt and converted
 * once. The per-day amounts are then derived from the *running* micro total,
 * which makes them sum back to that figure exactly while each stays within a
 * cent of its own true value. Daily rows remain honest for display, and the
 * P&L total is never the naive sum of rounded parts.
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
  /** Raw micros for the day. Exact, and the authoritative figure. */
  spendMicros: bigint;
  /**
   * Display amount for the day, derived so that the days in a range sum
   * exactly to the range total. Never rounded independently.
   */
  spend: Money;
  impressions: number;
  clicks: number;
  conversions: number;
  /** Platform-attributed conversion value, in the account currency. */
  conversionValue: Money;
}

/** A whole range, with totals taken from the raw values rather than the parts. */
export interface GoogleAdsRangeMetrics {
  days: GoogleAdsDailyMetrics[];
  /** Sum of every row's cost_micros, before any rounding. */
  totalSpendMicros: bigint;
  /** The single conversion of `totalSpendMicros` to minor units. */
  totalSpend: Money;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  totalConversionValue: Money;
  /** True when the row cursor hit its backstop, so the range is short. */
  truncated: boolean;
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
  return fromMinor(microsToMinorRaw(toMicros(micros)));
}

/** Parse a micro amount into BigInt, tolerating a missing or malformed value. */
export function toMicros(micros: string | number | bigint | undefined): bigint {
  if (micros === undefined || micros === null || micros === "") return 0n;
  try {
    return BigInt(micros);
  } catch {
    return 0n;
  }
}

/** A conversion value arrives as a float in account currency, not micros. */
function valueToMinor(value: number | undefined): Money {
  if (!value || !Number.isFinite(value)) return ZERO;
  return fromMinor(Math.round(value * 100));
}

/**
 * Split a series of exact micro amounts into minor units that sum to exactly
 * the same total as converting the whole series at once.
 *
 * Each entry is the difference between successive roundings of the running
 * total, so the parts always add back to the whole. This is the same idea as
 * `allocate()` in `lib/money`, applied to a series rather than a single amount.
 */
export function allocateMicrosToMinor(amounts: readonly bigint[]): Money[] {
  const out: Money[] = [];
  let running = 0n;
  let previousMinor = 0;

  for (const amount of amounts) {
    running += amount;
    const cumulative = microsToMinorRaw(running);
    out.push(fromMinor(cumulative - previousMinor));
    previousMinor = cumulative;
  }

  return out;
}

/** Micros to minor units as a plain number, rounding half away from zero. */
function microsToMinorRaw(micros: bigint): number {
  const negative = micros < 0n;
  const magnitude = negative ? -micros : micros;
  const whole = magnitude / MICROS_PER_MINOR_UNIT;
  const remainder = magnitude % MICROS_PER_MINOR_UNIT;
  const rounded = remainder * 2n >= MICROS_PER_MINOR_UNIT ? whole + 1n : whole;
  return Number(negative ? -rounded : rounded);
}

function toInt(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Account metadata: display name, billing currency and reporting time zone. */
export async function fetchGoogleAdsAccount(): Promise<GoogleAdsAccount> {
  const config = getGoogleAdsConfig();
  if (!config) throw new GoogleAdsError("Google Ads is not configured.", "config");

  const { rows } = await googleAdsSearch<CustomerRow>(
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
): Promise<GoogleAdsRangeMetrics> {
  const config = getGoogleAdsConfig();
  if (!config) throw new GoogleAdsError("Google Ads is not configured.", "config");

  if (!isISODate(start) || !isISODate(end)) {
    throw new GoogleAdsError(
      `Invalid date range for Google Ads: ${start} .. ${end}`,
      "request",
    );
  }

  const { rows, truncated } = await googleAdsSearch<MetricsRow>(
    "SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, " +
      "metrics.conversions, metrics.conversions_value " +
      `FROM customer WHERE segments.date BETWEEN '${start}' AND '${end}'`,
  );

  interface Bucket {
    date: ISODate;
    spendMicros: bigint;
    impressions: number;
    clicks: number;
    conversions: number;
    conversionValueRaw: number;
  }

  const byDate = new Map<ISODate, Bucket>();

  for (const row of rows) {
    const date = row.segments?.date;
    if (!date || date < start || date > end) continue;

    const metrics = row.metrics ?? {};
    const bucket = byDate.get(date) ?? {
      date,
      spendMicros: 0n,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      conversionValueRaw: 0,
    };

    // Accumulated as exact micros. No rounding happens per row or per day.
    bucket.spendMicros += toMicros(metrics.costMicros);
    bucket.impressions += toInt(metrics.impressions);
    bucket.clicks += toInt(metrics.clicks);
    bucket.conversions += Number(metrics.conversions ?? 0);
    bucket.conversionValueRaw += Number(metrics.conversionsValue ?? 0);

    byDate.set(date, bucket);
  }

  const buckets = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  // Totals come from the raw accumulations, converted exactly once.
  const totalSpendMicros = buckets.reduce((acc, bucket) => acc + bucket.spendMicros, 0n);
  const totalConversionValueRaw = buckets.reduce(
    (acc, bucket) => acc + bucket.conversionValueRaw,
    0,
  );

  // Daily display amounts derived from the running total, so they sum to it.
  const dailySpend = allocateMicrosToMinor(buckets.map((bucket) => bucket.spendMicros));
  const dailyValue = allocateFloatToMinor(buckets.map((bucket) => bucket.conversionValueRaw));

  const days: GoogleAdsDailyMetrics[] = buckets.map((bucket, index) => ({
    date: bucket.date,
    spendMicros: bucket.spendMicros,
    spend: dailySpend[index],
    impressions: bucket.impressions,
    clicks: bucket.clicks,
    conversions: bucket.conversions,
    conversionValue: dailyValue[index],
  }));

  return {
    days,
    totalSpendMicros,
    totalSpend: fromMinor(microsToMinorRaw(totalSpendMicros)),
    totalImpressions: buckets.reduce((acc, bucket) => acc + bucket.impressions, 0),
    totalClicks: buckets.reduce((acc, bucket) => acc + bucket.clicks, 0),
    totalConversions: buckets.reduce((acc, bucket) => acc + bucket.conversions, 0),
    totalConversionValue: valueToMinor(totalConversionValueRaw),
    truncated,
  };
}

/**
 * The same running-total treatment for conversion value, which Google reports
 * as a float rather than micros. Keeps the daily rows summing to the total.
 */
export function allocateFloatToMinor(amounts: readonly number[]): Money[] {
  const out: Money[] = [];
  let running = 0;
  let previousMinor = 0;

  for (const amount of amounts) {
    running += amount;
    const cumulative = Math.round(running * 100);
    out.push(fromMinor(cumulative - previousMinor));
    previousMinor = cumulative;
  }

  return out;
}

/** Strict `YYYY-MM-DD`, and a real calendar date — not just the right shape. */
function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
