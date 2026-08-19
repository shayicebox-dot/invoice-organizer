/**
 * Business cost configuration.
 *
 * These are the real, merchant-supplied inputs that replace the mock cost
 * lines: what a unit costs, what it costs to ship, what the processor takes,
 * what the software bill is, and everything else that leaves the bank account.
 *
 * Every record carries an effective window, because a cost that changed in
 * March must not be applied to February. Nothing here is a rate that the app
 * invents — an unconfigured section reports itself as incomplete rather than
 * quietly falling back to a plausible number.
 */

import type { Money } from "../money";
import type { ExpenseCategory, ISODate } from "../types";
import type { PackCostModel } from "./pack-model";

/** Where a figure on the dashboard came from. */
export type CostSource =
  /** Read from a provider API. */
  | "live"
  /** Configured by the merchant on the Business Costs page. */
  | "manual"
  /** A real business rule applied to real Shopify volume. */
  | "manual_real"
  /** Generated demo data — never a real number. */
  | "mock"
  /** Configured, but some input is missing, so the total understates. */
  | "incomplete"
  /** Deliberately not set up. Contributes zero, and is not pretending to. */
  | "not_configured";

/** Anything that applies over a date window. */
export interface EffectiveWindow {
  effectiveFrom: ISODate;
  /** Exclusive upper bound. `null` means still in force. */
  effectiveTo: ISODate | null;
}

// --- COGS ------------------------------------------------------------------

export type CogsMode =
  /** Cost by pack size using the business's own pack rules. */
  | "pack_cost_model"
  /** Use Shopify's own cost-per-item from the inventory item. */
  | "shopify_cost_per_item"
  /** Use the per-SKU costs configured below. */
  | "manual_sku_costs"
  /** Nothing configured; COGS is not real. */
  | "not_configured";

export interface SkuCost extends EffectiveWindow {
  id: string;
  sku: string;
  /** Human label, for the settings table only. */
  label: string;
  unitCost: Money;
}

export interface CogsSettings {
  mode: CogsMode;
  skuCosts: SkuCost[];
}

// --- Shipping & fulfillment ------------------------------------------------

export interface ShippingRate extends EffectiveWindow {
  id: string;
  label: string;
  /** Charged once per order. */
  perOrder: Money;
  /** Charged per unit in the order. */
  perUnit: Money;
  /** When set, the rate applies only to units of this SKU. */
  sku: string | null;
}

// --- Payment processing ----------------------------------------------------

export interface PaymentProcessor extends EffectiveWindow {
  id: string;
  name: string;
  /** Decimal rate applied to net sales, e.g. 0.029 for 2.9%. */
  percentageRate: number;
  /** Flat amount per transaction. */
  fixedPerTransaction: Money;
  /**
   * Share of orders this processor handles, 0..1. A single processor should be
   * 1. Splitting across processors lets a store model a real payment mix.
   */
  shareOfOrders: number;
}

// --- Recurring and one-off spend -------------------------------------------

export type Recurrence = "monthly" | "weekly" | "yearly" | "one_time";

/**
 * A cost that recurs on a schedule, or happens once. Used for other business
 * expenses, the Klaviyo subscription, and monthly 3PL minimums — the arithmetic
 * is identical, so the shape is shared.
 */
export interface RecurringCost {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: Money;
  recurrence: Recurrence;
  /** First day the cost applies. For `one_time`, the day it lands. */
  startDate: ISODate;
  /** Last day it applies, inclusive. `null` means ongoing. */
  endDate: ISODate | null;
}

// --- The whole configuration ----------------------------------------------

export interface BusinessCostSettings {
  /** Schema version, so a stored file can be migrated later. */
  version: 1;
  updatedAt: string;
  cogs: CogsSettings;
  /**
   * Pack-size cost rules. Drives COGS and fulfillment together, because the
   * business buys and ships by the pack rather than by the unit.
   */
  packModel: PackCostModel;
  shipping: {
    rates: ShippingRate[];
    /** 3PL minimums and other fixed fulfillment fees. */
    fixedFees: RecurringCost[];
  };
  payments: {
    processors: PaymentProcessor[];
  };
  klaviyo: {
    /** Subscription plans over time. Prorated across the selected range. */
    plans: RecurringCost[];
  };
  expenses: RecurringCost[];
}

/** Something the merchant needs to fix before the P&L is trustworthy. */
export interface CostIssue {
  section: "cogs" | "shipping" | "payments" | "klaviyo" | "expenses";
  /** Shown verbatim in the UI. */
  message: string;
  /** SKUs or other identifiers the merchant has to configure. */
  details: string[];
}

/** Which sections are real, and which are still standing in. */
export interface CostSourceMap {
  cogs: CostSource;
  shipping: CostSource;
  paymentFees: CostSource;
  klaviyo: CostSource;
  otherExpenses: CostSource;
}
