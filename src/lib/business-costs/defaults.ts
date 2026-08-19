/**
 * The starting configuration: nothing configured.
 *
 * Deliberately empty rather than pre-filled with plausible rates. A merchant
 * who never opens the Business Costs page must see "not configured", not a
 * 2.9% fee someone guessed for them.
 *
 * COGS and fulfillment are the exception, and not a guess: they default to the
 * business's real pack cost model, applied to real Shopify volume. A line that
 * cannot be mapped to a pack confidently is reported, never estimated.
 */

import { defaultPackModel } from "./pack-model";
import type { BusinessCostSettings } from "./types";

export function emptySettings(): BusinessCostSettings {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    // The pack model is the business's real cost structure, so it is the
    // default. It costs by pack size against real Shopify volume.
    cogs: { mode: "pack_cost_model", skuCosts: [] },
    packModel: defaultPackModel(),
    shipping: { rates: [], fixedFees: [] },
    payments: { processors: [] },
    klaviyo: { plans: [] },
    expenses: [],
  };
}
