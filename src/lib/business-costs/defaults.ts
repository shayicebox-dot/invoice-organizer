/**
 * The starting configuration: nothing configured.
 *
 * Deliberately empty rather than pre-filled with plausible rates. A merchant
 * who never opens the Business Costs page must see "not configured", not a
 * 2.9% fee someone guessed for them.
 *
 * COGS is the one exception, and not a guess: it defaults to Shopify's own cost
 * per item, which is real data the merchant already maintains. A variant with
 * no cost recorded is reported as missing, never estimated.
 */

import type { BusinessCostSettings } from "./types";

export function emptySettings(): BusinessCostSettings {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    // Shopify's own cost per item is the default source: it is real data the
    // merchant already maintains, so COGS is right without any setup.
    cogs: { mode: "shopify_cost_per_item", skuCosts: [] },
    shipping: { rates: [], fixedFees: [] },
    payments: { processors: [] },
    klaviyo: { plans: [] },
    expenses: [],
  };
}
