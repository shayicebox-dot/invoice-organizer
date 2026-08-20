/**
 * The Kicks Box pack cost model.
 *
 * One rate, stated once: **$45 per ten boxes**. Every bundle is built from
 * tens, so every bundle costs from the same rate.
 *
 *   10 boxes — $45     20 — $90     30 — $135     50 — $225     70 — $315
 *
 * A 30 is a 20 plus a 10 and a 70 is a 50 plus a 20, which is why they need no
 * rule of their own: the rate already prices them, and a bundle size introduced
 * tomorrow prices correctly without a code change.
 *
 * Product cost, shipping, storage and pick & pack are all inside that rate.
 * There is no separate COGS and fulfillment split to reconcile, and nothing is
 * read from Shopify's cost per item or from inventory valuation — the business
 * knows what a box costs, and that is the number the P&L uses.
 *
 * Which pack a line item is comes from `pack-mapping.ts`, which resolves
 * against durable historical identifiers rather than the catalog as it stands
 * today. A line that cannot be resolved contributes no cost and blocks the
 * profit figures; see that file for why guessing is not on the table.
 */

import { type Money, ZERO, fromMajor, fromMinor, multiply, toMinor } from "../money";
import type { ISODate } from "../types";
import {
  BOXES_PER_COST_UNIT,
  builtinMappings,
  isAssignableBoxCount,
  matchPack,
} from "./pack-mapping";
import type {
  LineIdentity,
  MappingConfidence,
  PackMappingEntry,
  PackSize,
} from "./pack-mapping";
import { effectiveRecord } from "./proration";
import type { EffectiveWindow } from "./types";

export { BOXES_PER_COST_UNIT, isPackQuantity, isAssignableBoxCount } from "./pack-mapping";
import { PACK_SIZES } from "./pack-mapping";
export { PACK_SIZES };
export type { PackSize, PackAssignment, PackMappingEntry, LineIdentity } from "./pack-mapping";

/**
 * An exception to the per-ten rate, for one bundle size over one window.
 *
 * Nothing needs one today. It exists so a size whose cost genuinely diverges —
 * a promotional bundle, a supplier change on one SKU — can be priced without
 * distorting the rate that every other size derives from.
 */
export interface PackRule extends EffectiveWindow {
  id: string;
  packSize: PackSize;
  label: string;
  /**
   * Total operational cost of one bundle: product, shipping, storage, pick and
   * pack. A single figure, because that is how the business buys and ships.
   */
  operationalCost: Money;
}

export interface PackCostModel {
  /** Exceptions. Consulted before the rate below; normally empty. */
  rules: PackRule[];
  /**
   * The rate everything derives from: what ten boxes cost to buy, store, pick,
   * pack and ship. A bundle of N boxes costs `N / 10` times this.
   */
  costPerTenBoxes: Money;
  /** The durable historical mapping table, manual entries and built-ins. */
  mappings: PackMappingEntry[];
  /**
   * Other variable costs as a share of net revenue — payment processing,
   * Shopify fees and apps, and the small operating costs that move with sales.
   * Ad spend is not included; it comes from the ad platforms directly.
   */
  variableRateOfNetRevenue: number;
}

/** The real Kicks Box cost model. */
export function defaultPackModel(): PackCostModel {
  return {
    rules: [],
    costPerTenBoxes: fromMajor(45),
    mappings: builtinMappings(),
    variableRateOfNetRevenue: 0.05,
  };
}

/**
 * What one bundle of `packSize` boxes costs on a date.
 *
 * An explicit exception wins; otherwise the cost is derived from the per-ten
 * rate. The rate is per ten boxes but applies per box, so it prices any whole
 * box count — 25 boxes costs 2.5 × $45 — and the arithmetic stays in integer
 * minor units so $112.50 is exactly $112.50.
 *
 * Only what may be *inferred from text* is restricted to round tens; that lives
 * in `pack-mapping.ts`, because it is a question about evidence rather than
 * about cost.
 */
export function ruleFor(model: PackCostModel, packSize: PackSize, date: ISODate): PackRule | null {
  const exception = effectiveRecord(
    model.rules.filter((rule) => rule.packSize === packSize),
    date,
  );
  if (exception) return exception;

  if (!isAssignableBoxCount(packSize)) return null;

  return {
    id: `derived_${packSize}`,
    packSize,
    label: `${packSize} boxes`,
    operationalCost: fromMinor(
      Math.round((toMinor(model.costPerTenBoxes) * packSize) / BOXES_PER_COST_UNIT),
    ),
    effectiveFrom: "2000-01-01",
    effectiveTo: null,
  };
}

/** The bundle sizes to show in a settings table, plus any size with an exception. */
export function pricedPackSizes(model: PackCostModel): PackSize[] {
  const sizes = new Set<PackSize>([...PACK_SIZES, ...model.rules.map((rule) => rule.packSize)]);
  return [...sizes].sort((a, b) => a - b);
}

export interface PackCostResult {
  /** Total operational cost for the line. Zero when the line is unmapped. */
  operationalCost: Money;
  packSize: PackSize | null;
  /** True when the line is deliberately excluded rather than unresolved. */
  excluded: boolean;
  confidence: MappingConfidence;
  /** True when the line needs the merchant's attention before profit is real. */
  unmapped: boolean;
}

/** Cost one line: the pack's rule multiplied by the number of packs sold. */
export function costLine(
  model: PackCostModel,
  date: ISODate,
  quantity: number,
  line: LineIdentity,
): PackCostResult {
  const match = matchPack(model.mappings, line);

  if (match.excluded) {
    return {
      operationalCost: ZERO,
      packSize: null,
      excluded: true,
      confidence: match.confidence,
      unmapped: false,
    };
  }

  if (match.packSize === null) {
    return {
      operationalCost: ZERO,
      packSize: null,
      excluded: false,
      confidence: match.confidence,
      unmapped: quantity > 0,
    };
  }

  const rule = ruleFor(model, match.packSize, date);
  if (!rule) {
    // Mapped to a size with no rule in force on that day. Still not a cost we
    // are willing to invent.
    return {
      operationalCost: ZERO,
      packSize: match.packSize,
      excluded: false,
      confidence: "unmapped",
      unmapped: quantity > 0,
    };
  }

  return {
    operationalCost: quantity > 0 ? multiply(rule.operationalCost, quantity) : ZERO,
    packSize: match.packSize,
    excluded: false,
    confidence: match.confidence,
    unmapped: false,
  };
}
