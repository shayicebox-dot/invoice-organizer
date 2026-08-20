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

const window = await orderHistoryWindow(new Date().toISOString().slice(0, 10));
console.log(
  "Reach: " +
    (window.cutoff === null
      ? "read_all_orders granted — full order history readable"
      : `orders readable from ${window.cutoff} onward` +
        (window.unknown ? " (granted scopes not reported; assuming the 60-day limit)" : "")),
);
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
  complete: boolean;
  /** Days Shopify would not return orders for. */
  missingDays: number;
}

const results: PeriodResult[] = [];

for (const [label, start, end] of ranges) {
  const missingDays = daysBeyondWindow(window, start, end);
  const { days, status } = await getLiveDailyFinancials("all", start, end);
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
    complete: status.costs.mappingComplete,
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
    results.map((r) => (r.complete ? money(r.netProfit) : cell("INCOMPLETE"))).join(""),
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
  if (result.unmappedNames.length === 0 && result.missingDays === 0) {
    console.log("    Shopify line items could not be read for this period.");
  }
  for (const name of result.unmappedNames) console.log(`    · ${name}`);
  console.log();
}

console.log("  Assign each of these on the Historical Product Mapping page, or with a");
console.log("  mapping entry, then rerun. Until then those periods report no profit.\n");
process.exit(2);
