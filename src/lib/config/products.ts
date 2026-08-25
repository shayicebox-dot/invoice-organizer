/**
 * Fallback mapping from Shopify variant to physical box count.
 *
 * The live mapping lives in the database and is edited in Settings → Product
 * mapping; this is only what the app falls back to when the database is not
 * connected, so that a fresh deployment is not entirely blind.
 *
 * Box counts are keyed by variant ID and nothing else. Product titles are never
 * parsed for a number: "Asics Gel NYC Barely rose - 40" is a shoe in size 40,
 * and costing it as forty boxes would charge ₪480 of product cost against a
 * pair of trainers.
 */

/** Variant GID → physical boxes per unit. `0` means "not packaging". */
export const SEED_BOX_MAPPING: Readonly<Record<string, number>> = {
  // Confirmed by the owner.
  'gid://shopify/ProductVariant/43783608762454': 10,
  'gid://shopify/ProductVariant/44628331987030': 0,
};

/** The counts offered as one-click choices in the mapping screen. */
export const BOX_COUNT_PRESETS: readonly number[] = [0, 10, 20, 50];

/** Upper bound on a box count, so a typo cannot become 9,999 boxes. */
export const MAX_BOXES_PER_UNIT = 1000;
