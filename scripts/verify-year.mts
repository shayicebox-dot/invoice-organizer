/**
 * Year-to-date reconciliation, with the checks that a long range actually
 * needs.
 *
 * A wide window fails differently from a narrow one. It does not error — it
 * comes back short: a page cap binds, an ad platform stops paging, Shopify
 * declines to return the older half. Every one of those looks like a quiet
 * trading period, so this command asserts against them explicitly rather than
 * printing whatever arrived.
 *
 *   npm run verify:year               # 2026-01-01 .. today
 *   npm run verify:year -- 2026       # an explicit year
 *
 * Exits non-zero on any failed assertion. Read-only; no credential is printed.
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

const { getLiveYearReport } = await import("../src/lib/data");
const { formatMoney, formatPercent, toMinor, fromMinor } = await import("../src/lib/money");
const { getShopifyConfig } = await import("../src/lib/shopify/config");
const { fetchShopInfo } = await import("../src/lib/shopify/shop");
const { fetchShopifyCogs } = await import("../src/lib/shopify/cogs");
const { readSettings } = await import("../src/lib/business-costs/store");
const { costLine } = await import("../src/lib/business-costs/pack-model");
const { describeIdentity } = await import("../src/lib/business-costs/pack-mapping");
const { identityOf } = await import("../src/lib/data/live-costs");
const { getGrantedScopes } = await import("../src/lib/shopify/client");
const { orderHistoryWindow, daysBeyondWindow } = await import("../src/lib/shopify/history-window");
const { today, daysBetween, enumerateDates } = await import("../src/lib/date-range");

const yearArg = process.argv.slice(2).find((arg) => /^\d{4}$/.test(arg));
const year = yearArg ? Number.parseInt(yearArg, 10) : Number.parseInt(today().slice(0, 4), 10);

if (!getShopifyConfig()) {
  console.error("\nShopify is not configured. Set the Shopify variables in .env.local.\n");
  process.exit(1);
}

const failures: string[] = [];
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const settings = await readSettings();
const shop = await fetchShopInfo();
const scopes = await getGrantedScopes();
const window = await orderHistoryWindow(today());

console.log(`\n${year} year-to-date reconciliation`);
console.log("=".repeat(84));
console.log(`Shop : ${shop.name} · ${shop.domain}  (days bucketed in ${shop.timezone})`);
console.log("Path : src/lib/data — the dashboard's own code");
console.log(
  `Cost : ${formatMoney(settings.packModel.costPerTenBoxes)} per ten boxes   ·   ` +
    `other variable ${(settings.packModel.variableRateOfNetRevenue * 100).toFixed(1)}% of net sales`,
);

const report = await getLiveYearReport("all", year);
const { summary } = report;

console.log();
console.log("ACCESS");
console.log("-".repeat(84));
console.log(`  Granted scopes    ${scopes.length > 0 ? scopes.join(", ") : "(not reported)"}`);
console.log(`  Range requested   ${report.start} .. ${report.end}`);

// --- Assertions -----------------------------------------------------------

console.log();
console.log("CHECKS");
console.log("-".repeat(84));

const hiddenDays = daysBeyondWindow(window, report.start, report.end);
check(
  hiddenDays === 0,
  "No hidden Shopify days",
  hiddenDays === 0
    ? window.cutoff === null
      ? "read_all_orders granted"
      : "range starts inside the readable window"
    : `${hiddenDays} day(s) before ${window.cutoff} were not returned`,
);

check(
  !report.shopify.truncated,
  "Shopify pagination ran to completion",
  `${report.shopify.ordersFetched} orders scanned, ${report.shopify.ledgerOrders} needed the sales ledger`,
);

check(
  report.meta.state === "connected" && !report.meta.truncated,
  "Meta Ads covered the whole range",
  report.meta.state === "connected" ? "" : (report.meta.message ?? "not connected"),
);

check(
  report.googleAds.state === "connected" && !report.googleAds.truncated,
  "Google Ads covered the whole range",
  report.googleAds.state === "connected" ? "" : (report.googleAds.message ?? "not connected"),
);

// Pack mapping over the whole year, from the same reader the dashboard uses.
const cogs = await fetchShopifyCogs(report.start, report.end, shop, { includeUnitCost: false });
const boxes = new Map<number, number>();
let unmappedQuantity = 0;
const unmappedNames = new Set<string>();

for (const line of cogs.lines) {
  const identity = identityOf(line);
  const costed = costLine(settings.packModel, line.date, line.quantityCosted, identity);
  if (costed.packSize !== null) {
    boxes.set(costed.packSize, (boxes.get(costed.packSize) ?? 0) + line.quantityCosted);
  } else if (costed.unmapped) {
    unmappedQuantity += line.quantityCosted;
    unmappedNames.add(describeIdentity(identity));
  }
}

check(!cogs.truncated, "Line-item pagination ran to completion", `${cogs.lines.length} lines read`);
check(
  unmappedQuantity === 0,
  "Unmapped quantity is zero",
  unmappedQuantity === 0 ? "" : `${unmappedQuantity} pack(s): ${[...unmappedNames].join("; ")}`,
);

// The year total must be the sum of the months. They are buckets of the same
// daily records, so a mismatch means the bucketing dropped a day.
const monthlySum = {
  netSales: report.months.reduce((acc, m) => acc + toMinor(m.summary.netSales), 0),
  orders: report.months.reduce((acc, m) => acc + m.summary.orders, 0),
  adSpend: report.months.reduce((acc, m) => acc + toMinor(m.summary.adSpend), 0),
  cogs: report.months.reduce((acc, m) => acc + toMinor(m.summary.cogs), 0),
  netProfit: report.months.reduce((acc, m) => acc + toMinor(m.summary.netProfit), 0),
};

const reconciles =
  monthlySum.netSales === toMinor(summary.netSales) &&
  monthlySum.orders === summary.orders &&
  monthlySum.adSpend === toMinor(summary.adSpend) &&
  monthlySum.cogs === toMinor(summary.cogs) &&
  monthlySum.netProfit === toMinor(summary.netProfit);

check(
  reconciles,
  "Yearly total equals the sum of the months",
  reconciles
    ? `${report.months.length} months`
    : `net sales ${formatMoney(fromMinor(monthlySum.netSales))} vs ${formatMoney(summary.netSales)}`,
);

// --- Range coverage -------------------------------------------------------
//
// The check that would have caught the bug that hid January through April.
// Every other total reconciled while the series was short, because they were
// all computed from the same short series. Only a comparison against what was
// *asked for* catches that.

const expectedDates = enumerateDates(report.start, report.end);
const returnedDates = report.days.map((day) => day.date);
const seen = new Set(returnedDates);
const missing = expectedDates.filter((date) => !seen.has(date));
const duplicates = returnedDates.filter((date, index) => returnedDates.indexOf(date) !== index);

check(
  report.days.length === daysBetween(report.start, report.end),
  "Requested day count equals returned day count",
  `${report.days.length} returned of ${daysBetween(report.start, report.end)} requested`,
);

check(
  missing.length === 0,
  "No missing dates",
  missing.length === 0 ? "" : `${missing.length} missing, first ${missing[0]}`,
);

check(
  duplicates.length === 0,
  "No duplicate dates",
  duplicates.length === 0 ? "" : `${[...new Set(duplicates)].slice(0, 5).join(", ")}`,
);

check(
  returnedDates[0] === report.start,
  "First returned date is the requested start",
  `${returnedDates[0] ?? "(none)"} vs ${report.start}`,
);

check(
  returnedDates[returnedDates.length - 1] === report.end,
  "Last returned date is the requested end",
  `${returnedDates[returnedDates.length - 1] ?? "(none)"} vs ${report.end}`,
);

// The months must also cover the year, not merely agree with it.
const monthDayCount = report.months.reduce((acc, m) => acc + m.summary.dayCount, 0);
check(
  monthDayCount === report.days.length,
  "Monthly buckets cover every day of the year",
  `${monthDayCount} days across ${report.months.length} months`,
);

check(
  report.completeness.complete,
  "P&L is complete",
  report.completeness.reasons.join(" | "),
);

// summarize() records how many day records it folded, so this asserts the
// yearly total was built from the complete range rather than a short array.
check(
  report.summary.dayCount === daysBetween(report.start, report.end),
  "Yearly total is computed over the whole requested range",
  `${report.summary.dayCount} days folded, ${report.start} .. ${report.end}`,
);

// --- Monthly breakdown ----------------------------------------------------

const complete = report.completeness.complete;
const pad = (v: string, w: number) => v.padEnd(w);
const rpad = (v: string, w: number) => v.padStart(w);

console.log();
console.log("MONTHLY BREAKDOWN");
console.log("-".repeat(84));
console.log(
  pad("  MONTH", 12) + rpad("NET SALES", 14) + rpad("ORDERS", 8) + rpad("AD SPEND", 13) +
    rpad("OPERATIONAL", 14) + rpad("NET PROFIT", 14) + rpad("MARGIN", 9),
);

for (const month of report.months) {
  const s = month.summary;
  const traded = s.orders > 0 || toMinor(s.netSales) !== 0;
  console.log(
    pad(`  ${month.label}`, 12) +
      rpad(formatMoney(s.netSales), 14) +
      rpad(String(s.orders), 8) +
      rpad(formatMoney(s.adSpend), 13) +
      rpad(formatMoney(s.cogs), 14) +
      rpad(!traded ? "—" : complete ? formatMoney(s.netProfit) : "—", 14) +
      rpad(!traded || !complete ? "—" : formatPercent(s.netMargin), 9),
  );
}

console.log("  " + "-".repeat(80));
console.log(
  pad(`  TOTAL ${year}`, 12) +
    rpad(formatMoney(summary.netSales), 14) +
    rpad(String(summary.orders), 8) +
    rpad(formatMoney(summary.adSpend), 13) +
    rpad(formatMoney(summary.cogs), 14) +
    rpad(complete ? formatMoney(summary.netProfit) : "INCOMPLETE", 14) +
    rpad(complete ? formatPercent(summary.netMargin) : "—", 9),
);

// --- Box quantities -------------------------------------------------------

console.log();
console.log("BOX QUANTITIES");
console.log("-".repeat(84));
for (const size of [...boxes.keys()].sort((a, b) => a - b)) {
  const quantity = boxes.get(size)!;
  console.log(
    `  ${`${size} boxes`.padEnd(12)}${String(quantity).padStart(8)} packs` +
      `${formatMoney(fromMinor(toMinor(settings.packModel.costPerTenBoxes) * size * quantity / 10)).padStart(16)}`,
  );
}
console.log(`  ${"Unmapped".padEnd(12)}${String(unmappedQuantity).padStart(8)} packs`);

console.log();
console.log("OTHER LINES");
console.log("-".repeat(84));
console.log(`  Meta Ads spend        ${formatMoney(summary.metaAdSpend).padStart(14)}`);
console.log(`  Google Ads spend      ${formatMoney(summary.googleAdSpend).padStart(14)}`);
console.log(
  `  Other variable (${(settings.packModel.variableRateOfNetRevenue * 100).toFixed(0)}%)   ` +
    `${formatMoney(summary.variableExpenses).padStart(14)}`,
);

console.log();
if (failures.length === 0) {
  console.log(`✓ All checks passed. ${year} reconciles end to end.\n`);
  process.exit(0);
}

console.log(`✗ ${failures.length} check(s) failed:`);
for (const failure of failures) console.log(`    · ${failure}`);
console.log();
process.exit(2);
