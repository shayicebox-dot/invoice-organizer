/**
 * Pack identification and costing.
 *
 * The expensive failure here is a confident wrong answer: mapping a line to
 * the wrong pack misstates cost silently. So the tests care as much about what
 * is refused as about what is matched.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  type PackCostModel,
  costLine,
  defaultPackModel,
  matchPack,
  ruleFor,
} from "../src/lib/business-costs/pack-model";
import { fromMajor, toMinor } from "../src/lib/money";

const model = defaultPackModel();

const line = (over: Partial<Parameters<typeof matchPack>[1]> = {}) => ({
  sku: "",
  title: "",
  variantTitle: null,
  variantId: null,
  ...over,
});

describe("the real cost model", () => {
  it("carries the Kicks Box figures", () => {
    const ten = ruleFor(model, 10, "2026-08-01")!;
    const twenty = ruleFor(model, 20, "2026-08-01")!;
    const fifty = ruleFor(model, 50, "2026-08-01")!;

    assert.equal(toMinor(ten.productCogs), toMinor(fromMajor(24)));
    assert.equal(toMinor(ten.fulfillmentCost), toMinor(fromMajor(21)));
    assert.equal(toMinor(twenty.productCogs), toMinor(fromMajor(48)));
    assert.equal(toMinor(twenty.fulfillmentCost), toMinor(fromMajor(42)));
    assert.equal(toMinor(fifty.productCogs), toMinor(fromMajor(120)));
    assert.equal(toMinor(fifty.fulfillmentCost), toMinor(fromMajor(105)));
  });

  it("totals to the stated operational cost per pack", () => {
    for (const [size, total] of [
      [10, 45],
      [20, 90],
      [50, 225],
    ] as const) {
      const rule = ruleFor(model, size, "2026-08-01")!;
      assert.equal(
        toMinor(rule.productCogs) + toMinor(rule.fulfillmentCost),
        toMinor(fromMajor(total)),
        `pack of ${size}`,
      );
    }
  });

  it("charges 5% of net revenue for other variable costs", () => {
    assert.equal(model.variableRateOfNetRevenue, 0.05);
  });
});

describe("matching a line to a pack", () => {
  it("reads an explicit pack phrase in the title", () => {
    assert.equal(matchPack(model, line({ title: "Kicks Box — Pack of 20" })).packSize, 20);
    assert.equal(matchPack(model, line({ title: "Kicks Box 10-Pack" })).packSize, 10);
    assert.equal(matchPack(model, line({ title: "50 pack sampler" })).packSize, 50);
  });

  it("reads a pack phrase in the variant title", () => {
    const match = matchPack(model, line({ title: "Kicks Box", variantTitle: "20 Pack" }));
    assert.equal(match.packSize, 20);
    assert.equal(match.confidence, "title");
  });

  it("reads a pack size from a SKU segment", () => {
    const match = matchPack(model, line({ sku: "KB-20-BLUE" }));
    assert.equal(match.packSize, 20);
    assert.equal(match.confidence, "sku");
  });

  it("never reads 100 as 10, or 200 as 20", () => {
    assert.equal(matchPack(model, line({ title: "Pack of 100" })).packSize, null);
    assert.equal(matchPack(model, line({ sku: "KB-100" })).packSize, null);
    assert.equal(matchPack(model, line({ sku: "KB-200" })).packSize, null);
    assert.equal(matchPack(model, line({ title: "500 pack" })).packSize, null);
  });

  it("refuses a line naming two different pack sizes", () => {
    const match = matchPack(model, line({ title: "10 pack and 20 pack bundle" }));
    assert.equal(match.packSize, null);
    assert.equal(match.confidence, "ambiguous");
  });

  it("refuses a bare number with no pack context", () => {
    // A year, a size, a collection name — none of these are a pack count.
    assert.equal(matchPack(model, line({ title: "Summer 2050 Collection" })).packSize, null);
    assert.equal(matchPack(model, line({ title: "Kicks Box" })).confidence, "unmapped");
    assert.equal(matchPack(model, line({ title: "", sku: "" })).packSize, null);
  });

  it("lets an explicit override win over the text", () => {
    const overridden: PackCostModel = {
      ...model,
      overrides: [{ id: "o1", match: "MYSTERY-BOX", packSize: 50 }],
    };
    const match = matchPack(overridden, line({ sku: "MYSTERY-BOX", title: "Pack of 10" }));
    assert.equal(match.packSize, 50);
    assert.equal(match.confidence, "override");
  });

  it("matches an override case-insensitively", () => {
    const overridden: PackCostModel = {
      ...model,
      overrides: [{ id: "o1", match: "kb-special", packSize: 20 }],
    };
    assert.equal(matchPack(overridden, line({ sku: "KB-Special" })).packSize, 20);
  });

  it("prefers the SKU over the title when both state a size", () => {
    const match = matchPack(model, line({ sku: "KB-50-PACK", title: "Pack of 10" }));
    assert.equal(match.packSize, 50);
    assert.equal(match.confidence, "sku");
  });
});

describe("costing a line", () => {
  it("multiplies the pack rule by the number of packs", () => {
    const result = costLine(model, "2026-08-01", 3, line({ title: "Pack of 20" }));
    // 3 x $48 COGS, 3 x $42 fulfillment
    assert.equal(toMinor(result.productCogs), toMinor(fromMajor(144)));
    assert.equal(toMinor(result.fulfillment), toMinor(fromMajor(126)));
  });

  it("costs each pack size correctly for a single unit", () => {
    for (const [title, cogs, ship] of [
      ["Pack of 10", 24, 21],
      ["Pack of 20", 48, 42],
      ["Pack of 50", 120, 105],
    ] as const) {
      const result = costLine(model, "2026-08-01", 1, line({ title }));
      assert.equal(toMinor(result.productCogs), toMinor(fromMajor(cogs)), title);
      assert.equal(toMinor(result.fulfillment), toMinor(fromMajor(ship)), title);
    }
  });

  it("costs nothing for an unmapped line, and says so", () => {
    const result = costLine(model, "2026-08-01", 5, line({ title: "Gift card" }));
    assert.equal(toMinor(result.productCogs), 0);
    assert.equal(toMinor(result.fulfillment), 0);
    assert.equal(result.packSize, null);
    assert.equal(result.confidence, "unmapped");
  });

  it("costs nothing for an ambiguous line rather than picking a size", () => {
    const result = costLine(model, "2026-08-01", 5, line({ title: "10 pack / 50 pack" }));
    assert.equal(toMinor(result.productCogs), 0);
    assert.equal(result.confidence, "ambiguous");
  });

  it("costs nothing for zero or negative quantity", () => {
    const result = costLine(model, "2026-08-01", 0, line({ title: "Pack of 20" }));
    assert.equal(toMinor(result.productCogs), 0);
  });

  it("uses the rule in force on the day", () => {
    const dated: PackCostModel = {
      ...model,
      rules: [
        { id: "a", packSize: 10, label: "old", productCogs: fromMajor(24), fulfillmentCost: fromMajor(21), effectiveFrom: "2026-01-01", effectiveTo: "2026-06-01" },
        { id: "b", packSize: 10, label: "new", productCogs: fromMajor(26), fulfillmentCost: fromMajor(22), effectiveFrom: "2026-06-01", effectiveTo: null },
      ],
    };
    assert.equal(toMinor(costLine(dated, "2026-03-01", 1, line({ title: "Pack of 10" })).productCogs), toMinor(fromMajor(24)));
    assert.equal(toMinor(costLine(dated, "2026-07-01", 1, line({ title: "Pack of 10" })).productCogs), toMinor(fromMajor(26)));
  });

  it("costs nothing when the size has no rule on that day", () => {
    const dated: PackCostModel = {
      ...model,
      rules: [{ id: "a", packSize: 10, label: "", productCogs: fromMajor(24), fulfillmentCost: fromMajor(21), effectiveFrom: "2026-06-01", effectiveTo: null }],
    };
    const result = costLine(dated, "2026-01-01", 1, line({ title: "Pack of 10" }));
    assert.equal(toMinor(result.productCogs), 0);
    assert.equal(result.confidence, "unmapped");
  });
});
