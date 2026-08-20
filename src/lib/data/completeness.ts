/**
 * Whether a period's P&L can be trusted enough to state a profit.
 *
 * Profit is the bottom of a subtraction, so it inherits every gap above it. A
 * missing order, an unmapped line, an ad platform that returned short — each
 * one leaves a cost out and makes profit look better than it was. None of them
 * announces itself in the arithmetic: the statement still balances, it is just
 * wrong in the flattering direction.
 *
 * So the four inputs are checked explicitly and the reasons are named. A
 * period is complete only when all four hold, and the UI withholds every
 * profit and margin figure until then.
 */

import type { DayCoverage } from "./day-coverage";
import type { BusinessCostStatus } from "./live-costs";
import type { GoogleAdsStatus } from "./live-google-ads";
import type { MetaStatus } from "./live-meta";
import type { ShopifyStatus } from "./live-shopify";

export interface LiveSourceStatus {
  shopify: ShopifyStatus;
  meta: MetaStatus;
  googleAds: GoogleAdsStatus;
  costs: BusinessCostStatus;
  /** Whether every requested calendar day came back exactly once. */
  coverage: DayCoverage;
}

export type CompletenessGap =
  | "incomplete_range"
  | "shopify_disconnected"
  | "shopify_truncated"
  | "shopify_history_limited"
  | "unmapped_lines"
  | "meta_incomplete"
  | "google_incomplete";

export interface Completeness {
  /** True only when every input below is real and whole. */
  complete: boolean;
  gaps: CompletenessGap[];
  /** One sentence per gap, ready to render. */
  reasons: string[];
}

/** Assess a period. Pure, so the gate is testable without any network. */
export function assessCompleteness(status: LiveSourceStatus): Completeness {
  const gaps: CompletenessGap[] = [];
  const reasons: string[] = [];

  const add = (gap: CompletenessGap, reason: string) => {
    gaps.push(gap);
    reasons.push(reason);
  };

  // Checked first, and separately from every source: a day that is missing from
  // the series is not a source reporting zero, it is a day nothing could report
  // on. Totals built from a short series still reconcile against each other,
  // so this is the only check that catches it.
  const coverage = status.coverage;
  if (!coverage.complete) {
    const parts: string[] = [];
    if (coverage.missingCount > 0) {
      parts.push(
        `${coverage.missingCount} of ${coverage.requested} requested day` +
          `${coverage.requested === 1 ? "" : "s"} produced no record` +
          (coverage.missing.length > 0 ? ` (${coverage.missing.join(", ")}…)` : ""),
      );
    }
    if (coverage.duplicates.length > 0) {
      parts.push(`${coverage.duplicates.length} date(s) appeared twice, double counting them`);
    }
    if (coverage.outOfRange.length > 0) {
      parts.push(`${coverage.outOfRange.length} date(s) fell outside the requested range`);
    }
    if (parts.length === 0) {
      parts.push(`${coverage.returned} records came back for ${coverage.requested} days`);
    }
    add("incomplete_range", `The reporting range is incomplete: ${parts.join("; ")}.`);
  }

  if (status.shopify.state !== "connected") {
    add(
      "shopify_disconnected",
      status.shopify.message ??
        "Shopify is not connected, so revenue for this period is not real.",
    );
  } else if (status.shopify.truncated) {
    add(
      "shopify_truncated",
      "The Shopify order read stopped before the end of the range, so some orders " +
        "in this period were never loaded. Narrow the range and try again.",
    );
  }

  const limit = status.costs.historyLimit;
  if (limit) {
    add(
      "shopify_history_limited",
      `Shopify will not return orders before ${limit.cutoff} to this app, so ` +
        `${limit.daysMissing} day${limit.daysMissing === 1 ? "" : "s"} of this range ` +
        `could not be loaded. Those days are invisible, not quiet.`,
    );
  }

  if (status.costs.unmapped.length > 0) {
    add(
      "unmapped_lines",
      `${status.costs.unmappedLineItems} order line` +
        `${status.costs.unmappedLineItems === 1 ? "" : "s"} covering ` +
        `${status.costs.unmappedQuantity} pack` +
        `${status.costs.unmappedQuantity === 1 ? "" : "s"} are not mapped to a box ` +
        `quantity, so no operational cost was applied to them.`,
    );
  } else if (!status.costs.mappingComplete && !limit) {
    add(
      "unmapped_lines",
      status.costs.lineItemError ??
        "Shopify line items could not be read for this period, so packs cannot be costed.",
    );
  }

  // An ad platform that is merely unconfigured is just as damaging as one that
  // failed: either way marketing cost is understated and profit is overstated.
  if (status.meta.state !== "connected") {
    add(
      "meta_incomplete",
      status.meta.message ??
        "Meta Ads spend did not load for this period, so marketing cost is understated.",
    );
  } else if (status.meta.truncated) {
    add("meta_incomplete", "Meta Ads returned a short range, so its spend is understated.");
  }

  if (status.googleAds.state !== "connected") {
    add(
      "google_incomplete",
      status.googleAds.message ??
        "Google Ads spend did not load for this period, so marketing cost is understated.",
    );
  } else if (status.googleAds.truncated) {
    add("google_incomplete", "Google Ads returned a short range, so its spend is understated.");
  }

  return { complete: gaps.length === 0, gaps, reasons };
}
