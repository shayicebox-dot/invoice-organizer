/**
 * The Kicks Box pack cost model.
 *
 * Cost is driven by pack size, not by a per-item cost in Shopify: a 10-pack
 * costs $24 to buy and $21 to store, pick, pack and ship, and the 20 and 50
 * packs scale from there. Every unit sold is therefore costed by identifying
 * which pack it is and applying that pack's rule.
 *
 * ## Confident mapping, or none at all
 *
 * A line item is mapped only when the evidence is unambiguous — an explicit
 * override, or a pack size stated in the SKU or title in a form that cannot be
 * read two ways. A title mentioning both 10 and 20 is ambiguous and is left
 * unmapped rather than guessed, and "100" never reads as "10".
 *
 * Anything unmapped contributes no cost and is reported by name, so the P&L is
 * marked incomplete instead of quietly understating cost.
 */

import { type Money, ZERO, fromMajor, multiply } from "../money";
import type { ISODate } from "../types";
import { effectiveRecord } from "./proration";
import type { EffectiveWindow } from "./types";

/** Pack sizes the business sells. */
export const PACK_SIZES = [10, 20, 50] as const;
export type PackSize = (typeof PACK_SIZES)[number];

export interface PackRule extends EffectiveWindow {
  id: string;
  packSize: PackSize;
  label: string;
  /** Cost of the goods in one pack. */
  productCogs: Money;
  /** Shipping, storage and pick & pack for one pack. */
  fulfillmentCost: Money;
}

/** Force a SKU or variant onto a pack size when the text cannot be trusted. */
export interface PackMappingOverride {
  id: string;
  /** Matched case-insensitively against the SKU, variant id, or exact title. */
  match: string;
  packSize: PackSize;
}

export interface PackCostModel {
  rules: PackRule[];
  overrides: PackMappingOverride[];
  /**
   * Other variable costs as a share of net revenue — payment processing,
   * Shopify fees and apps, and the small operating costs that move with sales.
   * Ad spend is not included; it comes from the ad platforms directly.
   */
  variableRateOfNetRevenue: number;
}

/** The real Kicks Box cost model. */
export function defaultPackModel(): PackCostModel {
  const rule = (packSize: PackSize, cogs: number, fulfillment: number): PackRule => ({
    id: `pack_${packSize}`,
    packSize,
    label: `Pack of ${packSize}`,
    productCogs: fromMajor(cogs),
    fulfillmentCost: fromMajor(fulfillment),
    effectiveFrom: "2000-01-01",
    effectiveTo: null,
  });

  return {
    rules: [rule(10, 24, 21), rule(20, 48, 42), rule(50, 120, 105)],
    overrides: [],
    variableRateOfNetRevenue: 0.05,
  };
}

/** The rule in force for a pack size on a date. */
export function ruleFor(
  model: PackCostModel,
  packSize: PackSize,
  date: ISODate,
): PackRule | null {
  return effectiveRecord(
    model.rules.filter((rule) => rule.packSize === packSize),
    date,
  );
}

// --- Mapping ---------------------------------------------------------------

export type MappingConfidence = "override" | "sku" | "title" | "unmapped" | "ambiguous";

export interface PackMatch {
  packSize: PackSize | null;
  confidence: MappingConfidence;
  /** Which text the size was read from, for the mapping report. */
  evidence: string | null;
}

/**
 * Pack sizes stated in a way that cannot be misread.
 *
 * Requires an explicit pack word next to the number, or the number as a whole
 * segment of a SKU. Bare numbers embedded in prose are not enough — a title
 * like "Summer 20 Collection" is not a 20-pack.
 */
const PACK_PHRASE = /(?:^|[^0-9a-z])(10|20|50)\s*[-–—_ ]?\s*(?:pack|pk|pcs|pieces|count|ct)\b/gi;
const PACK_OF_PHRASE = /\bpack\s*of\s*(10|20|50)(?![0-9])/gi;
/** A SKU segment that is exactly the pack size, e.g. KB-20-BLUE. */
const SKU_SEGMENT = /(?:^|[^0-9])(10|20|50)(?![0-9])/g;

function collectSizes(text: string, pattern: RegExp): Set<PackSize> {
  const found = new Set<PackSize>();
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const size = Number(match[1]) as PackSize;
    if (PACK_SIZES.includes(size)) found.add(size);
  }
  return found;
}

/**
 * Work out which pack a line item is.
 *
 * Order of trust: an explicit override, then a pack phrase in the SKU, then a
 * pack phrase in the title or variant title, then a bare pack-size segment in
 * the SKU. Two different sizes at the same level of evidence is ambiguous, and
 * ambiguous is never resolved by picking one.
 */
export function matchPack(
  model: PackCostModel,
  line: { sku: string; title: string; variantTitle: string | null; variantId?: string | null },
): PackMatch {
  const sku = (line.sku ?? "").trim();
  const title = (line.title ?? "").trim();
  const variantTitle = (line.variantTitle ?? "").trim();

  // 1. Explicit override wins over anything read from text.
  const candidates = [sku, line.variantId ?? "", title, variantTitle]
    .map((value) => value.toLowerCase())
    .filter((value) => value !== "");

  for (const override of model.overrides) {
    const needle = override.match.trim().toLowerCase();
    if (needle !== "" && candidates.includes(needle)) {
      return { packSize: override.packSize, confidence: "override", evidence: override.match };
    }
  }

  // 2. A pack phrase in the SKU.
  const skuPhrase = new Set([
    ...collectSizes(sku, PACK_PHRASE),
    ...collectSizes(sku, PACK_OF_PHRASE),
  ]);
  if (skuPhrase.size === 1) {
    return { packSize: [...skuPhrase][0], confidence: "sku", evidence: sku };
  }
  if (skuPhrase.size > 1) return { packSize: null, confidence: "ambiguous", evidence: sku };

  // 3. A pack phrase in the variant title, then the product title.
  for (const [text, label] of [
    [variantTitle, variantTitle],
    [title, title],
  ] as const) {
    if (text === "") continue;
    const sizes = new Set([
      ...collectSizes(text, PACK_PHRASE),
      ...collectSizes(text, PACK_OF_PHRASE),
    ]);
    if (sizes.size === 1) return { packSize: [...sizes][0], confidence: "title", evidence: label };
    if (sizes.size > 1) return { packSize: null, confidence: "ambiguous", evidence: label };
  }

  // 4. A bare pack-size segment in the SKU, e.g. KB-20-BLUE.
  const skuSegment = collectSizes(sku, SKU_SEGMENT);
  if (skuSegment.size === 1) {
    return { packSize: [...skuSegment][0], confidence: "sku", evidence: sku };
  }
  if (skuSegment.size > 1) return { packSize: null, confidence: "ambiguous", evidence: sku };

  return { packSize: null, confidence: "unmapped", evidence: null };
}

export interface PackCostResult {
  productCogs: Money;
  fulfillment: Money;
  packSize: PackSize | null;
  confidence: MappingConfidence;
}

/** Cost one line: pack rule multiplied by the number of packs sold. */
export function costLine(
  model: PackCostModel,
  date: ISODate,
  quantity: number,
  line: { sku: string; title: string; variantTitle: string | null; variantId?: string | null },
): PackCostResult {
  const match = matchPack(model, line);

  if (match.packSize === null || quantity <= 0) {
    return {
      productCogs: ZERO,
      fulfillment: ZERO,
      packSize: match.packSize,
      confidence: match.confidence,
    };
  }

  const rule = ruleFor(model, match.packSize, date);
  if (!rule) {
    // Mapped to a size with no rule in force on that day — still not a cost we
    // are willing to invent.
    return {
      productCogs: ZERO,
      fulfillment: ZERO,
      packSize: match.packSize,
      confidence: "unmapped",
    };
  }

  return {
    productCogs: multiply(rule.productCogs, quantity),
    fulfillment: multiply(rule.fulfillmentCost, quantity),
    packSize: match.packSize,
    confidence: match.confidence,
  };
}
