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
const { costLine } = await import("../src/lib/business-costs/pack-model");
const { buildIdentityInventory } = await import("../src/lib/business-costs/inventory");
const { describeIdentity } = await import("../src/lib/business-costs/pack-mapping");
const { identityOf } = await import("../src/lib/data/live-costs");
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
  console.log(
    `  ${rule.label.padEnd(14)} operational cost ${formatMoney(rule.operationalCost).padStart(9)}` +
      "   (product · shipping · storage · pick & pack)",
  );
}
console.log(
  `  Other variable  ${(model.variableRateOfNetRevenue * 100).toFixed(1)}% of Shopify net revenue`,
);
console.log(`  Mapping table   ${model.mappings.length} entries`);
console.log();

const shop = await fetchShopInfo();
// Read-only. `includeUnitCost: false` also keeps read_inventory out of play.
const result = await fetchShopifyCogs(start, end, shop, { includeUnitCost: false });

if (result.lines.length === 0) {
  console.log("No order line items in this range.\n");
  process.exit(0);
}

const rows = buildIdentityInventory(
  model,
  result.lines.map((line) => ({
    ...identityOf(line),
    date: line.date,
    quantity: line.quantityCosted,
  })),
);

const costByKey = new Map<string, number>();
for (const line of result.lines) {
  const identity = identityOf(line);
  const costed = costLine(model, line.date, line.quantityCosted, identity);
  const row = rows.find((candidate) => candidate.label === describeIdentity(identity));
  if (!row) continue;
  costByKey.set(row.key, (costByKey.get(row.key) ?? 0) + toMinor(costed.operationalCost));
}

const mapped = rows.filter((row) => row.status !== "unmapped");
const unmapped = rows.filter((row) => row.status === "unmapped");

const pad = (v: string, w: number) => v.padEnd(w).slice(0, w);
const rpad = (v: string, w: number) => v.padStart(w);

console.log("MAPPED PRODUCTS");
console.log("-".repeat(108));
if (mapped.length === 0) {
  console.log("  (none)\n");
} else {
  console.log(
    pad("SKU", 18) + pad("PRODUCT TITLE", 30) + pad("VARIANT", 18) +
      rpad("PACK", 6) + rpad("VIA", 10) + rpad("QTY", 6) + rpad("COST", 12),
  );
  for (const row of mapped) {
    console.log(
      pad(row.sku || "—", 18) +
        pad(row.title || row.lineName || "—", 30) +
        pad(row.variantTitle && row.variantTitle !== "Default" ? row.variantTitle : "—", 18) +
        rpad(row.packSize === null ? "excl" : String(row.packSize), 6) +
        rpad(row.confidence, 10) +
        rpad(String(row.quantity), 6) +
        rpad(formatMoney(fromMinor(costByKey.get(row.key) ?? 0)), 12),
    );
  }
  console.log();
}

console.log("MISSING COST MAPPING");
console.log("-".repeat(108));
if (unmapped.length === 0) {
  console.log("  None — every product sold in this range maps to a pack.\n");
} else {
  console.log(
    pad("SKU", 20) + pad("PRODUCT TITLE", 32) + pad("VARIANT", 18) +
      rpad("QTY", 6) + rpad("REASON", 14) + rpad("FIRST SEEN", 13),
  );
  for (const row of unmapped) {
    console.log(
      pad(row.sku || "—", 20) +
        pad(row.title || row.lineName || "—", 32) +
        pad(row.variantTitle && row.variantTitle !== "Default" ? row.variantTitle : "—", 18) +
        rpad(String(row.quantity), 6) + rpad(row.confidence, 14) + rpad(row.firstSeen, 13),
    );
  }
  console.log("\n  These carry NO cost, so the P&L withholds profit for any range containing");
  console.log("  them. Assign each one on the Historical Product Mapping page.\n");
}

const totalCost = [...costByKey.values()].reduce((acc, value) => acc + value, 0);
const totalQuantity = rows.reduce((acc, row) => acc + row.quantity, 0);

console.log("TOTALS");
console.log("-".repeat(108));
console.log(`  pack quantities costed  ${totalQuantity}`);
console.log(`  operational cost        ${formatMoney(fromMinor(totalCost))}`);
console.log(
  `\n  Quantities are line-item pack quantities, not individual boxes. The ` +
    `${(model.variableRateOfNetRevenue * 100).toFixed(1)}% of net revenue is applied on top.\n`,
);

if (unmapped.length > 0) {
  console.log(`✗ ${unmapped.length} product(s) need cost mapping. The P&L is INCOMPLETE.\n`);
  process.exit(2);
}

console.log("✓ Every product mapped. Operational cost is complete for this range.\n");
