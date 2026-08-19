/**
 * Live smoke test for the Google Ads integration.
 *
 * Unlike `google-ads-connectivity-test.mjs`, which talks to the API directly,
 * this exercises the *production* code path the dashboard uses:
 * `loadGoogleAdsMetrics` and `applyGoogleAdsSpend` from `src/lib/data`. If this
 * passes, the dashboard is reading the same numbers.
 *
 *   npm run smoke:google-ads
 *   npm run smoke:google-ads -- 2026-08-01 2026-08-10 2930.08
 *
 * The third argument is an expected total in major units; the run exits
 * non-zero if the live total does not match it.
 *
 * No credential is printed.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local before anything reads process.env. Next does this itself for
// the app; a plain script has to do it explicitly.
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

const { loadGoogleAdsMetrics, applyGoogleAdsSpend } = await import("../src/lib/data/live-google-ads");
const { formatMoney, toMinor, fromMajor, sum } = await import("../src/lib/money");
const { summarize } = await import("../src/lib/finance");
const { getDailyFinancials } = await import("../src/lib/data");

const [startArg, endArg, expectedArg] = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const start = startArg ?? "2026-08-01";
const end = endArg ?? "2026-08-10";

console.log("\nGoogle Ads live smoke test");
console.log("=".repeat(60));
console.log(`Range: ${start} .. ${end}`);
console.log("Path : src/lib/data/live-google-ads.ts (the dashboard's own code)\n");

const { metrics, status } = await loadGoogleAdsMetrics(start, end, "USD");

console.log(`state        ${status.state}`);
console.log(`account      ${status.accountName ?? "—"}`);
console.log(`time zone    ${status.timeZone ?? "—"}`);
console.log(`currency     ${status.currency ?? "—"}`);
if (status.message) console.log(`message      ${status.message}`);
if (status.errorCode) console.log(`error code   ${status.errorCode}`);

if (!metrics) {
  console.log("\n✗ FAILED — no live data returned. Google Ads would fall back to mock.");
  process.exit(1);
}

const days = metrics.days;
console.log(`days         ${days.length}\n`);
console.log("  DATE          SPEND      IMPR   CLICKS     CONV    CONV VALUE");
console.log("  " + "-".repeat(62));
for (const day of days) {
  console.log(
    "  " +
      day.date.padEnd(12) +
      formatMoney(day.spend).padStart(11) +
      day.impressions.toLocaleString("en-US").padStart(10) +
      day.clicks.toLocaleString("en-US").padStart(9) +
      day.conversions.toFixed(2).padStart(9) +
      formatMoney(day.conversionValue).padStart(14),
  );
}
console.log("  " + "-".repeat(62));

// Authoritative totals: the raw micro sum, converted exactly once.
const totalSpend = metrics.totalSpend;
const totalImpressions = metrics.totalImpressions;
const totalClicks = metrics.totalClicks;
const totalConversions = metrics.totalConversions;
const totalValue = metrics.totalConversionValue;

// The daily figures must add back to that total. summarize() sums per-day
// values, so if this drifts, the dashboard's Overview total drifts with it.
const naiveDailySum = sum(days.map((day) => day.spend));
const dailySumMatches = toMinor(naiveDailySum) === toMinor(totalSpend);

console.log(
  "  " +
    "TOTAL".padEnd(12) +
    formatMoney(totalSpend).padStart(11) +
    totalImpressions.toLocaleString("en-US").padStart(10) +
    totalClicks.toLocaleString("en-US").padStart(9) +
    totalConversions.toFixed(2).padStart(9) +
    formatMoney(totalValue).padStart(14),
);

// --- Overlay: prove the P&L actually moves --------------------------------

console.log(`\nraw cost_micros total   ${metrics.totalSpendMicros.toString()}`);
console.log(`converted once          ${formatMoney(totalSpend)}`);
console.log(`sum of daily figures    ${formatMoney(naiveDailySum)}  ${dailySumMatches ? "(matches)" : "(DRIFTED)"}`);

if (!dailySumMatches) {
  console.log("\n✗ FAILED — daily figures do not sum to the range total.");
  console.log("  The dashboard sums per-day values, so its total would be wrong too.");
  process.exit(1);
}

console.log("\nOverlay effect on the P&L");
console.log("-".repeat(60));

const mockDays = await getDailyFinancials("all", start, end);
if (mockDays.length > 0) {
  const before = summarize(mockDays);
  const after = summarize(applyGoogleAdsSpend(mockDays, metrics));

  const row = (label: string, b: string, a: string) =>
    console.log(`  ${label.padEnd(18)} ${b.padStart(14)} -> ${a.padStart(14)}`);

  row("googleAdSpend", formatMoney(before.googleAdSpend), formatMoney(after.googleAdSpend));
  row("adSpend", formatMoney(before.adSpend), formatMoney(after.adSpend));
  row("marketingSpend", formatMoney(before.marketingSpend), formatMoney(after.marketingSpend));
  row("contribution", formatMoney(before.contributionProfit), formatMoney(after.contributionProfit));
  row("netProfit", formatMoney(before.netProfit), formatMoney(after.netProfit));

  const reconciles = toMinor(after.netSales) - toMinor(after.totalCosts) === toMinor(after.netProfit);
  const metaUntouched = toMinor(before.metaAdSpend) === toMinor(after.metaAdSpend);
  const cogsUntouched = toMinor(before.cogs) === toMinor(after.cogs);
  const revenueUntouched = toMinor(before.grossSales) === toMinor(after.grossSales);
  const googleApplied = toMinor(after.googleAdSpend) === toMinor(totalSpend);

  console.log();
  console.log(`  ladder reconciles      ${reconciles ? "yes" : "NO"}`);
  console.log(`  Meta untouched         ${metaUntouched ? "yes" : "NO"}`);
  console.log(`  COGS untouched         ${cogsUntouched ? "yes" : "NO"}`);
  console.log(`  Shopify rev untouched  ${revenueUntouched ? "yes" : "NO"}`);
  console.log(`  Google total applied   ${googleApplied ? "yes" : "NO"}`);

  if (!reconciles || !metaUntouched || !cogsUntouched || !revenueUntouched || !googleApplied) {
    console.log("\n✗ FAILED — the overlay did not behave correctly.");
    process.exit(1);
  }
}

// --- Expected total --------------------------------------------------------

if (expectedArg) {
  const expected = fromMajor(Number(expectedArg));
  const matches = toMinor(totalSpend) === toMinor(expected);
  console.log(
    `\nExpected ${formatMoney(expected)} / actual ${formatMoney(totalSpend)} — ${matches ? "MATCH" : "MISMATCH"}`,
  );
  if (!matches) {
    console.log("✗ FAILED — live total does not match the expected figure.");
    process.exit(1);
  }
}

console.log("\n✓ Google Ads live smoke test PASSED\n");
