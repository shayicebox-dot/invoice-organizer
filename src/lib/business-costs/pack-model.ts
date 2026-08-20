/**
 * The Kicks Box pack cost model.
 *
 * One number per pack size, covering everything it takes to put a pack in a
 * customer's hands:
 *
 *   10 Pack — $45      20 Pack — $90      50 Pack — $225
 *
 * Product cost, shipping, storage and pick & pack are all inside those figures.
 * There is no separate COGS and fulfillment split to reconcile, and nothing is
 * read from Shopify's cost per item or from inventory valuation — the business
 * knows what a pack costs, and that is the number the P&L uses.
 *
 * Which pack a line item is comes from `pack-mapping.ts`, which resolves
 * against durable historical identifiers rather than the catalog as it stands
 * today. A line that cannot be resolved contributes no cost and blocks the
 * profit figures; see that file for why guessing is not on the table.
 */

import { type Money, ZERO, fromMajor, multiply } from "../money";
import type { ISODate } from "../types";
import { builtinMappings, matchPack } from "./pack-mapping";
import type {
  LineIdentity,
  MappingConfidence,
  PackMappingEntry,
  PackSize,
} from "./pack-mapping";
import { effectiveRecord } from "./proration";
import type { EffectiveWindow } from "./types";

export { PACK_SIZES } from "./pack-mapping";
export type { PackSize, PackAssignment, PackMappingEntry, LineIdentity } from "./pack-mapping";

export interface PackRule extends EffectiveWindow {
  id: string;
  packSize: PackSize;
  label: string;
  /**
   * Total operational cost of one pack: product, shipping, storage, pick and
   * pack. A single figure, because that is how the business buys and ships.
   */
  operationalCost: Money;
}

export interface PackCostModel {
  rules: PackRule[];
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
  const rule = (packSize: PackSize, operationalCost: number): PackRule => ({
    id: `pack_${packSize}`,
    packSize,
    label: `Pack of ${packSize}`,
    operationalCost: fromMajor(operationalCost),
    effectiveFrom: "2000-01-01",
    effectiveTo: null,
  });

  return {
    rules: [rule(10, 45), rule(20, 90), rule(50, 225)],
    mappings: builtinMappings(),
    variableRateOfNetRevenue: 0.05,
  };
}

/** The rule in force for a pack size on a date. */
export function ruleFor(model: PackCostModel, packSize: PackSize, date: ISODate): PackRule | null {
  return effectiveRecord(
    model.rules.filter((rule) => rule.packSize === packSize),
    date,
  );
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
