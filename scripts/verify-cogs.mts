/**
 * Line-by-line COGS verification against the real Shopify store.
 *
 * Prints every costed line — order, SKU, quantity, Shopify's cost per item and
 * the resulting line cost — so a total can be checked against Shopify's own
 * reports rather than taken on trust.
 *
 *   npm run verify:cogs
 *   npm run verify:cogs -- 2026-08-01 2026-08-10
 *
 * Uses the same code path the dashboard uses. No credential is printed.
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

const { fetchShopifyCogs } = await import("../src/lib/shopify/cogs");
const { fetchShopInfo } = await import("../src/lib/shopify/orders");
const { getGrantedScopes } = await import("../src/lib/shopify/client");
const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { formatMoney, toMinor } = await import("../src/lib/money");

const [startArg, endArg] = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const start = startArg ?? new Date().toISOString().slice(0, 10);
const end = endArg ?? start;

const REQUIRED_SCOPES = ["read_orders", "read_products", "read_inventory"];

console.log("\nShopify COGS verification");
console.log("=".repeat(96));
console.log(`Range: ${start} .. ${end}\n`);

if (!getShopifyConfig()) {
  console.log("✗ Shopify is not configured. Set SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and");
  console.log("  SHOPIFY_CLIENT_SECRET in .env.local.\n");
  process.exit(1);
}

// --- Scopes ---------------------------------------------------------------

let granted: string[] = [];
try {
  granted = await getGrantedScopes();
} catch (error) {
  console.log(`✗ Authentication failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}

if (granted.length === 0) {
  console.log("Granted scopes: not reported by Shopify (cannot verify — proceeding).\n");
} else {
  console.log(`Granted scopes: ${granted.join(", ")}`);
  const missing = REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) {
    console.log(`\n✗ Missing required scope(s): ${missing.join(", ")}`);
    console.log("  Add them to the app's configuration in Shopify and re-authorize, then rerun.\n");
    process.exit(1);
  }
  console.log("✓ All required scopes present\n");
}

// --- Costing --------------------------------------------------------------

const shop = await fetchShopInfo();
console.log(`Shop: ${shop.name} · days bucketed in ${shop.timezone}\n`);

const result = await fetchShopifyCogs(start, end, shop);

if (result.lines.length === 0) {
  console.log("No order line items in this range.\n");
  process.exit(0);
}

const pad = (value: string, width: number) => value.padEnd(width).slice(0, width);
const rpad = (value: string, width: number) => value.padStart(width);

console.log(
  pad("ORDER", 10) +
    pad("DATE", 12) +
    pad("SKU", 22) +
    rpad("SOLD", 6) +
    rpad("RTND", 6) +
    rpad("COSTED", 8) +
    rpad("UNIT COST", 12) +
    rpad("LINE COGS", 13),
);
console.log("-".repeat(96));

for (const line of result.lines) {
  console.log(
    pad(line.orderName, 10) +
      pad(line.date, 12) +
      pad(line.sku, 22) +
      rpad(String(line.quantitySold), 6) +
      rpad(line.quantityRestocked > 0 ? String(line.quantityRestocked) : "-", 6) +
      rpad(String(line.quantityCosted), 8) +
      rpad(line.unitCost === null ? "MISSING" : formatMoney(line.unitCost), 12) +
      rpad(line.unitCost === null ? "—" : formatMoney(line.lineCogs), 13),
  );
}

console.log("-".repeat(96));
console.log(rpad("TOTAL COGS", 83) + rpad(formatMoney(result.totalCogs), 13));

// --- Per day --------------------------------------------------------------

console.log("\nPer day");
console.log("-".repeat(60));
for (const day of result.byDate) {
  console.log(
    pad(day.date, 14) +
      rpad(formatMoney(day.cogs), 14) +
      rpad(`${day.packQuantitiesCosted} packs costed`, 16) +
      rpad(day.packQuantitiesMissingCost > 0 ? `${day.packQuantitiesMissingCost} missing` : "", 16),
  );
}

// --- Integrity ------------------------------------------------------------

const lineSum = result.lines.reduce((acc, line) => acc + toMinor(line.lineCogs), 0);
const daySum = result.byDate.reduce((acc, day) => acc + toMinor(day.cogs), 0);
const totalMinor = toMinor(result.totalCogs);

console.log("\nIntegrity");
console.log("-".repeat(60));
console.log(`  sum of lines      ${formatMoney(result.totalCogs)}`);
console.log(`  sum of days       ${formatMoney(result.byDate[0]?.cogs ?? result.totalCogs)}${result.byDate.length > 1 ? " (…)" : ""}`);
console.log(`  lines == days     ${lineSum === daySum ? "yes" : "NO"}`);
console.log(`  days  == total    ${daySum === totalMinor ? "yes" : "NO"}`);

if (lineSum !== daySum || daySum !== totalMinor) {
  console.log("\n✗ FAILED — the line, day and range totals disagree.\n");
  process.exit(1);
}

if (result.missingCostSkus.length > 0) {
  console.log("\n⚠ Missing cost per item in Shopify");
  console.log("-".repeat(60));
  for (const sku of result.missingCostSkus) console.log(`  ${sku}`);
  console.log(
    `\n  ${result.packQuantitiesMissingCost} pack quantities could not be costed. COGS understates by an unknown`,
  );
  console.log("  amount until a cost per item is set on those variants in Shopify.");
  console.log("  The dashboard marks the P&L incomplete while this is true.\n");
  process.exit(2);
}

if (result.truncated) {
  console.log("\n⚠ The range exceeded the order page limit; totals are incomplete.\n");
  process.exit(2);
}

console.log("\n✓ Every unit costed. COGS is complete for this range.\n");
