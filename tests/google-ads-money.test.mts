/**
 * Google Ads monetary aggregation.
 *
 * The regression these guard against: converting each day's `cost_micros` to
 * cents and then adding those up loses money. Ten days each a fraction of a
 * cent short landed the verified 2026-08-01..10 total three cents below the
 * Google Ads UI.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  allocateFloatToMinor,
  allocateMicrosToMinor,
  microsToMinor,
  toMicros,
} from "../src/lib/google-ads/insights";
import { applyGoogleAdsSpend } from "../src/lib/data/live-google-ads";
import type { GoogleAdsRangeMetrics } from "../src/lib/google-ads/insights";
import { type Money, formatMoney, fromMajor, fromMinor, toMinor } from "../src/lib/money";
import { type DailyFinancials, summarize } from "../src/lib/finance";

/** The verified figure for 2026-08-01 .. 2026-08-10. */
const VERIFIED_TOTAL_MICROS = 2_930_080_000n;
const VERIFIED_TOTAL_MINOR = 293_008;

describe("microsToMinor", () => {
  it("converts the verified range total exactly", () => {
    assert.equal(toMinor(microsToMinor(VERIFIED_TOTAL_MICROS.toString())), VERIFIED_TOTAL_MINOR);
    assert.equal(formatMoney(microsToMinor("2930080000")), "$2,930.08");
  });

  it("rounds half away from zero in both directions", () => {
    assert.equal(toMinor(microsToMinor("5000")), 1);
    assert.equal(toMinor(microsToMinor("4999")), 0);
    assert.equal(toMinor(microsToMinor("15000")), 2);
    assert.equal(toMinor(microsToMinor("-5000")), -1);
  });

  it("stays exact for large amounts", () => {
    assert.equal(toMinor(microsToMinor("999999999999")), 100_000_000);
  });

  it("treats missing or malformed input as zero", () => {
    assert.equal(toMinor(microsToMinor(undefined)), 0);
    assert.equal(toMinor(microsToMinor("")), 0);
    assert.equal(toMinor(microsToMinor("not-a-number")), 0);
    assert.equal(toMicros("nonsense"), 0n);
  });
});

describe("allocateMicrosToMinor", () => {
  /**
   * Ten days that each round *down* by 0.4 of a cent. Summing the rounded
   * days loses four cents; this is the shape of the reported bug.
   */
  const LOSSY_DAYS: bigint[] = [
    293_004_000n, 293_004_000n, 293_004_000n, 293_004_000n,
    293_004_000n, 293_004_000n, 293_004_000n, 293_004_000n,
    293_024_000n, 293_024_000n,
  ];

  it("the naive approach really does lose money (the bug)", () => {
    const naive = LOSSY_DAYS.reduce((acc, micros) => acc + toMinor(microsToMinor(micros.toString())), 0);
    const truth = toMinor(microsToMinor(LOSSY_DAYS.reduce((a, b) => a + b, 0n).toString()));

    assert.equal(truth, VERIFIED_TOTAL_MINOR, "the fixture sums to the verified total");
    assert.notEqual(naive, truth, "summing rounded days must differ, or the fixture is wrong");
    assert.equal(truth - naive, 4, "the naive sum is four cents short");
  });

  it("derived daily amounts sum to exactly the range total", () => {
    const allocated = allocateMicrosToMinor(LOSSY_DAYS);
    const sum = allocated.reduce((acc, amount) => acc + toMinor(amount), 0);

    assert.equal(sum, VERIFIED_TOTAL_MINOR);
    assert.equal(formatMoney(fromMinor(sum)), "$2,930.08");
  });

  it("keeps every day within one cent of its own value", () => {
    for (const [index, amount] of allocateMicrosToMinor(LOSSY_DAYS).entries()) {
      const exact = Number(LOSSY_DAYS[index]) / 10_000;
      assert.ok(
        Math.abs(toMinor(amount) - exact) <= 1,
        `day ${index} drifted more than a cent`,
      );
    }
  });

  it("handles empty, single and zero-value series", () => {
    assert.deepEqual(allocateMicrosToMinor([]), []);
    assert.equal(toMinor(allocateMicrosToMinor([1_234_567n])[0]), 123);
    assert.deepEqual(allocateMicrosToMinor([0n, 0n]).map(toMinor), [0, 0]);
  });

  it("allocates float conversion values the same way", () => {
    const values = [0.005, 0.005, 0.005, 0.005];
    const allocated = allocateFloatToMinor(values);
    const sum = allocated.reduce((acc, amount) => acc + toMinor(amount), 0);
    assert.equal(sum, Math.round(0.02 * 100));
  });
});

describe("applyGoogleAdsSpend", () => {
  const baseDay = (date: string): DailyFinancials => ({
    date,
    currency: "USD",
    grossSales: fromMajor(10_000),
    discounts: fromMajor(500),
    salesReversals: fromMajor(200),
    taxes: fromMajor(0),
    cogs: fromMajor(2_000),
    shipping: fromMajor(800),
    paymentFees: fromMajor(300),
    marketingSpend: fromMajor(1_500),
    variableExpenses: fromMajor(100),
    fixedExpenses: fromMajor(400),
    orders: 100,
    unitsSold: 200,
    adSpend: fromMajor(1_400),
    emailSpend: fromMajor(100),
    metaAdSpend: fromMajor(1_000),
    googleAdSpend: fromMajor(400),
  });

  const range = (spend: Money, date: string): GoogleAdsRangeMetrics => ({
    days: [
      {
        date,
        spendMicros: BigInt(toMinor(spend)) * 10_000n,
        spend,
        impressions: 1,
        clicks: 1,
        conversions: 0,
        conversionValue: fromMinor(0),
      },
    ],
    totalSpendMicros: BigInt(toMinor(spend)) * 10_000n,
    totalSpend: spend,
    totalImpressions: 1,
    totalClicks: 1,
    totalConversions: 0,
    truncated: false,
    totalConversionValue: fromMinor(0),
  });

  const days = [baseDay("2026-08-01")];
  const before = summarize(days);
  const after = summarize(applyGoogleAdsSpend(days, range(fromMajor(650), "2026-08-01")));

  it("replaces Google Ads spend", () => {
    assert.equal(toMinor(after.googleAdSpend), toMinor(fromMajor(650)));
  });

  it("recomputes adSpend as Meta plus Google", () => {
    assert.equal(toMinor(after.adSpend), toMinor(fromMajor(1_650)));
  });

  it("recomputes marketingSpend, which the profit ladder consumes", () => {
    assert.equal(toMinor(after.marketingSpend), toMinor(fromMajor(1_750)));
  });

  it("moves net profit by exactly the spend difference", () => {
    assert.equal(toMinor(before.netProfit) - toMinor(after.netProfit), toMinor(fromMajor(250)));
  });

  it("leaves Meta spend untouched", () => {
    assert.equal(toMinor(after.metaAdSpend), toMinor(before.metaAdSpend));
    assert.equal(toMinor(after.metaAdSpend), toMinor(fromMajor(1_000)));
  });

  it("leaves Shopify revenue untouched", () => {
    assert.equal(toMinor(after.grossSales), toMinor(before.grossSales));
    assert.equal(toMinor(after.discounts), toMinor(before.discounts));
    assert.equal(toMinor(after.salesReversals), toMinor(before.salesReversals));
    assert.equal(after.orders, before.orders);
  });

  it("leaves COGS and every other cost untouched", () => {
    assert.equal(toMinor(after.cogs), toMinor(before.cogs));
    assert.equal(toMinor(after.shipping), toMinor(before.shipping));
    assert.equal(toMinor(after.paymentFees), toMinor(before.paymentFees));
    assert.equal(toMinor(after.variableExpenses), toMinor(before.variableExpenses));
    assert.equal(toMinor(after.fixedExpenses), toMinor(before.fixedExpenses));
    assert.equal(toMinor(after.emailSpend), toMinor(before.emailSpend));
  });

  it("keeps the profit ladder reconciling", () => {
    assert.equal(toMinor(after.netSales) - toMinor(after.totalCosts), toMinor(after.netProfit));
  });

  it("zeroes a day Google returned no row for", () => {
    const zeroed = applyGoogleAdsSpend(days, range(fromMajor(650), "2026-08-02"));
    assert.equal(toMinor(zeroed[0].googleAdSpend), 0);
    assert.equal(toMinor(zeroed[0].adSpend), toMinor(fromMajor(1_000)), "Meta still counted");
  });
});

describe("end-to-end: the verified range through summarize()", () => {
  it("a 10-day range totals exactly $2,930.08 after summarize", () => {
    const micros: bigint[] = [
      293_004_000n, 293_004_000n, 293_004_000n, 293_004_000n,
      293_004_000n, 293_004_000n, 293_004_000n, 293_004_000n,
      293_024_000n, 293_024_000n,
    ];
    const dates = micros.map((_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    const allocated = allocateMicrosToMinor(micros);

    const metrics: GoogleAdsRangeMetrics = {
      days: dates.map((date, i) => ({
        date,
        spendMicros: micros[i],
        spend: allocated[i],
        impressions: 0,
        clicks: 0,
        conversions: 0,
        conversionValue: fromMinor(0),
      })),
      totalSpendMicros: micros.reduce((a, b) => a + b, 0n),
      totalSpend: fromMinor(VERIFIED_TOTAL_MINOR),
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      truncated: false,
    totalConversionValue: fromMinor(0),
    };

    const mockDays: DailyFinancials[] = dates.map((date) => ({
      date,
      currency: "USD",
      grossSales: fromMajor(1_000),
      discounts: fromMinor(0),
      salesReversals: fromMinor(0),
      taxes: fromMinor(0),
      cogs: fromMajor(200),
      shipping: fromMinor(0),
      paymentFees: fromMinor(0),
      marketingSpend: fromMajor(50),
      variableExpenses: fromMinor(0),
      fixedExpenses: fromMinor(0),
      orders: 10,
      unitsSold: 10,
      adSpend: fromMajor(50),
      emailSpend: fromMinor(0),
      metaAdSpend: fromMajor(50),
      googleAdSpend: fromMinor(0),
    }));

    // summarize() adds up the per-day values — the path the dashboard uses.
    const total = summarize(applyGoogleAdsSpend(mockDays, metrics));

    assert.equal(toMinor(total.googleAdSpend), VERIFIED_TOTAL_MINOR);
    assert.equal(formatMoney(total.googleAdSpend), "$2,930.08");
  });
});
