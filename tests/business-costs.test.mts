/**
 * Business cost configuration: proration and calculation.
 *
 * These are the arithmetic a merchant will check against their own
 * spreadsheet, so the assertions are about exact amounts, not shapes.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  dailyShare,
  effectiveRecord,
  isEffectiveOn,
  shareOverDates,
} from "../src/lib/business-costs/proration";
import { calculateCosts, isFixedCategory, unitCostForSku } from "../src/lib/business-costs/calculate";
import type { DailyVolume } from "../src/lib/business-costs/calculate";
import { emptySettings } from "../src/lib/business-costs/defaults";
import type { BusinessCostSettings, RecurringCost } from "../src/lib/business-costs/types";
import { type Money, fromMajor, fromMinor, toMinor } from "../src/lib/money";
import { enumerateDates } from "../src/lib/date-range";

const cost = (over: Partial<RecurringCost> = {}): RecurringCost => ({
  id: "c1",
  name: "Test",
  category: "other",
  amount: fromMajor(310),
  recurrence: "monthly",
  startDate: "2026-01-01",
  endDate: null,
  ...over,
});

describe("proration", () => {
  it("spreads a monthly amount across the exact days of its month", () => {
    // A 31-day month: the daily shares must add back to the billed amount.
    const january = enumerateDates("2026-01-01", "2026-01-31");
    const total = shareOverDates(cost({ amount: fromMajor(310) }), january);
    assert.equal(toMinor(total), toMinor(fromMajor(310)));
  });

  it("handles a short month without losing or inventing a cent", () => {
    const february = enumerateDates("2026-02-01", "2026-02-28");
    const total = shareOverDates(cost({ amount: fromMajor(100) }), february);
    assert.equal(toMinor(total), toMinor(fromMajor(100)));
  });

  it("charges only the days inside a partial range", () => {
    // Ten days of a 31-day month at $310/month is roughly $100.
    const partial = enumerateDates("2026-01-01", "2026-01-10");
    const total = shareOverDates(cost({ amount: fromMajor(310) }), partial);
    assert.equal(toMinor(total), toMinor(fromMajor(100)));
  });

  it("spreads a weekly amount across any seven consecutive days", () => {
    const week = enumerateDates("2026-03-04", "2026-03-10");
    const total = shareOverDates(cost({ amount: fromMajor(70), recurrence: "weekly" }), week);
    assert.equal(toMinor(total), toMinor(fromMajor(70)));
  });

  it("spreads a yearly amount across the whole year", () => {
    const year = enumerateDates("2026-01-01", "2026-12-31");
    const total = shareOverDates(cost({ amount: fromMajor(3650), recurrence: "yearly" }), year);
    assert.equal(toMinor(total), toMinor(fromMajor(3650)));
  });

  it("lands a one-time cost wholly on its date", () => {
    const one = cost({ amount: fromMajor(500), recurrence: "one_time", startDate: "2026-01-15" });
    assert.equal(toMinor(dailyShare(one, "2026-01-15")), toMinor(fromMajor(500)));
    assert.equal(toMinor(dailyShare(one, "2026-01-14")), 0);
    assert.equal(toMinor(dailyShare(one, "2026-01-16")), 0);
  });

  it("charges nothing before the start or after the end", () => {
    const bounded = cost({ startDate: "2026-02-01", endDate: "2026-02-28" });
    assert.equal(toMinor(dailyShare(bounded, "2026-01-31")), 0);
    assert.equal(toMinor(dailyShare(bounded, "2026-03-01")), 0);
    assert.ok(toMinor(dailyShare(bounded, "2026-02-15")) > 0);
  });

  it("picks the most recent effective record when windows overlap", () => {
    const records = [
      { effectiveFrom: "2026-01-01", effectiveTo: null, id: "old" },
      { effectiveFrom: "2026-06-01", effectiveTo: null, id: "new" },
    ];
    assert.equal(effectiveRecord(records, "2026-07-01")?.id, "new");
    assert.equal(effectiveRecord(records, "2026-03-01")?.id, "old");
    assert.equal(effectiveRecord(records, "2025-12-31"), null);
    assert.equal(isEffectiveOn(records[1], "2026-05-31"), false);
  });
});

describe("unitCostForSku", () => {
  const skuCosts = [
    { id: "a", sku: "SKU-1", label: "", unitCost: fromMajor(10), effectiveFrom: "2026-01-01", effectiveTo: "2026-06-01" },
    { id: "b", sku: "SKU-1", label: "", unitCost: fromMajor(12), effectiveFrom: "2026-06-01", effectiveTo: null },
  ];

  it("uses the cost in force on the day, not the latest", () => {
    assert.equal(toMinor(unitCostForSku(skuCosts, "SKU-1", "2026-03-01")!), toMinor(fromMajor(10)));
    assert.equal(toMinor(unitCostForSku(skuCosts, "SKU-1", "2026-07-01")!), toMinor(fromMajor(12)));
  });

  it("returns null for an unconfigured SKU or a date before any window", () => {
    assert.equal(unitCostForSku(skuCosts, "SKU-2", "2026-07-01"), null);
    assert.equal(unitCostForSku(skuCosts, "SKU-1", "2025-01-01"), null);
  });
});

// --- Calculation -----------------------------------------------------------

function volume(over: Partial<DailyVolume> = {}): DailyVolume {
  return {
    date: "2026-03-10",
    orders: 100,
    unitsSold: 250,
    netSales: fromMajor(10_000),
    unitsBySku: { "SKU-1": 150, "SKU-2": 100 },
    shopifyCogs: null,
    ...over,
  };
}

function configured(): BusinessCostSettings {
  const base = emptySettings();
  return {
    ...base,
    cogs: {
      mode: "manual_sku_costs",
      skuCosts: [
        { id: "a", sku: "SKU-1", label: "", unitCost: fromMajor(4), effectiveFrom: "2026-01-01", effectiveTo: null },
        { id: "b", sku: "SKU-2", label: "", unitCost: fromMajor(6), effectiveFrom: "2026-01-01", effectiveTo: null },
      ],
    },
    shipping: {
      rates: [
        { id: "s", label: "Standard", perOrder: fromMajor(5), perUnit: fromMajor(1), sku: null, effectiveFrom: "2026-01-01", effectiveTo: null },
      ],
      fixedFees: [cost({ id: "3pl", name: "3PL", amount: fromMajor(310), startDate: "2026-01-01" })],
    },
    payments: {
      processors: [
        { id: "p", name: "Shopify Payments", percentageRate: 0.029, fixedPerTransaction: fromMajor(0.3), shareOfOrders: 1, effectiveFrom: "2026-01-01", effectiveTo: null },
      ],
    },
    klaviyo: { plans: [cost({ id: "k", name: "Klaviyo", amount: fromMajor(310), category: "software" })] },
    expenses: [cost({ id: "e", name: "Misc", amount: fromMajor(620) })],
  };
}

describe("calculateCosts", () => {
  it("costs goods from units sold times the configured unit cost", () => {
    const result = calculateCosts(configured(), [volume()]);
    // 150 x $4 + 100 x $6 = $1,200
    assert.equal(toMinor(result.days[0].cogs), toMinor(fromMajor(1_200)));
    assert.equal(result.sources.cogs, "manual");
  });

  it("prefers Shopify's own cost per item when that mode is selected", () => {
    const settings = { ...configured(), cogs: { mode: "shopify_cost_per_item" as const, skuCosts: [] } };
    const result = calculateCosts(settings, [volume({ shopifyCogs: fromMajor(999) })]);
    assert.equal(toMinor(result.days[0].cogs), toMinor(fromMajor(999)));
    assert.equal(result.sources.cogs, "live");
  });

  it("reports missing cost data instead of guessing a rate", () => {
    const settings = configured();
    settings.cogs.skuCosts = settings.cogs.skuCosts.filter((entry) => entry.sku !== "SKU-2");
    const result = calculateCosts(settings, [volume()]);

    // Only the costed SKU contributes; the uncosted one is named, not invented.
    assert.equal(toMinor(result.days[0].cogs), toMinor(fromMajor(600)));
    assert.equal(result.sources.cogs, "incomplete");
    assert.deepEqual(result.missingSkus, ["SKU-2"]);
    assert.ok(result.issues.some((issue) => issue.details.includes("SKU-2")));
  });

  it("computes shipping from per-order, per-unit and the prorated 3PL fee", () => {
    const result = calculateCosts(configured(), [volume()]);
    // 100 orders x $5 + 250 units x $1 + $310/31 days = 500 + 250 + 10
    assert.equal(toMinor(result.days[0].shipping), toMinor(fromMajor(760)));
  });

  it("computes payment fees as percentage plus flat per transaction", () => {
    const result = calculateCosts(configured(), [volume()]);
    // 2.9% of $10,000 + 100 x $0.30 = 290 + 30
    assert.equal(toMinor(result.days[0].paymentFees), toMinor(fromMajor(320)));
  });

  it("splits fees across processors by share of orders", () => {
    const settings = configured();
    settings.payments.processors = [
      { id: "a", name: "A", percentageRate: 0.02, fixedPerTransaction: fromMinor(0), shareOfOrders: 0.5, effectiveFrom: "2026-01-01", effectiveTo: null },
      { id: "b", name: "B", percentageRate: 0.04, fixedPerTransaction: fromMinor(0), shareOfOrders: 0.5, effectiveFrom: "2026-01-01", effectiveTo: null },
    ];
    const result = calculateCosts(settings, [volume()]);
    // (2% x 0.5 + 4% x 0.5) of $10,000 = $300
    assert.equal(toMinor(result.days[0].paymentFees), toMinor(fromMajor(300)));
  });

  it("prorates Klaviyo and other expenses per day", () => {
    const result = calculateCosts(configured(), [volume()]);
    assert.equal(toMinor(result.days[0].klaviyo), toMinor(fromMajor(10)));
    assert.equal(toMinor(result.days[0].otherExpenses), toMinor(fromMajor(20)));
  });

  it("splits expenses into variable and overhead by category", () => {
    const settings = configured();
    settings.expenses = [
      cost({ id: "rent", name: "Lease", category: "rent", amount: fromMajor(310) }),
      cost({ id: "pack", name: "Packaging", category: "packaging", amount: fromMajor(620) }),
    ];
    const result = calculateCosts(settings, [volume()]);

    // Rent is overhead and must sit below the contribution line; packaging is
    // volume-driven and sits above it.
    assert.equal(toMinor(result.days[0].fixedExpenses), toMinor(fromMajor(10)));
    assert.equal(toMinor(result.days[0].variableExpenses), toMinor(fromMajor(20)));
    assert.equal(toMinor(result.days[0].otherExpenses), toMinor(fromMajor(30)));
    assert.equal(isFixedCategory("rent"), true);
    assert.equal(isFixedCategory("packaging"), false);
  });

  it("defaults COGS to Shopify's own cost per item", () => {
    // Not a guess: it is data the merchant already maintains in Shopify.
    assert.equal(emptySettings().cogs.mode, "shopify_cost_per_item");
  });

  it("marks the untouched sections mock, and COGS incomplete without Shopify data", () => {
    const result = calculateCosts(emptySettings(), [volume({ shopifyCogs: null })]);

    // COGS is configured by default, so it is not mock — but with no cost data
    // from Shopify it must report incomplete rather than a number.
    assert.equal(result.sources.cogs, "incomplete");
    assert.equal(result.sources.shipping, "mock");
    assert.equal(result.sources.paymentFees, "mock");
    assert.equal(result.sources.klaviyo, "mock");
    assert.equal(result.sources.otherExpenses, "mock");

    // Nothing is invented: every computed line is zero.
    assert.equal(toMinor(result.days[0].cogs), 0);
    assert.equal(toMinor(result.days[0].shipping), 0);
    assert.equal(toMinor(result.days[0].paymentFees), 0);
  });

  it("marks every section mock when COGS is explicitly turned off too", () => {
    const settings = { ...emptySettings(), cogs: { mode: "not_configured" as const, skuCosts: [] } };
    const result = calculateCosts(settings, [volume()]);
    assert.deepEqual(result.sources, {
      cogs: "mock",
      shipping: "mock",
      paymentFees: "mock",
      klaviyo: "mock",
      otherExpenses: "mock",
    });
    assert.equal(result.issues.length, 5, "one issue per unconfigured section");
  });

  it("raises an issue when per-SKU costing has no line-item data", () => {
    const result = calculateCosts(configured(), [volume({ unitsBySku: {} })]);
    assert.equal(result.sources.cogs, "incomplete");
    assert.ok(result.issues.some((issue) => issue.section === "cogs"));
  });

  it("respects a cost change part-way through a range", () => {
    const settings = configured();
    settings.cogs.skuCosts = [
      { id: "a", sku: "SKU-1", label: "", unitCost: fromMajor(4), effectiveFrom: "2026-01-01", effectiveTo: "2026-03-10" },
      { id: "b", sku: "SKU-1", label: "", unitCost: fromMajor(5), effectiveFrom: "2026-03-10", effectiveTo: null },
    ];
    const before = calculateCosts(settings, [
      volume({ date: "2026-03-09", unitsBySku: { "SKU-1": 10 }, unitsSold: 10 }),
    ]);
    const after = calculateCosts(settings, [
      volume({ date: "2026-03-10", unitsBySku: { "SKU-1": 10 }, unitsSold: 10 }),
    ]);

    assert.equal(toMinor(before.days[0].cogs), toMinor(fromMajor(40)));
    assert.equal(toMinor(after.days[0].cogs), toMinor(fromMajor(50)));
  });

  it("totals a whole month back to the billed amounts", () => {
    const dates = enumerateDates("2026-03-01", "2026-03-31");
    const volumes = dates.map((date) => volume({ date, orders: 0, unitsSold: 0, unitsBySku: {}, netSales: fromMinor(0) }));
    const result = calculateCosts(configured(), volumes);

    const klaviyo: Money = result.days.reduce((acc, day) => (acc + day.klaviyo) as Money, fromMinor(0));
    const other: Money = result.days.reduce((acc, day) => (acc + day.otherExpenses) as Money, fromMinor(0));

    assert.equal(toMinor(klaviyo), toMinor(fromMajor(310)), "Klaviyo sums to one month");
    assert.equal(toMinor(other), toMinor(fromMajor(620)), "expenses sum to one month");
  });
});
