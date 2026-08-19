/**
 * Overlaying real Meta Ads spend onto the mock P&L.
 *
 * Replaces one input — `metaAdSpend` — and then recomputes the two totals that
 * depend on it. The profit ladder consumes `marketingSpend`, so updating only
 * the Meta field would leave Net Profit unchanged and the page silently wrong.
 *
 * Google Ads and the email platform cost stay mock and keep contributing to
 * those totals, which is why they are re-added rather than dropped.
 */

import "server-only";

import type { DailyFinancials } from "../finance";
import { ZERO, add } from "../money";
import type { CurrencyCode } from "../money";
import type { ISODate } from "../types";
import { MetaError } from "../meta/client";
import { getMetaConfig, missingMetaEnvNames } from "../meta/config";
import {
  type MetaAccount,
  type MetaDailySpend,
  fetchMetaAccount,
  fetchMetaDailySpend,
} from "../meta/insights";

export type MetaConnectionState = "connected" | "not_configured" | "error";

export interface MetaStatus {
  state: MetaConnectionState;
  accountName: string | null;
  /** Ad account timezone, which is how Meta buckets its days. */
  timezone: string | null;
  currency: string | null;
  message: string | null;
  missing: string[];
  lastSyncedAt: string | null;
  truncated: boolean;
  daysReturned: number;
}

export const META_NOT_CONFIGURED: MetaStatus = {
  state: "not_configured",
  accountName: null,
  timezone: null,
  currency: null,
  message: null,
  missing: [],
  lastSyncedAt: null,
  truncated: false,
  daysReturned: 0,
};

interface CacheEntry {
  fetchedAt: number;
  days: MetaDailySpend[];
  status: MetaStatus;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

const ACCOUNT_TTL_MS = 600_000;
let accountCache: { value: MetaAccount; fetchedAt: number } | null = null;

async function getAccount(): Promise<MetaAccount> {
  if (accountCache && Date.now() - accountCache.fetchedAt < ACCOUNT_TTL_MS) {
    return accountCache.value;
  }
  const value = await fetchMetaAccount();
  accountCache = { value, fetchedAt: Date.now() };
  return value;
}

function describeError(error: unknown): string {
  if (error instanceof MetaError) return error.message;
  return "Unexpected error while reading from Meta.";
}

/**
 * Daily Meta spend for a window, or `null` when Meta is unavailable.
 * Never throws — the caller always gets a usable status.
 *
 * `reportingCurrency` is the currency the dashboard is adding up. If the ad
 * account bills in something else, the spend is refused rather than subtracted
 * from revenue in another currency: that would produce a Net Profit that looks
 * plausible and is wrong. Converting it would need a daily FX rate table,
 * which the app does not have yet.
 */
export async function loadMetaSpend(
  start: ISODate,
  end: ISODate,
  reportingCurrency: CurrencyCode,
): Promise<{ days: MetaDailySpend[] | null; status: MetaStatus }> {
  if (!getMetaConfig()) {
    return { days: null, status: { ...META_NOT_CONFIGURED, missing: missingMetaEnvNames() } };
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
          ...META_NOT_CONFIGURED,
          state: "error",
          accountName: account.name,
          currency: account.rawCurrency,
          message:
            `The Meta ad account bills in ${account.rawCurrency} but the dashboard reports in ` +
            `${reportingCurrency}. Subtracting one from the other would misstate profit, so ad ` +
            `spend stays on mock data until currency conversion is supported.`,
        },
      };
    }

    const { days, truncated } = await fetchMetaDailySpend(start, end);

    const status: MetaStatus = {
      state: "connected",
      accountName: account.name,
      timezone: account.timezone,
      currency: account.rawCurrency,
      message: null,
      missing: [],
      lastSyncedAt: new Date().toISOString(),
      truncated,
      daysReturned: days.length,
    };

    cache.set(key, { fetchedAt: Date.now(), days, status });
    return { days, status };
  } catch (error) {
    return {
      days: null,
      status: {
        ...META_NOT_CONFIGURED,
        state: "error",
        accountName: accountCache?.value.name ?? null,
        message: describeError(error),
      },
    };
  }
}

/**
 * Swap mock Meta spend for the real figure, then rebuild the totals that
 * depend on it so the profit ladder recalculates.
 *
 * A day Meta returned no row for spent nothing, so it is zeroed rather than
 * left carrying mock spend.
 */
export function applyMetaSpend(
  days: readonly DailyFinancials[],
  liveSpend: readonly MetaDailySpend[],
): DailyFinancials[] {
  const byDate = new Map(liveSpend.map((entry) => [entry.date, entry]));

  return days.map((day) => {
    const live = byDate.get(day.date);
    const metaAdSpend = live ? live.spend : ZERO;
    const adSpend = add(metaAdSpend, day.googleAdSpend);

    return {
      ...day,
      metaAdSpend,
      adSpend,
      marketingSpend: add(adSpend, day.emailSpend),
    } satisfies DailyFinancials;
  });
}

/** Status only, without pulling insights. Used by the Connections page. */
export async function probeMetaStatus(): Promise<MetaStatus> {
  if (!getMetaConfig()) {
    return { ...META_NOT_CONFIGURED, missing: missingMetaEnvNames() };
  }

  try {
    const account = await getAccount();
    return {
      ...META_NOT_CONFIGURED,
      state: "connected",
      accountName: account.name,
      timezone: account.timezone,
      currency: account.rawCurrency,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { ...META_NOT_CONFIGURED, state: "error", message: describeError(error) };
  }
}
