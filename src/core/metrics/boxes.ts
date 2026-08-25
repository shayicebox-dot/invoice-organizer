import type { SalesLineItem, SalesOrder } from '@/core/metrics/sales';

/**
 * Counting the physical boxes behind an order.
 *
 * Shopify's line item quantity is a count of *packs*, not of boxes. One unit of
 * a "20 box pack" is twenty boxes; two units are forty. Customers combine packs
 * freely — 30 boxes is a 20 plus a 10, 60 boxes is any combination totalling 60
 * — so a box count can only ever be built up line by line from what was sold,
 * never inferred from an order's size or name.
 *
 * Every cost in this system is per physical box, so this resolution is the
 * foundation the profit engine stands on. It is deliberately explicit about how
 * each line was resolved, and refuses to guess: a line it cannot map reports
 * `null` boxes rather than zero, and the caller must treat the period's costs as
 * incomplete rather than quietly under-count them.
 */

export type BoxCountSource =
  /** Matched a variant ID in configuration. Stable and unambiguous. */
  | 'variant-id'
  /** Matched a product ID in configuration. */
  | 'product-id'
  /** Read out of the product or variant title. A guess, and marked as one. */
  | 'title'
  /** Nothing matched. The line's box count is unknown. */
  | 'unresolved';

export type BoxMappingConfig = {
  readonly byVariantId: Readonly<Record<string, number>>;
  readonly byProductId: Readonly<Record<string, number>>;
  readonly allowTitleFallback: boolean;
  readonly maxBoxesPerUnit: number;
};

export type LineBoxCount = {
  readonly lineId: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly productId: string | null;
  /** Packs sold, straight from Shopify. */
  readonly units: number;
  /** Physical boxes in one unit, or `null` when unknown. */
  readonly boxesPerUnit: number | null;
  /** `units × boxesPerUnit`, or `null` when unknown. */
  readonly boxes: number | null;
  readonly source: BoxCountSource;
};

/** A product that could not be mapped, collected for the screen to name. */
export type UnmappedProduct = {
  readonly key: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly units: number;
};

export type BoxTally = {
  /** Boxes across every line that could be resolved. */
  readonly boxes: number;
  /** Lines whose box count is unknown, so `boxes` understates the period. */
  readonly unresolvedLines: number;
  /** Lines resolved by reading a title rather than an ID — worth confirming. */
  readonly titleResolvedLines: number;
  readonly unmappedProducts: readonly UnmappedProduct[];
  /** True when every line resolved, so costs derived from `boxes` are complete. */
  readonly complete: boolean;
};

/**
 * Numbers that plausibly name a pack size in a title.
 *
 * Matches "20 boxes", "20-pack", "20 יח'" and a bare "20" — the last because
 * Shopify variant titles for a size option are frequently just the number. The
 * unit words cover both English and the Hebrew the ICEBOX store uses.
 */
const QUANTITY_WITH_UNIT =
  /(\d{1,4})\s*[-–]?\s*(?:box(?:es)?|pack(?:s)?|pcs|units?|קופסאות|קופסות|יחידות|יח['׳]?)/i;
const BARE_NUMBER = /^\s*(\d{1,4})\s*$/;

/**
 * Read a box count out of a title.
 *
 * A fallback, used only until the real variant IDs are configured, and always
 * reported as such by `source: 'title'`. The variant title is tried first: on a
 * store selling pack sizes it is the more specific of the two.
 */
export function boxesFromTitle(
  productTitle: string,
  variantTitle: string | null,
  maxBoxesPerUnit: number,
): number | null {
  for (const candidate of [variantTitle, productTitle]) {
    if (candidate === null || candidate.length === 0) continue;

    const bare = BARE_NUMBER.exec(candidate);
    const withUnit = QUANTITY_WITH_UNIT.exec(candidate);
    const digits = bare?.[1] ?? withUnit?.[1];

    if (digits === undefined) continue;

    const parsed = Number(digits);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= maxBoxesPerUnit) {
      return parsed;
    }
  }

  return null;
}

/** How many physical boxes one line item represents. */
export function resolveLineBoxes(line: SalesLineItem, config: BoxMappingConfig): LineBoxCount {
  const base = {
    lineId: line.id,
    productTitle: line.productTitle,
    variantTitle: line.variantTitle,
    variantId: line.variantId,
    productId: line.productId,
    units: line.quantity,
  };

  const resolved = (boxesPerUnit: number, source: BoxCountSource): LineBoxCount => ({
    ...base,
    boxesPerUnit,
    boxes: boxesPerUnit * line.quantity,
    source,
  });

  // Most specific first: a variant ID names exactly one sellable thing.
  const byVariant = line.variantId === null ? undefined : config.byVariantId[line.variantId];
  if (byVariant !== undefined) return resolved(byVariant, 'variant-id');

  const byProduct = line.productId === null ? undefined : config.byProductId[line.productId];
  if (byProduct !== undefined) return resolved(byProduct, 'product-id');

  if (config.allowTitleFallback) {
    const fromTitle = boxesFromTitle(line.productTitle, line.variantTitle, config.maxBoxesPerUnit);
    if (fromTitle !== null) return resolved(fromTitle, 'title');
  }

  return { ...base, boxesPerUnit: null, boxes: null, source: 'unresolved' };
}

/** Every line of an order, resolved. */
export function resolveOrderBoxes(
  order: SalesOrder,
  config: BoxMappingConfig,
): readonly LineBoxCount[] {
  return order.lineItems.map((line) => resolveLineBoxes(line, config));
}

/** Physical boxes across a period, with everything that could not be counted. */
export function tallyBoxes(
  orders: readonly SalesOrder[],
  config: BoxMappingConfig,
): BoxTally {
  let boxes = 0;
  let unresolvedLines = 0;
  let titleResolvedLines = 0;
  const unmapped = new Map<string, UnmappedProduct>();

  for (const order of orders) {
    for (const line of resolveOrderBoxes(order, config)) {
      if (line.source === 'title') titleResolvedLines += 1;

      if (line.boxes === null) {
        unresolvedLines += 1;
        const key = line.variantId ?? line.productId ?? `${line.productTitle}|${line.variantTitle ?? ''}`;
        const existing = unmapped.get(key);
        unmapped.set(key, {
          key,
          productTitle: line.productTitle,
          variantTitle: line.variantTitle,
          variantId: line.variantId,
          units: (existing?.units ?? 0) + line.units,
        });
        continue;
      }

      boxes += line.boxes;
    }
  }

  return {
    boxes,
    unresolvedLines,
    titleResolvedLines,
    unmappedProducts: [...unmapped.values()].sort((a, b) => b.units - a.units),
    complete: unresolvedLines === 0,
  };
}

/**
 * Every distinct product seen, and how its box count was arrived at.
 *
 * Surfaced in Settings so the mapping can be checked against the real store and
 * the guessed ones replaced with variant IDs. A cost engine whose foundation is
 * inferred should show its working.
 */
export type ProductMappingRow = {
  readonly key: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly variantId: string | null;
  readonly productId: string | null;
  readonly boxesPerUnit: number | null;
  readonly source: BoxCountSource;
  readonly unitsSold: number;
  readonly boxesSold: number | null;
};

export function describeMapping(
  orders: readonly SalesOrder[],
  config: BoxMappingConfig,
): readonly ProductMappingRow[] {
  const rows = new Map<string, ProductMappingRow>();

  for (const order of orders) {
    for (const line of resolveOrderBoxes(order, config)) {
      const key = line.variantId ?? line.productId ?? `${line.productTitle}|${line.variantTitle ?? ''}`;
      const existing = rows.get(key);

      rows.set(key, {
        key,
        productTitle: line.productTitle,
        variantTitle: line.variantTitle,
        variantId: line.variantId,
        productId: line.productId,
        boxesPerUnit: line.boxesPerUnit,
        source: line.source,
        unitsSold: (existing?.unitsSold ?? 0) + line.units,
        boxesSold:
          line.boxes === null ? existing?.boxesSold ?? null : (existing?.boxesSold ?? 0) + line.boxes,
      });
    }
  }

  return [...rows.values()].sort((a, b) => b.unitsSold - a.unitsSold);
}
