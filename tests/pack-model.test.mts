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
import { daysBeyondWindow } from "../src/lib/shopify/history-window";
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

describe("the per-ten cost model", () => {
  it("prices every bundle from $45 per ten boxes", () => {
    for (const [size, total] of [
      [10, 45],
      [20, 90],
      [30, 135],
      [40, 180],
      [50, 225],
      [60, 270],
      [70, 315],
    ] as const) {
      const rule = ruleFor(model, size, "2026-06-15")!;
      assert.equal(toMinor(rule.operationalCost), toMinor(fromMajor(total)), `${size} boxes`);
    }
  });

  it("prices a 30 as a 20 plus a 10, and a 70 as a 50 plus a 20", () => {
    const cost = (size: number) => toMinor(ruleFor(model, size, "2026-06-15")!.operationalCost);
    assert.equal(cost(30), cost(20) + cost(10));
    assert.equal(cost(70), cost(50) + cost(20));
  });

  it("prices a box count that is not a round ten, to the cent", () => {
    // The rate is quoted per ten but applies per box, so 25 boxes is 2.5 × $45.
    assert.equal(toMinor(ruleFor(model, 25, "2026-07-20")!.operationalCost), toMinor(fromMajor(112.5)));
    assert.equal(toMinor(ruleFor(model, 1, "2026-07-20")!.operationalCost), toMinor(fromMajor(4.5)));
  });

  it("refuses a box count that is not a whole positive number", () => {
    assert.equal(ruleFor(model, 0, "2026-06-15"), null);
    assert.equal(ruleFor(model, -10, "2026-06-15"), null);
    assert.equal(ruleFor(model, 2.5, "2026-06-15"), null);
    assert.equal(ruleFor(model, 9_999, "2026-06-15"), null);
  });

  it("lets an explicit exception override the rate for one size", () => {
    const withException: PackCostModel = {
      ...model,
      rules: [
        {
          id: "promo_30",
          packSize: 30,
          label: "Promo 30",
          operationalCost: fromMajor(120),
          effectiveFrom: "2026-07-01",
          effectiveTo: null,
        },
      ],
    };
    assert.equal(toMinor(ruleFor(withException, 30, "2026-07-05")!.operationalCost), toMinor(fromMajor(120)));
    // Outside the exception's window, and for every other size, the rate stands.
    assert.equal(toMinor(ruleFor(withException, 30, "2026-06-05")!.operationalCost), toMinor(fromMajor(135)));
    assert.equal(toMinor(ruleFor(withException, 20, "2026-07-05")!.operationalCost), toMinor(fromMajor(90)));
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

describe("bundle sizes stated in the text", () => {
  it("maps a 30-pack, which is a real bundle size", () => {
    // Real line from order #2855.
    const match = matchPack(model.mappings, line({ title: "30-pack" }));
    assert.equal(match.packSize, 30);
    assert.equal(match.confidence, "title");
  });

  it("maps any whole multiple of ten stated as a pack", () => {
    for (const size of [10, 20, 30, 40, 50, 60, 70]) {
      assert.equal(matchPack(model.mappings, line({ title: `${size}-pack` })).packSize, size);
      assert.equal(matchPack(model.mappings, line({ title: `pack of ${size}` })).packSize, size);
      assert.equal(matchPack(model.mappings, line({ title: `${size} boxes` })).packSize, size);
    }
  });

  it("costs 30 and 70 boxes at the stated figures", () => {
    assert.equal(
      toMinor(costLine(model, "2026-06-27", 1, line({ title: "30-pack" })).operationalCost),
      toMinor(fromMajor(135)),
    );
    assert.equal(
      toMinor(costLine(model, "2026-06-27", 1, line({ title: "70 boxes" })).operationalCost),
      toMinor(fromMajor(315)),
    );
  });
});

describe("the half-pack override", () => {
  // Orders #3050 and #3051, July 2026: real sales of 25 boxes each, recorded
  // as custom lines. Text can never resolve them, so the box count is an
  // explicit historical assignment — and the rate prices it like any other.
  const halfPack = line({ title: "half of 50-pack", lineName: "half of 50-pack" });

  it("resolves the exact historical line to 25 boxes", () => {
    const match = matchPack(model.mappings, halfPack);
    assert.equal(match.packSize, 25);
    assert.equal(match.confidence, "builtin");
  });

  it("costs it at $112.50, which is 2.5 × $45", () => {
    const costed = costLine(model, "2026-07-20", 1, halfPack);
    assert.equal(toMinor(costed.operationalCost), toMinor(fromMajor(112.5)));
    assert.equal(costed.unmapped, false);
    assert.equal(costed.excluded, false);
  });

  it("costs two of them at $225 — the same as one 50, which is the point", () => {
    const costed = costLine(model, "2026-07-20", 2, halfPack);
    assert.equal(toMinor(costed.operationalCost), toMinor(fromMajor(225)));
  });

  it("is not a 50-pack and is not excluded", () => {
    const match = matchPack(model.mappings, halfPack);
    assert.notEqual(match.packSize, 50);
    assert.equal(match.excluded, false);
  });

  it("applies only to that exact line, not to anything else partial", () => {
    // A different partial line has no override, so it is still refused.
    const other = line({ title: "half of 20-pack" });
    assert.equal(matchPack(model.mappings, other).packSize, null);
    assert.equal(matchPack(model.mappings, other).confidence, "unsupported");
  });

  it("leaves the inference rules alone — 25 is still unreadable from text", () => {
    const stated = matchPack(model.mappings, line({ title: "25 pack" }));
    assert.equal(stated.packSize, null);
    assert.equal(stated.confidence, "unsupported");
  });
});

describe("refusing to guess", () => {
  it("will not read a partial quantity as a whole pack", () => {
    // Without the historical override, "half of" is refused on sight: costing
    // half a 50-pack as a full one would overstate cost by $112.50 a unit.
    const match = matchPack([], line({ title: "half of 50-pack" }));
    assert.equal(match.packSize, null);
    assert.equal(match.confidence, "unsupported");
  });

  it("will not map a box count that is not a whole multiple of ten", () => {
    for (const title of ["25 pack", "3-pack", "pack of 7"]) {
      const match = matchPack(model.mappings, line({ title }));
      assert.equal(match.packSize, null, title);
      assert.equal(match.confidence, "unsupported", title);
    }
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

  it("reads an arbitrary SKU number as nothing at all", () => {
    // A SKU says nothing about what its digits mean, so only a size the
    // business actually sells counts. WHITE-US1 is not a 1-pack, and a year in
    // a product code is not a bundle.
    assert.equal(matchPack([], line({ sku: "WHITE-US1" })).packSize, null);
    assert.equal(matchPack(model.mappings, line({ sku: "KB-2024-X" })).packSize, null);
    assert.equal(matchPack(model.mappings, line({ sku: "KB-40-X" })).packSize, null);
    // But a size on the sold list still reads from a SKU segment.
    assert.equal(matchPack(model.mappings, line({ sku: "KB-30-BLUE" })).packSize, 30);
  });

  it("never reads 100 as 10", () => {
    // A stated 100-pack is a real multiple of ten and costs $450 — but the
    // digits alone, with no pack word, remain meaningless.
    assert.equal(matchPack(model.mappings, line({ title: "100 pack" })).packSize, 100);
    assert.equal(matchPack(model.mappings, line({ sku: "KB-100" })).packSize, null);
  });

  it("bounds what a stated box count can be", () => {
    assert.equal(matchPack(model.mappings, line({ title: "9000 pack" })).packSize, null);
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
    const costed = costLine(model, "2026-07-20", 1, line({ title: "mystery bundle" }));
    assert.equal(toMinor(costed.operationalCost), 0);
    assert.equal(costed.unmapped, true);
  });

  it("costs an excluded line at zero without flagging it", () => {
    const excluded: PackCostModel = {
      ...model,
      mappings: [entry({ key: "product_title", value: "sample", assignment: "exclude" })],
    };
    const costed = costLine(excluded, "2026-07-20", 1, line({ title: "sample" }));
    assert.equal(toMinor(costed.operationalCost), 0);
    assert.equal(costed.unmapped, false);
    assert.equal(costed.excluded, true);
  });

  it("does not flag a line whose units all came back to stock", () => {
    const costed = costLine(model, "2026-07-20", 0, line({ title: "mystery bundle" }));
    assert.equal(costed.unmapped, false);
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
      input({ title: "mystery bundle", date: "2026-07-20", quantity: 1 }),
    ]);

    assert.equal(rows[0].status, "unmapped");
    assert.equal(rows[0].title, "mystery bundle");
  });

  it("does not block the P&L over a line that sold nothing", () => {
    const rows = buildIdentityInventory(model, [
      input({ title: "mystery bundle", date: "2026-07-20", quantity: 0 }),
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
    // Both historical bundles now cost, so nothing blocks the P&L.
    assert.equal(rows.every((row) => row.status === "mapped"), true);
    assert.equal(rows.find((row) => row.title === "half of 50-pack")!.quantity, 2);
    assert.equal(rows.find((row) => row.title === "half of 50-pack")!.packSize, 25);
    assert.equal(rows.find((row) => row.title === "30-pack")!.packSize, 30);
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

describe("Shopify's order-read window", () => {
  const restricted = { cutoff: "2026-06-21", unrestricted: false, unknown: false };
  const unlimited = { cutoff: null, unrestricted: true, unknown: false };

  it("counts the days of a range that fall before the cutoff", () => {
    // June 2026 against a 60-day window ending 2026-08-20: the first twenty
    // days are invisible, not quiet.
    assert.equal(daysBeyondWindow(restricted, "2026-06-01", "2026-06-30"), 20);
    assert.equal(daysBeyondWindow(restricted, "2026-06-20", "2026-06-30"), 1);
  });

  it("counts nothing when the range starts inside the window", () => {
    assert.equal(daysBeyondWindow(restricted, "2026-06-21", "2026-06-30"), 0);
    assert.equal(daysBeyondWindow(restricted, "2026-07-01", "2026-07-31"), 0);
  });

  it("counts a range that ends before the cutoff in full", () => {
    assert.equal(daysBeyondWindow(restricted, "2026-05-01", "2026-05-31"), 31);
  });

  it("counts nothing when read_all_orders is granted", () => {
    assert.equal(daysBeyondWindow(unlimited, "2020-01-01", "2026-06-30"), 0);
  });
});
