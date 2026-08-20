/**
 * Pack identification and costing.
 *
 * The expensive failure here is a confident wrong answer: mapping a line to
 * the wrong pack misstates cost silently. So the tests care as much about what
 * is refused as about what is matched — and the fixtures are real historical
 * lines from the connected store, including the three that must never be
 * guessed.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  type PackCostModel,
  costLine,
  defaultPackModel,
  ruleFor,
} from "../src/lib/business-costs/pack-model";
import {
  type LineIdentity,
  type PackMappingEntry,
  builtinMappings,
  describeIdentity,
  identityKey,
  matchPack,
} from "../src/lib/business-costs/pack-mapping";
import { buildIdentityInventory } from "../src/lib/business-costs/inventory";
import { fromMajor, toMinor } from "../src/lib/money";

const model = defaultPackModel();

const line = (over: Partial<LineIdentity> = {}): LineIdentity => ({
  sku: null,
  title: null,
  variantTitle: null,
  variantId: null,
  lineName: null,
  ...over,
});

const entry = (over: Partial<PackMappingEntry> & Pick<PackMappingEntry, "key" | "value">) =>
  ({
    id: `e:${over.key}:${over.value}`,
    assignment: 10,
    note: null,
    origin: "manual",
    ...over,
  }) as PackMappingEntry;

describe("the simple fixed cost model", () => {
  it("carries one operational cost per pack", () => {
    for (const [size, total] of [
      [10, 45],
      [20, 90],
      [50, 225],
    ] as const) {
      const rule = ruleFor(model, size, "2026-06-15")!;
      assert.equal(toMinor(rule.operationalCost), toMinor(fromMajor(total)), `pack of ${size}`);
    }
  });

  it("charges 5% of net revenue for other variable costs", () => {
    assert.equal(model.variableRateOfNetRevenue, 0.05);
  });

  it("applies the same cost to a historical date as to a recent one", () => {
    assert.equal(
      toMinor(ruleFor(model, 50, "2026-06-01")!.operationalCost),
      toMinor(ruleFor(model, 50, "2026-08-20")!.operationalCost),
    );
  });
});

describe("mapping real historical lines", () => {
  // Exactly as the store recorded them.
  const historical: Array<[string, string, string, number]> = [
    ["WHITE-US1", "10 Pack Boxes", "The sneaker wall your collection deserves", 10],
    ["WHITE-US-2", "20 Pack Boxes", "The sneaker wall your collection deserves", 20],
    ["WHITE-US-5", "50 Pack Boxes", "The sneaker wall your collection deserves", 50],
  ];

  for (const [sku, variantTitle, title, expected] of historical) {
    it(`maps ${sku} to a ${expected} pack`, () => {
      assert.equal(
        matchPack(model.mappings, line({ sku, variantTitle, title })).packSize,
        expected,
      );
    });

    it(`still maps ${sku} after the variant is deleted`, () => {
      // A deleted variant takes its title with it. The SKU on the order does
      // not change, which is the whole point of the alias table.
      const orphan = line({ sku, title, variantTitle: null, variantId: null });
      const match = matchPack(model.mappings, orphan);
      assert.equal(match.packSize, expected);
      assert.equal(match.confidence, "builtin");
    });

    it(`still maps a ${expected} pack after the SKU is changed`, () => {
      const renamed = line({ sku: "NEW-CODE-XYZ", variantTitle, title });
      assert.equal(matchPack(model.mappings, renamed).packSize, expected);
    });
  }
});

describe("refusing to guess", () => {
  it("will not read a partial quantity as a whole pack", () => {
    // Real line from order #3050. "half of 50-pack" is not a 50-pack, and
    // costing it as one would overstate cost by $225 a unit.
    const match = matchPack(model.mappings, line({ title: "half of 50-pack" }));
    assert.equal(match.packSize, null);
    assert.equal(match.confidence, "unsupported");
  });

  it("will not map a pack size the business does not sell", () => {
    // Real line from order #2855.
    const match = matchPack(model.mappings, line({ title: "30-pack" }));
    assert.equal(match.packSize, null);
    assert.equal(match.confidence, "unsupported");
  });

  it("refuses a title that states two sizes", () => {
    const match = matchPack(model.mappings, line({ title: "10 pack and 20 pack bundle" }));
    assert.equal(match.packSize, null);
    assert.equal(match.confidence, "ambiguous");
  });

  it("refuses a bare number with no pack context", () => {
    assert.equal(matchPack(model.mappings, line({ title: "Summer 2050 Collection" })).packSize, null);
    assert.equal(matchPack(model.mappings, line({ title: "Kicks Box" })).confidence, "unmapped");
    assert.equal(matchPack(model.mappings, line()).packSize, null);
  });

  it("never reads 100 as 10", () => {
    assert.equal(matchPack(model.mappings, line({ title: "100 pack" })).packSize, null);
    assert.equal(matchPack(model.mappings, line({ sku: "KB-100" })).packSize, null);
  });
});

describe("the mapping table", () => {
  it("lets a manual entry override a built-in alias", () => {
    const mappings = [...builtinMappings(), entry({ key: "sku", value: "WHITE-US1", assignment: 50 })];
    const match = matchPack(mappings, line({ sku: "WHITE-US1", variantTitle: "10 Pack Boxes" }));
    assert.equal(match.packSize, 50);
    assert.equal(match.confidence, "manual");
  });

  it("prefers the SKU over a looser rule that also matches", () => {
    const mappings = [
      entry({ key: "product_title", value: "The sneaker wall", assignment: 20 }),
      entry({ key: "sku", value: "KB-1", assignment: 50 }),
    ];
    const match = matchPack(mappings, line({ sku: "KB-1", title: "The sneaker wall" }));
    assert.equal(match.packSize, 50);
  });

  it("matches case-insensitively and ignores stray whitespace", () => {
    const mappings = [entry({ key: "variant_title", value: "kb  special", assignment: 20 })];
    assert.equal(matchPack(mappings, line({ variantTitle: "KB Special" })).packSize, 20);
  });

  it("excludes a line without leaving it unmapped", () => {
    const mappings = [entry({ key: "line_title", value: "sample box", assignment: "exclude" })];
    const match = matchPack(mappings, line({ lineName: "Sample Box" }));
    assert.equal(match.packSize, null);
    assert.equal(match.excluded, true);
    assert.equal(match.confidence, "excluded");
  });

  it("honours a legacy any-identifier entry", () => {
    const mappings = [entry({ key: "any", value: "MYSTERY", assignment: 20 })];
    assert.equal(matchPack(mappings, line({ variantId: "MYSTERY" })).packSize, 20);
    assert.equal(matchPack(mappings, line({ title: "MYSTERY" })).packSize, 20);
  });
});

describe("costing a line", () => {
  it("multiplies the operational cost by the number of packs", () => {
    const costed = costLine(model, "2026-06-25", 3, line({ sku: "WHITE-US-5" }));
    assert.equal(toMinor(costed.operationalCost), toMinor(fromMajor(675)));
    assert.equal(costed.packSize, 50);
    assert.equal(costed.unmapped, false);
  });

  it("costs an unmapped line at zero and flags it", () => {
    const costed = costLine(model, "2026-06-27", 1, line({ title: "30-pack" }));
    assert.equal(toMinor(costed.operationalCost), 0);
    assert.equal(costed.unmapped, true);
  });

  it("costs an excluded line at zero without flagging it", () => {
    const excluded: PackCostModel = {
      ...model,
      mappings: [...model.mappings, entry({ key: "product_title", value: "30-pack", assignment: "exclude" })],
    };
    const costed = costLine(excluded, "2026-06-27", 1, line({ title: "30-pack" }));
    assert.equal(toMinor(costed.operationalCost), 0);
    assert.equal(costed.unmapped, false);
    assert.equal(costed.excluded, true);
  });

  it("does not flag a line whose units all came back to stock", () => {
    const costed = costLine(model, "2026-06-27", 0, line({ title: "30-pack" }));
    assert.equal(costed.unmapped, false);
  });

  it("refuses to cost a pack with no rule in force on that day", () => {
    const dated: PackCostModel = {
      ...model,
      rules: model.rules.map((rule) => ({ ...rule, effectiveFrom: "2026-07-01" })),
    };
    const costed = costLine(dated, "2026-06-25", 1, line({ sku: "WHITE-US1" }));
    assert.equal(toMinor(costed.operationalCost), 0);
    assert.equal(costed.unmapped, true);
  });
});

describe("the historical inventory", () => {
  const input = (over: Partial<LineIdentity> & { date: string; quantity: number }) => ({
    ...line(over),
    date: over.date,
    quantity: over.quantity,
  });

  it("groups the same identity across months and keeps the range it sold in", () => {
    const rows = buildIdentityInventory(model, [
      input({ sku: "WHITE-US-2", variantTitle: "20 Pack Boxes", date: "2026-06-21", quantity: 1 }),
      input({ sku: "WHITE-US-2", variantTitle: "20 Pack Boxes", date: "2026-08-19", quantity: 2 }),
      input({ sku: "WHITE-US-2", variantTitle: "20 Pack Boxes", date: "2026-07-04", quantity: 3 }),
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].quantity, 6);
    assert.equal(rows[0].lineItems, 3);
    assert.equal(rows[0].firstSeen, "2026-06-21");
    assert.equal(rows[0].lastSeen, "2026-08-19");
    assert.equal(rows[0].status, "mapped");
    assert.equal(rows[0].packSize, 20);
  });

  it("puts unmapped identities first, whatever they sold", () => {
    const rows = buildIdentityInventory(model, [
      input({ sku: "WHITE-US-5", variantTitle: "50 Pack Boxes", date: "2026-07-01", quantity: 100 }),
      input({ title: "30-pack", date: "2026-06-27", quantity: 1 }),
    ]);

    assert.equal(rows[0].status, "unmapped");
    assert.equal(rows[0].title, "30-pack");
  });

  it("does not block the P&L over a line that sold nothing", () => {
    const rows = buildIdentityInventory(model, [
      input({ title: "30-pack", date: "2026-06-27", quantity: 0 }),
    ]);
    assert.equal(rows[0].status, "excluded");
  });

  it("keeps distinct identities apart", () => {
    const rows = buildIdentityInventory(model, [
      input({ title: "30-pack", date: "2026-06-27", quantity: 1 }),
      input({ title: "half of 50-pack", date: "2026-07-20", quantity: 1 }),
      input({ title: "half of 50-pack", date: "2026-07-20", quantity: 1 }),
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows.every((row) => row.status === "unmapped"), true);
    assert.equal(rows.find((row) => row.title === "half of 50-pack")!.quantity, 2);
  });

  it("keys an identity on what the order recorded", () => {
    const a = identityKey(line({ sku: "WHITE-US1", variantTitle: "10 Pack Boxes" }));
    const b = identityKey(line({ sku: "white-us1", variantTitle: "10 pack boxes" }));
    assert.equal(a, b);
  });

  it("labels a line with no SKU by its title alone", () => {
    assert.equal(describeIdentity(line({ title: "30-pack" })), "30-pack");
    assert.equal(describeIdentity(line({ sku: "KB-1", title: "Wall" })), "KB-1 — Wall");
  });
});
