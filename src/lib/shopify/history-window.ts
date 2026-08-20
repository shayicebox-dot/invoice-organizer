/**
 * How far back Shopify will let this app read orders.
 *
 * An app without the `read_all_orders` scope can only read orders from the last
 * 60 days. Older ones are not an error and not an empty page — they are simply
 * absent from the results, which is the dangerous shape: a range that reaches
 * past the cutoff comes back looking like a quiet trading period rather than a
 * period the app cannot see.
 *
 * Left undetected that produces the worst possible P&L: revenue and cost both
 * read as zero for the invisible days, every line reconciles against itself,
 * and the statement reports a confident profit for a month it never loaded.
 * So the window is computed explicitly and any range that crosses it marks the
 * P&L incomplete.
 *
 * `read_all_orders` is granted by Shopify on request for apps that genuinely
 * need order history; it is not a scope an app can simply add to its manifest.
 */

import "server-only";

import type { ISODate } from "../types";
import { hasScope } from "./client";

/** Shopify's limit for apps without `read_all_orders`. */
export const ORDER_HISTORY_DAYS = 60;

export interface OrderHistoryWindow {
  /** Earliest date orders can be read for. `null` when there is no limit. */
  cutoff: ISODate | null;
  /**
   * True when `read_all_orders` was confirmed granted, so history is complete.
   */
  unrestricted: boolean;
  /**
   * True when Shopify did not report the granted scopes, so the limit could
   * not be confirmed either way. Treated as restricted: claiming a profit for
   * a period we might not have loaded is the failure this guard exists for.
   */
  unknown: boolean;
}

function shiftDays(date: ISODate, days: number): ISODate {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * The order-history window as of `today`. Never throws — a failure to read the
 * granted scopes reports `unknown` rather than breaking the page.
 */
export async function orderHistoryWindow(today: ISODate): Promise<OrderHistoryWindow> {
  let granted: boolean | null;
  try {
    granted = await hasScope("read_all_orders");
  } catch {
    granted = null;
  }

  if (granted === true) return { cutoff: null, unrestricted: true, unknown: false };

  return {
    cutoff: shiftDays(today, -ORDER_HISTORY_DAYS),
    unrestricted: false,
    unknown: granted === null,
  };
}

/** Days of the requested range that fall before the cutoff. */
export function daysBeyondWindow(
  window: OrderHistoryWindow,
  start: ISODate,
  end: ISODate,
): number {
  if (window.cutoff === null || start >= window.cutoff) return 0;
  const last = end < window.cutoff ? end : shiftDays(window.cutoff, -1);
  if (last < start) return 0;
  const ms = Date.parse(`${last}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.floor(ms / 86_400_000) + 1;
}
