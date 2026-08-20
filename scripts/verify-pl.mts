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
const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { fetchShopInfo } = await import("../src/lib/shopify/shop");
const { fetchShopifyCogs } = await import("../src/lib/shopify/cogs");
const { readSettings } = await import("../src/lib/business-costs/store");
const { costLine } = await import("../src/lib/business-costs/pack-model");
const { describeIdentity } = await import("../src/lib/business-costs/pack-mapping");
const { identityOf } = await import("../src/lib/data/live-costs");

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

// --- Pack quantities ------------------------------------------------------

/**
 * Pack quantities sold, by pack size. Read separately from the same Shopify
 * data the P&L used, so the split can be reconciled against the totals below.
 */
const packTotals = new Map<number, { quantity: number; cost: number }>();
let unmappedQuantity = 0;
const unmappedNames = new Set<string>();

if (getShopifyConfig()) {
  try {
    const settings = await readSettings();
    const shop = await fetchShopInfo();
    // includeUnitCost: false keeps this to read_orders + read_products.
    const cogs = await fetchShopifyCogs(start, end, shop, { includeUnitCost: false });

    for (const line of cogs.lines) {
      const identity = identityOf(line);
      const costed = costLine(settings.packModel, line.date, line.quantityCosted, identity);

      if (costed.packSize === null) {
        if (costed.unmapped) {
          unmappedQuantity += line.quantityCosted;
          unmappedNames.add(describeIdentity(identity));
        }
        continue;
      }

      const bucket = packTotals.get(costed.packSize) ?? { quantity: 0, cost: 0 };
      bucket.quantity += line.quantityCosted;
      bucket.cost += toMinor(costed.operationalCost);
      packTotals.set(costed.packSize, bucket);
    }
  } catch (error) {
    console.log(
      `\n⚠ Could not read pack quantities: ${error instanceof Error ? error.message : error}`,
    );
  }
}

if (packTotals.size > 0 || unmappedQuantity > 0) {
  console.log("\nPack quantities sold");
  console.log("-".repeat(72));
  console.log(
    `  ${"PACK".padEnd(12)}${"QUANTITY".padStart(10)}${"RATE".padStart(12)}${"OPERATIONAL COST".padStart(20)}`,
  );

  let totalQuantity = 0;
  let totalCost = 0;

  for (const size of [10, 20, 50]) {
    const bucket = packTotals.get(size);
    if (!bucket) continue;
    totalQuantity += bucket.quantity;
    totalCost += bucket.cost;
    const rate = bucket.quantity > 0 ? Math.round(bucket.cost / bucket.quantity) : 0;
    console.log(
      `  ${`${size} pack`.padEnd(12)}${String(bucket.quantity).padStart(10)}` +
        `${formatMoney(fromMinor(rate)).padStart(12)}` +
        `${formatMoney(fromMinor(bucket.cost)).padStart(20)}`,
    );
  }

  console.log("  " + "-".repeat(52));
  console.log(
    `  ${"TOTAL".padEnd(12)}${String(totalQuantity).padStart(10)}${"".padStart(12)}` +
      `${formatMoney(fromMinor(totalCost)).padStart(20)}`,
  );
  console.log(
    `\n  Quantities are line-item pack quantities, not individual boxes.`,
  );

  if (unmappedQuantity > 0) {
    console.log(`\n  ⚠ ${unmappedQuantity} pack quantit${unmappedQuantity === 1 ? "y" : "ies"} unmapped:`);
    for (const name of unmappedNames) console.log(`      ${name}`);
  }
}

// --- The ladder -----------------------------------------------------------

const row = (label: string, amount: number, sign: "+" | "-" | "=" = "-") =>
  console.log(
    `  ${sign} ${label.padEnd(30)} ${formatMoney(fromMinor(Math.abs(amount))).padStart(15)}`,
  );

console.log("\nProfit & Loss");
console.log("-".repeat(72));
console.log(`    ${"Shopify gross sales".padEnd(30)} ${formatMoney(summary.grossSales).padStart(15)}`);
row("Discounts", toMinor(summary.discounts));
row("Sales reversals", toMinor(summary.salesReversals));
console.log("-".repeat(72));
console.log(`  = ${"Shopify NET REVENUE".padEnd(30)} ${formatMoney(summary.netSales).padStart(15)}`);
console.log();
row("Operational cost (packs)", toMinor(summary.cogs));
if (toMinor(summary.shipping) !== 0) row("Extra fulfillment fees", toMinor(summary.shipping));
row("Other variable costs (5%)", toMinor(summary.variableExpenses));
row("Meta Ads spend", toMinor(summary.metaAdSpend));
row("Google Ads spend", toMinor(summary.googleAdSpend));
if (toMinor(summary.paymentFees) !== 0) row("Payment fees", toMinor(summary.paymentFees));
if (toMinor(summary.emailSpend) !== 0) row("Email & SMS platform", toMinor(summary.emailSpend));
console.log("-".repeat(72));
console.log(`  = ${"CONTRIBUTION PROFIT".padEnd(30)} ${formatMoney(summary.contributionProfit).padStart(15)}`);
if (toMinor(summary.fixedExpenses) !== 0) {
  row("Fixed expenses", toMinor(summary.fixedExpenses));
  console.log("-".repeat(72));
}
if (status.costs.mappingComplete) {
  console.log(`  = ${"NET PROFIT".padEnd(30)} ${formatMoney(summary.netProfit).padStart(15)}`);
  console.log(`    ${"Net margin".padEnd(30)} ${formatPercent(summary.netMargin).padStart(15)}`);
  console.log(`    ${"Contribution margin".padEnd(30)} ${formatPercent(summary.contributionMargin).padStart(15)}`);
} else {
  console.log(`  = ${"NET PROFIT".padEnd(30)} ${"INCOMPLETE".padStart(15)}`);
  console.log(
    `\n  ${status.costs.unmappedLineItems} line item(s) covering ` +
      `${status.costs.unmappedQuantity} pack(s) are unmapped, so no profit is reported.`,
  );
}

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
