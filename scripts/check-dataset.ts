/**
 * Sanity-check the mock dataset without opening a browser.
 *
 *   npx tsx scripts/check-dataset.ts
 *
 * Prints today's roll-up and the trailing 30-day summary, and asserts the
 * identity the whole product rests on:
 *
 *     net sales − total costs === net profit
 */

import { generateDataset, mergeDailySeries } from "../src/lib/data/generate";
import { type DailyFinancials, summarize } from "../src/lib/finance";
import { type Money, formatMoney, formatPercent } from "../src/lib/money";

const MONEY_FIELDS = [
  "grossSales",
  "discounts",
  "refunds",
  "cogs",
  "shipping",
  "paymentFees",
  "marketingSpend",
  "variableExpenses",
  "fixedExpenses",
  "adSpend",
  "emailSpend",
  "metaAdSpend",
  "googleAdSpend",
] as const satisfies readonly (keyof DailyFinancials)[];

const anchor = new Date().toISOString().slice(0, 10);

const startedAt = Date.now();
const data = generateDataset(anchor);
const elapsed = Date.now() - startedAt;

console.log(
  `Generated in ${elapsed}ms — ${data.orders.length} orders, ` +
    `${data.orderItems.length} line items, ${data.refunds.length} refunds, ` +
    `${data.dates.length} days, ${data.dailyByStore.size} stores`,
);

const allStores = mergeDailySeries([...data.dailyByStore.values()], data.dates);
const todayRow = allStores[allStores.length - 1];

console.log(`\n--- ${todayRow.date} · all stores ---`);
for (const field of MONEY_FIELDS) {
  console.log(`  ${field.padEnd(18)} ${formatMoney(todayRow[field], todayRow.currency)}`);
}
console.log(`  ${"orders".padEnd(18)} ${todayRow.orders}`);
console.log(`  ${"unitsSold".padEnd(18)} ${todayRow.unitsSold}`);

const day = summarize([todayRow]);
console.log(
  `\n  net sales ${formatMoney(day.netSales, day.currency)}` +
    ` · net profit ${formatMoney(day.netProfit, day.currency)}` +
    ` · margin ${formatPercent(day.netMargin)}` +
    ` · AOV ${formatMoney(day.averageOrderValue, day.currency)}`,
);

const month = summarize(allStores.slice(-30));
console.log("\n--- trailing 30 days · all stores ---");
console.log(
  `  net sales ${formatMoney(month.netSales, month.currency)}` +
    ` · total costs ${formatMoney(month.totalCosts, month.currency)}` +
    ` · net profit ${formatMoney(month.netProfit, month.currency)}` +
    ` · margin ${formatPercent(month.netMargin)}`,
);

const reconciled = (month.netSales - month.totalCosts) as Money;
const ok = reconciled === month.netProfit;
console.log(`\n  net sales − total costs === net profit: ${ok ? "PASS" : "FAIL"}`);

if (!ok) {
  console.error(`  expected ${month.netProfit}, computed ${reconciled}`);
  process.exit(1);
}
