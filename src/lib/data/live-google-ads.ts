/**
 * Overlaying real Google Ads spend onto the mock P&L.
 *
 * Mirrors `live-meta.ts`: replaces one input — `googleAdSpend` — then
 * recomputes the two totals that depend on it. The profit ladder consumes
 * `marketingSpend`, so replacing only the Google field would leave Net Profit
 * unchanged and the page silently wrong.
 *
 * Meta spend is read back off each day rather than assumed, so this overlay
 * composes with the Meta overlay in either order and never clobbers it.
 */

import "server-only";

import type { DailyFinancials } from "../finance";
import { type CurrencyCode, ZERO, add } from "../money";
import type { ISODate } from "../types";
import { GoogleAdsError } from "../google-ads/client";
import { getGoogleAdsConfig, missingGoogleAdsEnvNames } from "../google-ads/config";
import {
  type GoogleAdsAccount,
  type GoogleAdsDailyMetrics,
  fetchGoogleAdsAccount,
  fetchGoogleAdsDailyMetrics,
} from "../google-ads/insights";

export type GoogleAdsConnectionState = "connected" | "not_configured" | "error";

export interface GoogleAdsStatus {
  state: GoogleAdsConnectionState;
  accountName: string | null;
  /** Google Ads reports calendar dates in this zone. */
  timeZone: string | null;
  currency: string | null;
  message: string | null;
  /** Google Ads error enum, when the API rejected the call. */
  errorCode: string | null;
  missing: string[];
  lastSyncedAt: string | null;
  daysReturned: number;
}

export const GOOGLE_ADS_NOT_CONFIGURED: GoogleAdsStatus = {
  state: "not_configured",
  accountName: null,
  timeZone: null,
  currency: null,
  message: null,
  errorCode: null,
  missing: [],
  lastSyncedAt: null,
  daysReturned: 0,
};

interface CacheEntry {
  fetchedAt: number;
  days: GoogleAdsDailyMetrics[];
  status: GoogleAdsStatus;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const ACCOUNT_TTL_MS = 600_000;
let accountCache: { value: GoogleAdsAccount; fetchedAt: number } | null = null;

async function getAccount(): Promise<GoogleAdsAccount> {
  if (accountCache && Date.now() - accountCache.fetchedAt < ACCOUNT_TTL_MS) {
    return accountCache.value;
  }
  const value = await fetchGoogleAdsAccount();
  accountCache = { value, fetchedAt: Date.now() };
  return value;
}

function describeError(error: unknown): { message: string; errorCode: string | null } {
  if (error instanceof GoogleAdsError) {
    return { message: error.message, errorCode: error.errorCode ?? null };
  }
  return { message: "Unexpected error while reading from Google Ads.", errorCode: null };
}

/**
 * Daily Google Ads metrics for a window, or `null` when unavailable.
 * Never throws — the caller always gets a usable status.
 *
 * As with Meta, spend in a currency other than the dashboard's reporting
 * currency is refused rather than subtracted from revenue in another currency.
 */
export async function loadGoogleAdsMetrics(
  start: ISODate,
  end: ISODate,
  reportingCurrency: CurrencyCode,
): Promise<{ days: GoogleAdsDailyMetrics[] | null; status: GoogleAdsStatus }> {
  if (!getGoogleAdsConfig()) {
    return {
      days: null,
      status: { ...GOOGLE_ADS_NOT_CONFIGURED, missing: missingGoogleAdsEnvNames() },
    };
  }

  const key = `${start}:${end}:${reportingCurrency}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
    return { days: cached.days, status: cached.status };
  }

  try {
    const account = await getAccount();

    if (account.rawCurrency.toUpperCase() !== reportingCurrency) {
      return {
        days: null,
        status: {
          ...GOOGLE_ADS_NOT_CONFIGURED,
          state: "error",
          accountName: account.name,
          currency: account.rawCurrency,
          message:
            `The Google Ads account bills in ${account.rawCurrency} but the dashboard reports ` +
            `in ${reportingCurrency}. Subtracting one from the other would misstate profit, so ` +
            `Google Ads spend stays on mock data until currency conversion is supported.`,
        },
      };
    }

    const days = await fetchGoogleAdsDailyMetrics(start, end);

    const status: GoogleAdsStatus = {
      state: "connected",
      accountName: account.name,
      timeZone: account.timeZone,
      currency: account.rawCurrency,
      message: null,
      errorCode: null,
      missing: [],
      lastSyncedAt: new Date().toISOString(),
      daysReturned: days.length,
    };

    cache.set(key, { fetchedAt: Date.now(), days, status });
    return { days, status };
  } catch (error) {
    const { message, errorCode } = describeError(error);
    return {
      days: null,
      status: {
        ...GOOGLE_ADS_NOT_CONFIGURED,
        state: "error",
        accountName: accountCache?.value.name ?? null,
        message,
        errorCode,
      },
    };
  }
}

/**
 * Swap mock Google Ads spend for the real figure, then rebuild the totals that
 * depend on it.
 *
 * Google omits days with no activity, so a day absent from the response spent
 * nothing and is zeroed. That is a real result, not an error — carrying mock
 * spend into it would be a fabricated number.
 */
export function applyGoogleAdsSpend(
  days: readonly DailyFinancials[],
  liveMetrics: readonly GoogleAdsDailyMetrics[],
): DailyFinancials[] {
  const byDate = new Map(liveMetrics.map((entry) => [entry.date, entry]));

  return days.map((day) => {
    const live = byDate.get(day.date);
    const googleAdSpend = live ? live.spend : ZERO;
    // Meta's figure is read back off the day, so this composes with the Meta
    // overlay regardless of which ran first.
    const adSpend = add(day.metaAdSpend, googleAdSpend);

    return {
      ...day,
      googleAdSpend,
      adSpend,
      marketingSpend: add(adSpend, day.emailSpend),
    } satisfies DailyFinancials;
  });
}

/** Status only, without pulling metrics. Used by the Connections page. */
export async function probeGoogleAdsStatus(): Promise<GoogleAdsStatus> {
  if (!getGoogleAdsConfig()) {
    return { ...GOOGLE_ADS_NOT_CONFIGURED, missing: missingGoogleAdsEnvNames() };
  }

  try {
    const account = await getAccount();
    return {
      ...GOOGLE_ADS_NOT_CONFIGURED,
      state: "connected",
      accountName: account.name,
      timeZone: account.timeZone,
      currency: account.rawCurrency,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    const { message, errorCode } = describeError(error);
    return { ...GOOGLE_ADS_NOT_CONFIGURED, state: "error", message, errorCode };
  }
}
