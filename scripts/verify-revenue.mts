/**
 * Shopify revenue reconciliation.
 *
 * Runs the dashboard's own Shopify sales path over a date range and prints the
 * figures next to the ShopifyQL query that produces the same report inside
 * Shopify, so the two can be compared line for line.
 *
 *   npm run verify:revenue                          last 30 days
 *   npm run verify:revenue -- 2026-08-01 2026-08-20 an explicit range
 *
 * Expected values can be asserted, which is what makes this a check rather
 * than a printout. Nothing is baked in — the numbers come from the command
 * line, so the same command verifies any range:
 *
 *   npm run verify:revenue -- 2026-08-01 2026-08-20 \
 *     --gross=49325.00 --discounts=699.50 --reversals=470.00 \
 *     --net=48155.50 --taxes=430.11 --orders=189
 *
 * Exits non-zero if any asserted value differs. Read-only; no credential is
 * printed.
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

const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { fetchShopInfo } = await import("../src/lib/shopify/shop");
const { fetchShopifySales, netSalesOf } = await import("../src/lib/shopify/sales");
const { formatMoney, toMinor, fromMinor, parseDecimalToMinor, add, sum } = await import(
  "../src/lib/money"
);
import type { Money } from "../src/lib/money";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flags = new Map<string, string>();
for (const arg of args.filter((a) => a.startsWith("--"))) {
  const [key, value] = arg.slice(2).split("=");
  if (value !== undefined) flags.set(key, value);
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const start = positional[0] ?? daysAgo(29);
const end = positional[1] ?? (positional[0] ? positional[0] : daysAgo(0));

if (!getShopifyConfig()) {
  console.error("\nShopify is not configured. Set the Shopify variables in .env.local.\n");
  process.exit(1);
}

console.log("\nShopify revenue reconciliation");
console.log("=".repeat(74));
console.log(`Range: ${start} .. ${end}`);

const shop = await fetchShopInfo();
console.log(`Shop : ${shop.name} · ${shop.domain}`);
console.log(`Days are bucketed in the shop's reporting timezone: ${shop.timezone}\n`);

const { days, ordersScanned, ledgerOrders, truncated } = await fetchShopifySales(start, end, shop);

const totals = {
  grossSales: sum(days.map((d) => d.grossSales)),
  discounts: sum(days.map((d) => d.discounts)),
  salesReversals: sum(days.map((d) => d.salesReversals)),
  taxes: sum(days.map((d) => d.taxes)),
  shippingCharges: sum(days.map((d) => d.shippingCharges)),
  orders: days.reduce((acc, d) => acc + d.orders, 0),
  unitsSold: days.reduce((acc, d) => acc + d.unitsSold, 0),
};
const netSales = sum(days.map(netSalesOf));
const totalSales = add(add(netSales, totals.shippingCharges), totals.taxes);

const pad = (value: string, width: number) => value.padStart(width);
const money = (amount: Money) => pad(formatMoney(amount, shop.currency), 14);

console.log("Daily");
console.log("-".repeat(74));
console.log(
  `  ${"Date".padEnd(12)}${pad("Gross", 12)}${pad("Discounts", 12)}${pad("Reversals", 12)}${pad("Net sales", 13)}${pad("Orders", 8)}`,
);
for (const day of days) {
  console.log(
    `  ${day.date.padEnd(12)}${pad(formatMoney(day.grossSales, shop.currency), 12)}${pad(formatMoney(day.discounts, shop.currency), 12)}${pad(formatMoney(day.salesReversals, shop.currency), 12)}${pad(formatMoney(netSalesOf(day), shop.currency), 13)}${pad(String(day.orders), 8)}`,
  );
}

console.log(`\nTotals — Shopify Analytics definitions`);
console.log("-".repeat(74));
console.log(`    ${"Gross sales".padEnd(34)}${money(totals.grossSales)}`);
console.log(`  − ${"Discounts".padEnd(34)}${money(totals.discounts)}`);
console.log(`  − ${"Sales reversals".padEnd(34)}${money(totals.salesReversals)}`);
console.log("-".repeat(74));
console.log(`  = ${"NET SALES".padEnd(34)}${money(netSales)}`);
console.log(`  + ${"Shipping charges".padEnd(34)}${money(totals.shippingCharges)}`);
console.log(`  + ${"Taxes (excluded from the P&L)".padEnd(34)}${money(totals.taxes)}`);
console.log("-".repeat(74));
console.log(`  = ${"Total sales".padEnd(34)}${money(totalSales)}`);
console.log();
console.log(`    ${"Orders".padEnd(34)}${pad(String(totals.orders), 14)}`);
console.log(`    ${"Net items sold".padEnd(34)}${pad(String(totals.unitsSold), 14)}`);

console.log(`\nHow it was read`);
console.log("-".repeat(74));
console.log(`  Orders scanned in the window            ${ordersScanned}`);
console.log(`  Read from the full sales ledger         ${ledgerOrders}  (edited, returned or cancelled)`);
console.log(`  Window complete                         ${truncated ? "NO — a page cap was hit" : "yes"}`);

console.log(`\nCompare against Shopify by running this in Analytics → Reports → ShopifyQL:`);
console.log(
  `  FROM sales SHOW orders, gross_sales, discounts, sales_reversals, net_sales, taxes, total_sales SINCE ${start} UNTIL ${end}`,
);

// --- Assertions -----------------------------------------------------------

const expectations: [string, string, Money][] = [
  ["gross", "Gross sales", totals.grossSales],
  ["discounts", "Discounts", totals.discounts],
  ["reversals", "Sales reversals", totals.salesReversals],
  ["net", "Net sales", netSales],
  ["taxes", "Taxes", totals.taxes],
  ["shipping", "Shipping charges", totals.shippingCharges],
];

const failures: string[] = [];
let asserted = 0;

for (const [flag, label, actual] of expectations) {
  const raw = flags.get(flag);
  if (raw === undefined) continue;
  asserted += 1;
  const expected = parseDecimalToMinor(raw.replace(/[,$]/g, ""), shop.currency);
  if (toMinor(expected) !== toMinor(actual)) {
    failures.push(
      `${label}: expected ${formatMoney(expected, shop.currency)}, got ${formatMoney(actual, shop.currency)} (off by ${formatMoney(fromMinor(toMinor(actual) - toMinor(expected)), shop.currency)})`,
    );
  }
}

const expectedOrders = flags.get("orders");
if (expectedOrders !== undefined) {
  asserted += 1;
  if (Number(expectedOrders) !== totals.orders) {
    failures.push(`Orders: expected ${expectedOrders}, got ${totals.orders}`);
  }
}

if (asserted > 0) {
  console.log(`\nVerification`);
  console.log("-".repeat(74));
  if (failures.length === 0) {
    console.log(`  PASS — all ${asserted} expected values match exactly.\n`);
  } else {
    for (const failure of failures) console.log(`  FAIL — ${failure}`);
    console.log();
    process.exit(1);
  }
} else {
  console.log();
}
