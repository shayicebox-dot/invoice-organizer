import type { SalesLineItem, SalesOrder } from '@/core/metrics/sales';

/**
 * Counting the physical boxes behind an order.
 *
 * Shopify's line item quantity counts *packs*, not boxes. One unit of a "20 box
 * pack" is twenty boxes; two units are forty. Customers combine packs freely —
 * 20 + 10 is 30 boxes, 50 + 10 is 60, 50 + 20 is 70 — so a box count is built
 * up line by line and never inferred from an order's size or name.
 *
 * **Box counts come only from an explicit mapping, keyed by Shopify variant ID.**
 * Nothing is read out of a product title. That rule exists because titles carry
 * numbers that have nothing to do with packaging: "Asics Gel NYC Barely rose -
 * 40" is a shoe in size 40, and reading 40 boxes out of it would have charged
 * ₪480 of product cost and ₪160 of shipping against a pair of trainers.
 *
 * A variant with no mapping contributes **zero** boxes, so an ordinary product
 * is never costed as packaging. That safety has a cost of its own: a real box
 * pack that nobody has mapped yet also contributes nothing, which understates
 * COGS and overstates profit. Unmapped variants are therefore reported by name
 * and unit count so the gap is visible everywhere the figures are, and the
 * mapping screen exists to close it in a few clicks.
 */

export type BoxCountSource =
  /** An explicit decision was recorded for this variant, possibly zero. */
  | 'mapped'
  /** No decision has been recorded. Counted as zero, and reported as unmapped. */
  | 'unmapped';

export type BoxMappingConfig = {
  /**
   * Variant GID → physical boxes per unit sold.
   *
   * An entry of `0` is a real decision — "this is a shoe, it is not packaging" —
   * and is deliberately different from having no entry at all.
   */
  readonly byVariantId: ReadonlyMap<string, number>;
};

export type LineBoxCount = {
  readonly lineId: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly productId: string | null;
  /** Packs sold, straight from Shopify. */
  readonly units: number;
  /** Physical boxes in one unit. Zero when unmapped. */
  readonly boxesPerUnit: number;
  readonly boxes: number;
  readonly source: BoxCountSource;
};

/** A variant sold with no mapping recorded, for the screen to name. */
export type UnmappedVariant = {
  readonly key: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly units: number;
};

export type BoxTally = {
  /** Physical boxes across every mapped line. */
  readonly boxes: number;
  readonly unmappedLines: number;
  readonly unmappedVariants: readonly UnmappedVariant[];
  /** True when every variant sold has a recorded decision. */
  readonly complete: boolean;
};

/** Stable grouping key for a sellable thing. */
function variantKey(line: {
  readonly variantId: string | null;
  readonly productId: string | null;
  readonly productTitle: string;
  readonly variantTitle: string | null;
}): string {
  return line.variantId ?? line.productId ?? `${line.productTitle}|${line.variantTitle ?? ''}`;
}

/** How many physical boxes one line item represents. */
export function resolveLineBoxes(line: SalesLineItem, config: BoxMappingConfig): LineBoxCount {
  const mapped = line.variantId === null ? undefined : config.byVariantId.get(line.variantId);

  const boxesPerUnit = mapped ?? 0;

  return {
    lineId: line.id,
    productTitle: line.productTitle,
    variantTitle: line.variantTitle,
    variantId: line.variantId,
    productId: line.productId,
    units: line.quantity,
    boxesPerUnit,
    boxes: boxesPerUnit * line.quantity,
    source: mapped === undefined ? 'unmapped' : 'mapped',
  };
}

/** Every line of an order, resolved. */
export function resolveOrderBoxes(
  order: SalesOrder,
  config: BoxMappingConfig,
): readonly LineBoxCount[] {
  return order.lineItems.map((line) => resolveLineBoxes(line, config));
}

/** Physical boxes across a period, with everything still awaiting a decision. */
export function tallyBoxes(orders: readonly SalesOrder[], config: BoxMappingConfig): BoxTally {
  let boxes = 0;
  let unmappedLines = 0;
  const unmapped = new Map<string, UnmappedVariant>();

  for (const order of orders) {
    for (const line of resolveOrderBoxes(order, config)) {
      boxes += line.boxes;

      if (line.source === 'unmapped') {
        unmappedLines += 1;
        const key = variantKey(line);
        const existing = unmapped.get(key);
        unmapped.set(key, {
          key,
          productTitle: line.productTitle,
          variantTitle: line.variantTitle,
          variantId: line.variantId,
          units: (existing?.units ?? 0) + line.units,
        });
      }
    }
  }

  return {
    boxes,
    unmappedLines,
    unmappedVariants: [...unmapped.values()].sort((a, b) => b.units - a.units),
    complete: unmappedLines === 0,
  };
}

/**
 * Every distinct variant sold, and what it is currently mapped to.
 *
 * This is what the mapping screen is built from: it comes from real orders, so
 * the list is exactly the things the business actually sells, each with the
 * variant ID that identifies it permanently.
 */
export type ProductMappingRow = {
  readonly key: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly productId: string | null;
  /** Currently recorded boxes per unit, or `null` when nothing is recorded. */
  readonly boxesPerUnit: number | null;
  readonly source: BoxCountSource;
  readonly unitsSold: number;
  readonly boxesSold: number;
};

export function describeMapping(
  orders: readonly SalesOrder[],
  config: BoxMappingConfig,
): readonly ProductMappingRow[] {
  const rows = new Map<string, ProductMappingRow>();

  for (const order of orders) {
    for (const line of resolveOrderBoxes(order, config)) {
      const key = variantKey(line);
      const existing = rows.get(key);

      rows.set(key, {
        key,
        productTitle: line.productTitle,
        variantTitle: line.variantTitle,
        variantId: line.variantId,
        productId: line.productId,
        boxesPerUnit: line.source === 'mapped' ? line.boxesPerUnit : null,
        source: line.source,
        unitsSold: (existing?.unitsSold ?? 0) + line.units,
        boxesSold: (existing?.boxesSold ?? 0) + line.boxes,
      });
    }
  }

  // Unmapped first — they are the ones needing a decision — then by volume.
  return [...rows.values()].sort((a, b) => {
    if (a.source !== b.source) return a.source === 'unmapped' ? -1 : 1;
    return b.unitsSold - a.unitsSold;
  });
}
