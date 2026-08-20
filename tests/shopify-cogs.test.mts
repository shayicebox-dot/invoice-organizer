/**
 * Shopify cost-per-item COGS.
 *
 * The rules under test: every unit is costed from its own variant's cost,
 * restocked returns are reversed, unrestocked returns are not, and a variant
 * without a cost is reported rather than estimated.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { type CogsLine, summariseCogs } from "../src/lib/shopify/cogs";
import { type Money, ZERO, formatMoney, fromMajor, multiply, toMinor } from "../src/lib/money";

function line(over: Partial<CogsLine> = {}): CogsLine {
  const unitCost = over.unitCost === undefined ? fromMajor(4) : over.unitCost;
  const quantitySold = over.quantitySold ?? 10;
  const quantityRestocked = over.quantityRestocked ?? 0;
  const quantityCosted = over.quantityCosted ?? quantitySold - quantityRestocked;

  return {
    orderId: "gid://shopify/Order/1",
    orderName: "#1001",
    date: "2026-08-01",
    sku: "SKU-1",
    title: "Product",
    variantTitle: "Default",
    lineName: "Product - Default",
    variantId: "gid://shopify/ProductVariant/1",
    quantitySold,
    quantityRestocked,
    quantityCosted,
    unitCost,
    lineCogs: unitCost === null ? ZERO : multiply(unitCost, quantityCosted),
    ...over,
  };
}

describe("COGS from cost per item", () => {
  it("costs each line as unit cost times quantity", () => {
    const result = summariseCogs([line({ unitCost: fromMajor(4), quantitySold: 10 })], new Set());
    assert.equal(toMinor(result.totalCogs), toMinor(fromMajor(40)));
  });

  it("adds up lines across several SKUs and orders", () => {
    const result = summariseCogs(
      [
        line({ sku: "A", unitCost: fromMajor(4), quantitySold: 10 }),
        line({ sku: "B", unitCost: fromMajor(6.5), quantitySold: 4, orderName: "#1002" }),
      ],
      new Set(),
    );
    // 10 x 4 + 4 x 6.50 = 66
    assert.equal(toMinor(result.totalCogs), toMinor(fromMajor(66)));
    assert.equal(formatMoney(result.totalCogs), "$66.00");
  });

  it("never derives a cost from revenue", () => {
    // A line with no cost contributes nothing at all — not a percentage, not
    // an average of the other lines.
    const result = summariseCogs(
      [
        line({ sku: "A", unitCost: fromMajor(4), quantitySold: 10 }),
        line({ sku: "B", unitCost: null, quantitySold: 100 }),
      ],
      new Set(["B"]),
    );
    assert.equal(toMinor(result.totalCogs), toMinor(fromMajor(40)));
    assert.deepEqual(result.missingCostSkus, ["B"]);
    assert.equal(result.packQuantitiesMissingCost, 100);
  });

  it("reverses the cost of units returned to inventory", () => {
    // 10 sold, 3 restocked: only 7 units are a cost.
    const result = summariseCogs(
      [line({ unitCost: fromMajor(4), quantitySold: 10, quantityRestocked: 3 })],
      new Set(),
    );
    assert.equal(toMinor(result.totalCogs), toMinor(fromMajor(28)));
    assert.equal(result.byDate[0].packQuantitiesCosted, 7);
  });

  it("keeps the cost of a return that was not restocked", () => {
    // The goods are gone, so the cost stays. quantityRestocked counts only
    // units that went back into sellable inventory.
    const result = summariseCogs(
      [line({ unitCost: fromMajor(4), quantitySold: 10, quantityRestocked: 0 })],
      new Set(),
    );
    assert.equal(toMinor(result.totalCogs), toMinor(fromMajor(40)));
  });

  it("costs nothing when every unit came back", () => {
    const result = summariseCogs(
      [line({ unitCost: fromMajor(4), quantitySold: 5, quantityRestocked: 5 })],
      new Set(),
    );
    assert.equal(toMinor(result.totalCogs), 0);
    assert.equal(result.byDate[0].packQuantitiesCosted, 0);
  });

  it("buckets by day and the days sum to the range total", () => {
    const result = summariseCogs(
      [
        line({ date: "2026-08-01", unitCost: fromMajor(4), quantitySold: 10 }),
        line({ date: "2026-08-02", unitCost: fromMajor(4), quantitySold: 5 }),
        line({ date: "2026-08-02", unitCost: fromMajor(2), quantitySold: 5 }),
      ],
      new Set(),
    );

    assert.equal(result.byDate.length, 2);
    assert.equal(toMinor(result.byDate[0].cogs), toMinor(fromMajor(40)));
    assert.equal(toMinor(result.byDate[1].cogs), toMinor(fromMajor(30)));

    const daySum = result.byDate.reduce((acc, day) => acc + toMinor(day.cogs), 0);
    assert.equal(daySum, toMinor(result.totalCogs));
  });

  it("counts uncosted units per day as well as across the range", () => {
    const result = summariseCogs(
      [
        line({ date: "2026-08-01", unitCost: null, quantitySold: 3 }),
        line({ date: "2026-08-01", unitCost: fromMajor(4), quantitySold: 2 }),
      ],
      new Set(["SKU-1"]),
    );
    assert.equal(result.byDate[0].packQuantitiesMissingCost, 3);
    assert.equal(result.byDate[0].packQuantitiesCosted, 2);
    assert.equal(toMinor(result.byDate[0].cogs), toMinor(fromMajor(8)));
  });

  it("handles fractional unit costs without float drift", () => {
    // 3 units at $0.07 is 21 cents exactly, not 20.999999.
    const result = summariseCogs(
      [line({ unitCost: fromMajor(0.07), quantitySold: 3 })],
      new Set(),
    );
    assert.equal(toMinor(result.totalCogs), 21);
  });

  it("returns an empty result for a range with no lines", () => {
    const result = summariseCogs([], new Set());
    assert.equal(toMinor(result.totalCogs), 0);
    assert.deepEqual(result.byDate, []);
    assert.deepEqual(result.missingCostSkus, []);
  });

  it("sums a realistic mixed day exactly", () => {
    const lines: CogsLine[] = [
      line({ orderName: "#1001", sku: "NB-GRN-30", unitCost: fromMajor(11.4), quantitySold: 2 }),
      line({ orderName: "#1001", sku: "NB-MAG-60", unitCost: fromMajor(7.9), quantitySold: 1 }),
      line({ orderName: "#1002", sku: "NB-GRN-30", unitCost: fromMajor(11.4), quantitySold: 3, quantityRestocked: 1 }),
    ];
    const result = summariseCogs(lines, new Set());
    // 2x11.40 + 1x7.90 + 2x11.40 = 22.80 + 7.90 + 22.80 = 53.50
    const expected: Money = fromMajor(53.5);
    assert.equal(toMinor(result.totalCogs), toMinor(expected));
    assert.equal(formatMoney(result.totalCogs), "$53.50");
  });
});
