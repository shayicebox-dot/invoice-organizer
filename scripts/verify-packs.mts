/**
 * Pack mapping report.
 *
 * Answers two questions about a real date range: which Shopify products and
 * variants were mapped to a 10, 20 or 50 pack, and which could not be mapped
 * confidently and are therefore contributing no cost.
 *
 *   npm run verify:packs                        last 30 days
 *   npm run verify:packs -- 2026-08-01 2026-08-10   an explicit range
 *
 * Exits non-zero when anything is unmapped, because an unmapped line means the
 * P&L understates cost. No credential is printed.
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
const { fetchShopInfo } = await import("../src/lib/shopify/shop");
const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { getGrantedScopes } = await import("../src/lib/shopify/client");
const { readSettings } = await import("../src/lib/business-costs/store");
const { costLine, matchPack } = await import("../src/lib/business-costs/pack-model");
const { formatMoney, toMinor, fromMinor } = await import("../src/lib/money");

const [startArg, endArg] = process.argv.slice(2).filter((a) => !a.startsWith("-"));

/** Default window: the last 30 days, ending today. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

const start = startArg ?? daysAgo(29);
const end = endArg ?? (startArg ? startArg : daysAgo(0));

console.log("\nPack mapping report");
console.log("=".repeat(108));
console.log(`Range: ${start} .. ${end}\n`);

if (!getShopifyConfig()) {
  console.log("✗ Shopify is not configured. Set the SHOPIFY_* variables in .env.local.\n");
  process.exit(1);
}

// Pack mapping reads SKUs and titles only, so read_inventory is not required.
const REQUIRED_SCOPES = ["read_orders", "read_products"];

try {
  const granted = await getGrantedScopes();
  if (granted.length === 0) {
    console.log("Granted scopes: not reported by Shopify (cannot verify — proceeding).\n");
  } else {
    console.log(`Granted scopes: ${granted.join(", ")}`);
    const missing = REQUIRED_SCOPES.filter((scope) => !granted.includes(scope));
    if (missing.length > 0) {
      console.log(`\n✗ Missing required scope(s): ${missing.join(", ")}`);
      console.log("  Add them to the app in Shopify, re-authorize, then rerun.\n");
      process.exit(1);
    }
    console.log("✓ Required scopes present (read_inventory is not needed for pack mapping)\n");
  }
} catch (error) {
  console.log(`✗ Authentication failed: ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
}

const settings = await readSettings();
const model = settings.packModel;

console.log("Cost model in force");
console.log("-".repeat(108));
for (const rule of model.rules) {
  const total = toMinor(rule.productCogs) + toMinor(rule.fulfillmentCost);
  console.log(
    `  ${rule.label.padEnd(14)} COGS ${formatMoney(rule.productCogs).padStart(9)}` +
      `   fulfillment ${formatMoney(rule.fulfillmentCost).padStart(9)}` +
      `   total ${formatMoney(fromMinor(total)).padStart(9)}`,
  );
}
console.log(
  `  Other variable  ${(model.variableRateOfNetRevenue * 100).toFixed(1)}% of Shopify net revenue`,
);
if (model.overrides.length > 0) {
  console.log(`  Overrides       ${model.overrides.length} configured`);
}
console.log();

const shop = await fetchShopInfo();
// Read-only. `includeUnitCost: false` also keeps read_inventory out of play.
const result = await fetchShopifyCogs(start, end, shop, { includeUnitCost: false });

if (result.lines.length === 0) {
  console.log("No order line items in this range.\n");
  process.exit(0);
}

// --- Aggregate by product/variant ----------------------------------------

interface Row {
  key: string;
  sku: string;
  title: string;
  variantTitle: string | null;
  packSize: number | null;
  confidence: string;
  units: number;
  cogs: number;
  fulfillment: number;
}

const rows = new Map<string, Row>();

for (const line of result.lines) {
  const key = `${line.sku}||${line.title}||${line.variantTitle ?? ""}`;
  const match = matchPack(model, {
    sku: line.sku,
    title: line.title,
    variantTitle: line.variantTitle,
  });
  const costed = costLine(model, line.date, line.quantityCosted, {
    sku: line.sku,
    title: line.title,
    variantTitle: line.variantTitle,
  });

  const row = rows.get(key) ?? {
    key,
    sku: line.sku,
    title: line.title,
    variantTitle: line.variantTitle,
    packSize: match.packSize,
    confidence: match.confidence,
    units: 0,
    cogs: 0,
    fulfillment: 0,
  };

  row.units += line.quantityCosted;
  row.cogs += toMinor(costed.productCogs);
  row.fulfillment += toMinor(costed.fulfillment);
  rows.set(key, row);
}

const all = [...rows.values()].sort((a, b) => b.units - a.units);
const mapped = all.filter((row) => row.packSize !== null);
const unmapped = all.filter((row) => row.packSize === null && row.units > 0);

const pad = (v: string, w: number) => v.padEnd(w).slice(0, w);
const rpad = (v: string, w: number) => v.padStart(w);

// --- Mapped ---------------------------------------------------------------

console.log("MAPPED PRODUCTS");
console.log("-".repeat(108));
if (mapped.length === 0) {
  console.log("  (none)\n");
} else {
  console.log(
    pad("SKU", 18) + pad("PRODUCT TITLE", 30) + pad("VARIANT", 18) +
      rpad("PACK", 5) + rpad("VIA", 9) + rpad("QTY", 6) +
      rpad("COGS", 11) + rpad("FULFIL", 11),
  );
  for (const size of [10, 20, 50]) {
    const group = mapped.filter((row) => row.packSize === size);
    if (group.length === 0) continue;
    console.log(`\n  Pack of ${size}`);
    for (const row of group) {
      console.log(
        "  " + pad(row.sku || "—", 16) +
          pad(row.title || "—", 30) +
          pad(row.variantTitle && row.variantTitle !== "Default" ? row.variantTitle : "—", 18) +
          rpad(String(row.packSize), 5) + rpad(row.confidence, 9) +
          rpad(String(row.units), 6) + rpad(formatMoney(fromMinor(row.cogs)), 11) +
          rpad(formatMoney(fromMinor(row.fulfillment)), 11),
      );
    }
  }
  console.log();
}

// --- Unmapped -------------------------------------------------------------

console.log("MISSING COST MAPPING");
console.log("-".repeat(108));
if (unmapped.length === 0) {
  console.log("  None — every product sold in this range mapped to a pack.\n");
} else {
  console.log(
    pad("SKU", 20) + pad("PRODUCT TITLE", 32) + pad("VARIANT", 20) +
      rpad("QTY", 6) + rpad("REASON", 12),
  );
  for (const row of unmapped) {
    console.log(
      pad(row.sku || "—", 20) +
        pad(row.title || "—", 32) +
        pad(row.variantTitle && row.variantTitle !== "Default" ? row.variantTitle : "—", 20) +
        rpad(String(row.units), 6) + rpad(row.confidence, 12),
    );
  }
  console.log(
    "\n  These contribute NO cost. Add an override on the Business Costs page,",
  );
  console.log("  or rename the product/SKU so the pack size is unambiguous.\n");
}

// --- Totals ---------------------------------------------------------------

const totalCogs = all.reduce((acc, row) => acc + row.cogs, 0);
const totalFulfil = all.reduce((acc, row) => acc + row.fulfillment, 0);
const totalUnits = all.reduce((acc, row) => acc + row.units, 0);

console.log("TOTALS");
console.log("-".repeat(108));
console.log(`  pack quantities costed  ${totalUnits}`);
console.log(`  product COGS        ${formatMoney(fromMinor(totalCogs))}`);
console.log(`  shipping/fulfilment ${formatMoney(fromMinor(totalFulfil))}`);
console.log(`  operational cost    ${formatMoney(fromMinor(totalCogs + totalFulfil))}`);
console.log(
  `\n  Note: quantities above are line-item pack quantities, not individual boxes.
  The ${(model.variableRateOfNetRevenue * 100).toFixed(1)}% of net revenue is applied on top of these,`,
);
console.log("  and covers payment processing, platform fees and small variable costs.\n");

if (unmapped.length > 0) {
  console.log(`✗ ${unmapped.length} product(s) need cost mapping. The P&L is incomplete.\n`);
  process.exit(2);
}

console.log("✓ Every product mapped. COGS and fulfillment are complete for this range.\n");
