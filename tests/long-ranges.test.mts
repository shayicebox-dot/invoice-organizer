/**
 * Long historical ranges.
 *
 * A wide window does not fail loudly — it comes back short, and a short range
 * reads exactly like a quiet trading period. So these tests are mostly about
 * the guards: which gaps must withhold a profit figure, and whether a year's
 * months can be trusted to add up to the year.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  addMonths,
  daysBetween,
  endOfMonth,
  enumerateMonths,
  resolveDateRange,
  startOfYear,
} from "../src/lib/date-range";
import { assessCompleteness } from "../src/lib/data/completeness";
import type { LiveSourceStatus } from "../src/lib/data/completeness";

describe("long-range presets", () => {
  it("runs year to date from January 1", () => {
    const range = resolveDateRange("ytd", undefined, undefined, "2026-08-20");
    assert.equal(range.start, "2026-01-01");
    assert.equal(range.end, "2026-08-20");
  });

  it("makes the last twelve months exactly twelve months long", () => {
    const range = resolveDateRange("12m", undefined, undefined, "2026-08-20");
    assert.equal(range.start, "2025-08-21");
    assert.equal(range.end, "2026-08-20");
  });

  it("runs month to date from the first of the month", () => {
    const range = resolveDateRange("this-month", undefined, undefined, "2026-08-20");
    assert.equal(range.start, "2026-08-01");
    assert.equal(daysBetween(range.start, range.end), 20);
  });

  it("accepts a custom multi-month range", () => {
    const range = resolveDateRange("custom", "2026-01-01", "2026-08-20", "2026-08-20");
    assert.equal(range.preset, "custom");
    assert.equal(daysBetween(range.start, range.end), 232);
  });

  it("clamps a month shift to the last day of a shorter month", () => {
    assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  });

  it("knows where months and years start and end", () => {
    assert.equal(startOfYear("2026-08-20"), "2026-01-01");
    assert.equal(endOfMonth("2026-02-10"), "2026-02-28");
    assert.equal(endOfMonth("2026-08-01"), "2026-08-31");
  });

  it("enumerates every month a range touches, including partial ones", () => {
    assert.deepEqual(enumerateMonths("2026-01-15", "2026-04-02"), [
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    assert.deepEqual(enumerateMonths("2026-08-01", "2026-08-20"), ["2026-08"]);
  });
});

// --- The profit gate -------------------------------------------------------

function status(over: Partial<LiveSourceStatus> = {}): LiveSourceStatus {
  return {
    shopify: {
      state: "connected",
      shopName: "Kicksbox",
      shopDomain: "example.myshopify.com",
      timezone: "America/New_York",
      message: null,
      missing: [],
      lastSyncedAt: null,
      truncated: false,
      ordersFetched: 500,
      ledgerOrders: 12,
    },
    meta: {
      state: "connected",
      accountName: "Kicksbox",
      currency: "USD",
      message: null,
      missing: [],
      lastSyncedAt: null,
      truncated: false,
      daysReturned: 232,
    },
    googleAds: {
      state: "connected",
      accountName: "Kicksbox",
      timeZone: "America/New_York",
      currency: "USD",
      message: null,
      errorCode: null,
      missing: [],
      lastSyncedAt: null,
      daysReturned: 232,
      truncated: false,
    },
    costs: {
      configured: true,
      sources: {
        cogs: "manual_real",
        shipping: "not_configured",
        paymentFees: "manual_real",
        klaviyo: "not_configured",
        otherExpenses: "manual_real",
      },
      issues: [],
      missingSkus: [],
      lineItemError: null,
      mappingComplete: true,
      unmapped: [],
      unmappedLineItems: 0,
      unmappedQuantity: 0,
      historyLimit: null,
      updatedAt: new Date(0).toISOString(),
    },
    ...over,
  } as LiveSourceStatus;
}

describe("the profit gate", () => {
  it("passes only when every input is whole", () => {
    const result = assessCompleteness(status());
    assert.equal(result.complete, true);
    assert.deepEqual(result.gaps, []);
  });

  it("withholds profit when Shopify paging stopped short", () => {
    const base = status();
    const result = assessCompleteness({
      ...base,
      shopify: { ...base.shopify, truncated: true },
    });
    assert.equal(result.complete, false);
    assert.ok(result.gaps.includes("shopify_truncated"));
  });

  it("withholds profit when part of the range is beyond Shopify's reach", () => {
    const base = status();
    const result = assessCompleteness({
      ...base,
      costs: {
        ...base.costs,
        mappingComplete: false,
        historyLimit: { cutoff: "2026-06-21", daysMissing: 20, scopeUnknown: false },
      },
    });
    assert.equal(result.complete, false);
    assert.ok(result.gaps.includes("shopify_history_limited"));
    // Not also reported as a mapping problem — nothing is unmapped, the days
    // simply never arrived.
    assert.equal(result.gaps.includes("unmapped_lines"), false);
  });

  it("withholds profit when Meta returned a short range", () => {
    const base = status();
    const result = assessCompleteness({ ...base, meta: { ...base.meta, truncated: true } });
    assert.equal(result.complete, false);
    assert.ok(result.gaps.includes("meta_incomplete"));
  });

  it("treats an unconfigured ad platform as damaging as a failed one", () => {
    // Either way marketing cost is understated, which overstates profit.
    const base = status();
    const result = assessCompleteness({
      ...base,
      googleAds: { ...base.googleAds, state: "not_configured" },
    });
    assert.equal(result.complete, false);
    assert.ok(result.gaps.includes("google_incomplete"));
  });

  it("names every gap at once rather than stopping at the first", () => {
    const base = status();
    const result = assessCompleteness({
      ...base,
      shopify: { ...base.shopify, truncated: true },
      meta: { ...base.meta, state: "error", message: "Meta rejected the token." },
      googleAds: { ...base.googleAds, truncated: true },
    });
    assert.equal(result.gaps.length, 3);
    assert.equal(result.reasons.length, 3);
    assert.ok(result.reasons.some((reason) => reason.includes("Meta rejected the token.")));
  });
});
