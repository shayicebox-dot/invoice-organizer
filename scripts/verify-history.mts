/**
 * Historical P&L reconciliation.
 *
 * Runs the dashboard's own data path over several past periods at once and
 * prints each one side by side, so a regression in historical costing shows up
 * as a gap between months rather than having to be hunted one range at a time.
 *
 *   npm run verify:history
 *   npm run verify:history -- 2026-06-01:2026-06-30 2026-07-01:2026-07-31
 *
 * With no arguments it checks June, July and August 2026 — the store's whole
 * trading history to date.
 *
 * Net Profit is printed only when every order line in the period maps to a pack
 * size. A period with an unmapped line reports INCOMPLETE and names what is
 * missing, because a profit figure built on partial cost data is worse than no
 * figure at all.
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
const { formatMoney, toMinor, fromMinor } = await import("../src/lib/money");
const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { fetchShopInfo } = await import("../src/lib/shopify/shop");
const { fetchShopifyCogs } = await import("../src/lib/shopify/cogs");
const { readSettings } = await import("../src/lib/business-costs/store");
const { costLine } = await import("../src/lib/business-costs/pack-model");
const { describeIdentity } = await import("../src/lib/business-costs/pack-mapping");
const { identityOf } = await import("../src/lib/data/live-costs");
const { orderHistoryWindow, daysBeyondWindow } = await import("../src/lib/shopify/history-window");
const { getGrantedScopes } = await import("../src/lib/shopify/client");
const { getMetaConfig } = await import("../src/lib/meta/config");
const { getGoogleAdsConfig } = await import("../src/lib/google-ads/config");

const DEFAULT_PERIODS: Array<[string, string, string]> = [
  ["June 2026", "2026-06-01", "2026-06-30"],
  ["July 2026", "2026-07-01", "2026-07-31"],
  ["August 2026 (1–20)", "2026-08-01", "2026-08-20"],
];

const periods = process.argv
  .slice(2)
  .filter((arg) => arg.includes(":"))
  .map((arg) => {
    const [start, end] = arg.split(":");
    return [`${start} .. ${end}`, start, end] as [string, string, string];
  });

const ranges = periods.length > 0 ? periods : DEFAULT_PERIODS;

if (!getShopifyConfig()) {
  console.error("\nShopify is not configured. Set the Shopify variables in .env.local.\n");
  process.exit(1);
}

const settings = await readSettings();
const shop = await fetchShopInfo();

console.log("\nHistorical P&L reconciliation");
console.log("=".repeat(78));
console.log(`Shop : ${shop.name} · ${shop.domain}  (days bucketed in ${shop.timezone})`);
console.log("Path : src/lib/data — the dashboard's own code");

// --- Shopify access -------------------------------------------------------
//
// Printed before any figure, because it decides which of them mean anything.
// The scope list is what Shopify returned with the token, not what the app
// asked for, so it cannot flatter itself.

const today = new Date().toISOString().slice(0, 10);
let scopes: string[] = [];
try {
  scopes = await getGrantedScopes();
} catch (error) {
  console.log(`\n✗ Shopify authentication failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}

const window = await orderHistoryWindow(today);
const readAllOrders = window.cutoff === null;

console.log();
console.log("SHOPIFY ACCESS");
console.log("-".repeat(78));
console.log(`  Granted scopes    ${scopes.length > 0 ? scopes.join(", ") : "(not reported by Shopify)"}`);
console.log(
  `  read_all_orders   ${
    readAllOrders
      ? "GRANTED"
      : window.unknown
        ? "UNCONFIRMED — scopes not reported, assuming the 60-day limit"
        : "NOT GRANTED"
  }`,
);
console.log(
  `  Readable range    ${
    readAllOrders ? `the full order history, through ${today}` : `${window.cutoff} .. ${today}  (last 60 days)`
  }`,
);
if (!readAllOrders) {
  console.log(
    "                    Older orders are absent from the API, not empty — any period",
  );
  console.log(
    "                    reaching past the cutoff reports INCOMPLETE rather than a profit.",
  );
}

// Ad platforms. A period is only a true P&L when both are live; a missing one
// understates cost and would overstate profit.
const metaLive = getMetaConfig() !== null;
const googleLive = getGoogleAdsConfig() !== null;
console.log();
console.log("AD PLATFORMS");
console.log("-".repeat(78));
console.log(`  Meta Ads          ${metaLive ? "configured" : "NOT CONFIGURED — spend will read $0"}`);
console.log(`  Google Ads        ${googleLive ? "configured" : "NOT CONFIGURED — spend will read $0"}`);
console.log(
  `Cost : ${formatMoney(settings.packModel.costPerTenBoxes)} per ten boxes` +
    (settings.packModel.rules.length > 0
      ? `  (+${settings.packModel.rules.length} exception${settings.packModel.rules.length === 1 ? "" : "s"})`
      : "") +
    `   ·   other variable ${(settings.packModel.variableRateOfNetRevenue * 100).toFixed(1)}% of net sales`,
);

interface PeriodResult {
  label: string;
  start: string;
  end: string;
  netSales: number;
  orders: number;
  packs: Map<number, number>;
  unmappedQuantity: number;
  unmappedNames: string[];
  operationalCost: number;
  metaSpend: number;
  googleSpend: number;
  variableCost: number;
  netProfit: number;
  /** True only when every input is real: mapping, order history and ad spend. */
  complete: boolean;
  mappingComplete: boolean;
  adsComplete: boolean;
  /** Days Shopify would not return orders for. */
  missingDays: number;
}

const results: PeriodResult[] = [];

for (const [label, start, end] of ranges) {
  const missingDays = daysBeyondWindow(window, start, end);
  const { days, status } = await getLiveDailyFinancials("all", start, end);
  const adsComplete = status.meta.state === "connected" && status.googleAds.state === "connected";
  const summary = summarize(days);

  const packs = new Map<number, number>();
  let unmappedQuantity = 0;
  const unmappedNames = new Set<string>();

  // includeUnitCost: false keeps this to read_orders + read_products.
  const cogs = await fetchShopifyCogs(start, end, shop, { includeUnitCost: false });
  for (const line of cogs.lines) {
    const identity = identityOf(line);
    const costed = costLine(settings.packModel, line.date, line.quantityCosted, identity);
    if (costed.packSize !== null) {
      packs.set(costed.packSize, (packs.get(costed.packSize) ?? 0) + line.quantityCosted);
    } else if (costed.unmapped) {
      unmappedQuantity += line.quantityCosted;
      unmappedNames.add(describeIdentity(identity));
    }
  }

  results.push({
    label,
    start,
    end,
    netSales: toMinor(summary.netSales),
    orders: summary.orders,
    packs,
    unmappedQuantity,
    unmappedNames: [...unmappedNames],
    operationalCost: toMinor(summary.cogs) + toMinor(summary.shipping),
    metaSpend: toMinor(summary.metaAdSpend),
    googleSpend: toMinor(summary.googleAdSpend),
    variableCost: toMinor(summary.variableExpenses),
    netProfit: toMinor(summary.netProfit),
    complete: status.costs.mappingComplete && adsComplete,
    mappingComplete: status.costs.mappingComplete,
    adsComplete,
    missingDays,
  });
}

// --- Table ----------------------------------------------------------------

const COL = 20;
const label = (text: string) => `  ${text.padEnd(28)}`;
const cell = (text: string) => text.padStart(COL);
const money = (minor: number) => cell(formatMoney(fromMinor(minor)));

console.log();
console.log(label("PERIOD") + results.map((r) => cell(r.label)).join(""));
console.log("-".repeat(30 + COL * results.length));
console.log(label("Shopify net sales") + results.map((r) => money(r.netSales)).join(""));
console.log(label("Orders") + results.map((r) => cell(String(r.orders))).join(""));
console.log();
// Every bundle size that actually sold in any of the periods, smallest first.
const sizesSold = [...new Set(results.flatMap((r) => [...r.packs.keys()]))].sort((a, b) => a - b);
for (const size of sizesSold) {
  console.log(
    label(`${size} box quantity`) +
      results.map((r) => cell(String(r.packs.get(size) ?? 0))).join(""),
  );
}
console.log(
  label("Unmapped quantity") +
    results.map((r) => cell(r.unmappedQuantity === 0 ? "0" : `${r.unmappedQuantity}  ⚠`)).join(""),
);
console.log(
  label("Days Shopify hid") +
    results.map((r) => cell(r.missingDays === 0 ? "0" : `${r.missingDays}  ⚠`)).join(""),
);
console.log();
console.log(label("Operational cost") + results.map((r) => money(r.operationalCost)).join(""));
console.log(label("Meta Ads spend") + results.map((r) => money(r.metaSpend)).join(""));
console.log(label("Google Ads spend") + results.map((r) => money(r.googleSpend)).join(""));
console.log(
  label(`Other variable (${(settings.packModel.variableRateOfNetRevenue * 100).toFixed(0)}%)`) +
    results.map((r) => money(r.variableCost)).join(""),
);
console.log("-".repeat(30 + COL * results.length));
console.log(
  label("NET PROFIT") +
    results.map((r) => (r.complete ? money(r.netProfit) : cell("—"))).join(""),
);
console.log(
  label("P&L status") +
    results.map((r) => cell(r.complete ? "COMPLETE" : "INCOMPLETE")).join(""),
);

// --- What is blocking each period -----------------------------------------

const blocked = results.filter((r) => !r.complete);

if (blocked.length === 0) {
  console.log("\n✓ Every period is fully mapped. Net Profit is reported for all of them.\n");
  process.exit(0);
}

console.log("\nWHAT IS BLOCKING EACH PERIOD");
console.log("-".repeat(78));
for (const result of blocked) {
  console.log(`  ${result.label}  (${result.start} .. ${result.end})`);
  if (result.missingDays > 0) {
    console.log(
      `    ${result.missingDays} day(s) before ${window.cutoff} were not returned by Shopify.` +
        " Request read_all_orders to report on them.",
    );
  }
  if (!result.adsComplete) {
    console.log(
      "    Meta or Google Ads spend is not live for this period, so marketing cost is understated.",
    );
  }
  if (
    result.unmappedNames.length === 0 &&
    result.missingDays === 0 &&
    result.adsComplete
  ) {
    console.log("    Shopify line items could not be read for this period.");
  }
  for (const name of result.unmappedNames) console.log(`    · ${name}`);
  console.log();
}

console.log("  Assign each of these on the Historical Product Mapping page, or with a");
console.log("  mapping entry, then rerun. Until then those periods report no profit.\n");
process.exit(2);
