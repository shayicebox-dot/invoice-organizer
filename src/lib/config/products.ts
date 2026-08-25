/**
 * Mapping from what Shopify sells to what ICEBOX physically ships.
 *
 * This is the single place that answers "how many physical boxes is this line
 * item?", and it exists because the two are not the same number. One unit of a
 * "20 box pack" is twenty boxes, and a customer can combine packs freely: 30
 * boxes is a 20 and a 10, 60 boxes is any combination totalling 60. Costing
 * anything from the pack an order was named after would therefore be wrong.
 *
 * Every cost in the engine is per physical box, so this mapping is what the
 * whole profit calculation rests on. Get it wrong and every figure downstream
 * is wrong in the same direction.
 *
 * Prefer variant IDs. A variant ID is stable: renaming a product in Shopify
 * does not change it, and two products cannot collide. Titles are neither
 * stable nor unique, which is why they are only a fallback.
 */

export type BoxPackMapping = {
  /**
   * Shopify variant GID → physical boxes per unit sold. The authoritative map.
   * Example: `'gid://shopify/ProductVariant/123'` → `20`.
   */
  readonly byVariantId: Readonly<Record<string, number>>;
  /** Shopify product GID → boxes per unit, for products with a single variant. */
  readonly byProductId: Readonly<Record<string, number>>;
  /**
   * Whether an unmapped line may fall back to reading a count out of its title.
   *
   * On by default so the engine produces figures before every ID has been
   * entered. A line resolved this way is marked as such everywhere it appears,
   * and Settings lists them so the real IDs can be pinned down. Turning this
   * off makes any unmapped line report no box count at all, which withholds
   * COGS rather than guessing it.
   */
  readonly allowTitleFallback: boolean;
};

/**
 * The live mapping.
 *
 * `byVariantId` is intentionally empty until the real variant IDs are read off
 * the ICEBOX store — an invented ID would silently match nothing, which is
 * worse than an empty map that says so. Settings → Product mapping lists every
 * product seen in the selected period with its variant ID, ready to paste here.
 */
export const BOX_PACK_MAPPING: BoxPackMapping = {
  byVariantId: {},
  byProductId: {},
  allowTitleFallback: true,
};

/** Bounds a title-derived count, so a stray number cannot become 9,999 boxes. */
export const MAX_BOXES_PER_UNIT = 500;
