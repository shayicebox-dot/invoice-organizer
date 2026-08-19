/**
 * Full live P&L verification.
 *
 * Runs the dashboard's own data path for a date range and prints the complete
 * profit ladder, so the Overview can be checked line by line against Shopify,
 * Meta and Google directly.
 *
 *   npm run verify:pl                          last 30 days
 *   npm run verify:pl -- 2026-07-21 2026-08-19 an explicit range
 *
 * Read-only. No credential is printed.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

const { getLiveDailyFinancials } = await import("../src/lib/data");
const { summarize } = await import("../src/lib/finance");
const { formatMoney, formatPercent, toMinor, fromMinor } = await import("../src/lib/money");

const [startArg, endArg] = process.argv.slice(2).filter((a) => !a.startsWith("-"));

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const start = startArg ?? daysAgo(29);
const end = endArg ?? (startArg ? startArg : daysAgo(0));

console.log("\nLive P&L verification");
console.log("=".repeat(72));
console.log(`Range: ${start} .. ${end}`);
console.log("Path : src/lib/data (the dashboard's own code)\n");

const { days, status } = await getLiveDailyFinancials("all", start, end);
const summary = summarize(days);

// --- Sources --------------------------------------------------------------

const label = (value: string) => value.toUpperCase().replace(/_/g, " ");

console.log("Sources");
console.log("-".repeat(72));
console.log(`  Shopify              ${status.shopify.state === "connected" ? "LIVE" : label(status.shopify.state)}${status.shopify.shopName ? ` · ${status.shopify.shopName}` : ""}`);
console.log(`  Meta Ads             ${status.meta.state === "connected" ? "LIVE" : label(status.meta.state)}${status.meta.accountName ? ` · ${status.meta.accountName}` : ""}`);
console.log(`  Google Ads           ${status.googleAds.state === "connected" ? "LIVE" : label(status.googleAds.state)}${status.googleAds.accountName ? ` · ${status.googleAds.accountName}` : ""}`);
console.log(`  COGS                 ${label(status.costs.sources.cogs)}`);
console.log(`  Shipping/fulfillment ${label(status.costs.sources.shipping)}`);
console.log(`  Other variable       ${label(status.costs.sources.otherExpenses)}`);
console.log(`  Klaviyo              ${label(status.costs.sources.klaviyo)}`);

// --- The ladder -----------------------------------------------------------

const row = (label: string, amount: number, sign: "+" | "-" | "=" = "-") =>
  console.log(
    `  ${sign} ${label.padEnd(30)} ${formatMoney(fromMinor(Math.abs(amount))).padStart(15)}`,
  );

console.log("\nProfit & Loss");
console.log("-".repeat(72));
console.log(`    ${"Shopify gross sales".padEnd(30)} ${formatMoney(summary.grossSales).padStart(15)}`);
row("Discounts", toMinor(summary.discounts));
row("Refunds", toMinor(summary.refunds));
console.log("-".repeat(72));
console.log(`  = ${"Shopify NET REVENUE".padEnd(30)} ${formatMoney(summary.netSales).padStart(15)}`);
console.log();
row("Product COGS", toMinor(summary.cogs));
row("Shipping / fulfillment", toMinor(summary.shipping));
row("Other variable costs (5%)", toMinor(summary.variableExpenses));
row("Meta Ads spend", toMinor(summary.metaAdSpend));
row("Google Ads spend", toMinor(summary.googleAdSpend));
if (toMinor(summary.paymentFees) !== 0) row("Payment fees", toMinor(summary.paymentFees));
if (toMinor(summary.emailSpend) !== 0) row("Email & SMS platform", toMinor(summary.emailSpend));
if (toMinor(summary.fixedExpenses) !== 0) row("Fixed expenses", toMinor(summary.fixedExpenses));
console.log("-".repeat(72));
console.log(`  = ${"NET PROFIT".padEnd(30)} ${formatMoney(summary.netProfit).padStart(15)}`);
console.log(`    ${"Net margin".padEnd(30)} ${formatPercent(summary.netMargin).padStart(15)}`);
console.log(`    ${"Contribution profit".padEnd(30)} ${formatMoney(summary.contributionProfit).padStart(15)}`);

// --- Integrity ------------------------------------------------------------

const ladder =
  toMinor(summary.netSales) -
  toMinor(summary.cogs) -
  toMinor(summary.shipping) -
  toMinor(summary.variableExpenses) -
  toMinor(summary.metaAdSpend) -
  toMinor(summary.googleAdSpend) -
  toMinor(summary.paymentFees) -
  toMinor(summary.emailSpend) -
  toMinor(summary.fixedExpenses);

console.log("\nIntegrity");
console.log("-".repeat(72));
console.log(`  net sales − every cost   ${formatMoney(fromMinor(ladder))}`);
console.log(`  reported net profit      ${formatMoney(summary.netProfit)}`);
console.log(`  reconciles               ${ladder === toMinor(summary.netProfit) ? "yes" : "NO"}`);
console.log(`  orders                   ${summary.orders}`);
console.log(`  days in range            ${days.length}`);

if (ladder !== toMinor(summary.netProfit)) {
  console.log("\n✗ FAILED — the ladder does not reconcile.\n");
  process.exit(1);
}

// --- Completeness ---------------------------------------------------------

if (status.costs.issues.length > 0) {
  console.log("\n⚠ The P&L is incomplete");
  console.log("-".repeat(72));
  for (const issue of status.costs.issues) {
    console.log(`  [${issue.section}] ${issue.message}`);
    for (const detail of issue.details.slice(0, 20)) console.log(`      ${detail}`);
  }
  console.log();
  process.exit(2);
}

console.log("\n✓ Every line is real and the ladder reconciles.\n");
