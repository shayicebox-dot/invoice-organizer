/**
 * The starting configuration: nothing configured.
 *
 * Deliberately empty rather than pre-filled with plausible rates. A merchant
 * who never opens the Business Costs page must see "not configured", not a
 * 2.9% fee someone guessed for them.
 */

import type { BusinessCostSettings } from "./types";

export function emptySettings(): BusinessCostSettings {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    cogs: { mode: "not_configured", skuCosts: [] },
    shipping: { rates: [], fixedFees: [] },
    payments: { processors: [] },
    klaviyo: { plans: [] },
    expenses: [],
  };
}
