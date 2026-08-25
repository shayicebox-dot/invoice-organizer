import type { CurrencyCode } from '@/core/money';
import type { AdPlatformId } from '@/core/metrics/marketing';

/**
 * Business configuration for ICEBOX.
 *
 * This is where business facts and cost assumptions live — never in a component
 * and never inline in a calculation. Values that are not yet known are `null`
 * or empty on purpose: the system reports "not configured" rather than applying
 * a plausible-looking default.
 *
 * Rates are integers in basis points (1 bp = 0.01%, so 2.9% = 290 bp) to keep
 * every calculation free of floating-point arithmetic.
 */

export type FixedExpense = {
  readonly id: string;
  readonly label: string;
  /** Monthly cost in minor units of `currency`. */
  readonly monthlyMinorUnits: number;
  readonly currency: CurrencyCode;
};

export type ShippingCostConfig = {
  /**
   * Cost of shipping one physical box to the customer, VAT inclusive.
   *
   * ICEBOX pays ₪40 including VAT per 10 boxes shipped, and the rate is linear,
   * so one box is ₪4. Stated per box rather than per pack: a customer can
   * combine packs freely — 30 boxes is a 20 and a 10 — so nothing may be costed
   * from the pack a line was sold as.
   */
  readonly costPerBoxInclVatMinorUnits: number | null;
  readonly currency: CurrencyCode;
};

export type ProductCostConfig = {
  /**
   * Fully landed cost of one physical box, VAT inclusive.
   *
   * ₪120 including VAT per 10 boxes, after China freight and arrival at the
   * Israeli warehouse, so ₪12 per box. Linear at every quantity.
   */
  readonly costPerBoxInclVatMinorUnits: number | null;
  readonly currency: CurrencyCode;
};

export type PaymentProcessingConfig = {
  /** Processor percentage in basis points. `null` until configured. */
  readonly rateBasisPoints: number | null;
  /** Fixed fee per transaction, minor units. `null` until configured. */
  readonly fixedFeeMinorUnits: number | null;
  readonly currency: CurrencyCode;
};

export type CostConfig = {
  readonly productCost: ProductCostConfig;
  readonly shipping: ShippingCostConfig;
  /**
   * Simplified variable operating costs, as a share of net revenue excluding
   * VAT. A deliberate simplification standing in for payment fees, packaging
   * and returns handling until each is measured separately.
   */
  readonly variableOperatingRateBasisPoints: number | null;
  readonly paymentProcessing: PaymentProcessingConfig;
  /** Recurring monthly overheads. Empty until entered in Settings. */
  readonly fixedExpenses: readonly FixedExpense[];
  /**
   * Fallback unit cost when a product has no cost recorded. Intentionally
   * `null`: an unknown COGS must surface as unknown, not as an estimate.
   */
  readonly fallbackUnitCostMinorUnits: null;
};

export type BusinessConfig = {
  readonly name: string;
  readonly countryCode: 'IL';
  /** Currency every figure is reported in. */
  readonly reportingCurrency: CurrencyCode;
  readonly locale: string;
  /** Business timezone — decides which calendar day an order belongs to. */
  readonly timeZone: string;
  readonly fiscalYearStartMonth: number;
  /**
   * Ad platforms this business actually advertises on.
   *
   * This is a business fact, not a connection status, and it is what total
   * marketing spend is summed over. A platform listed here but not yet
   * connected makes the total unavailable — its spend is unknown, not zero. A
   * platform not listed contributes nothing, because the business does not
   * spend there. Without this distinction a total could only ever be reported
   * once every platform ICEBOX might one day use was connected.
   */
  readonly adPlatforms: readonly AdPlatformId[];
  readonly costs: CostConfig;
};

export const BUSINESS_CONFIG: BusinessConfig = {
  name: 'ICEBOX',
  countryCode: 'IL',
  reportingCurrency: 'ILS',
  locale: 'en-IL',
  timeZone: 'Asia/Jerusalem',
  fiscalYearStartMonth: 1,
  // Meta is the only platform ICEBOX advertises on today. Add 'google' here at
  // the same time as the Google Ads integration, not before.
  adPlatforms: ['meta'],
  costs: {
    // ₪120 incl VAT per 10 boxes → ₪12 per box.
    productCost: { costPerBoxInclVatMinorUnits: 1_200, currency: 'ILS' },
    // ₪40 incl VAT per 10 boxes → ₪4 per box.
    shipping: { costPerBoxInclVatMinorUnits: 400, currency: 'ILS' },
    // 5% of net revenue excluding VAT.
    variableOperatingRateBasisPoints: 500,
    paymentProcessing: { rateBasisPoints: null, fixedFeeMinorUnits: null, currency: 'ILS' },
    fixedExpenses: [
      { id: 'warehouse', label: 'Warehouse', monthlyMinorUnits: 250_000, currency: 'ILS' },
      { id: 'employee', label: 'Employee', monthlyMinorUnits: 150_000, currency: 'ILS' },
    ],
    fallbackUnitCostMinorUnits: null,
  },
};

/**
 * Israeli VAT, as a dated schedule rather than a single number.
 *
 * The rate changes by law and has done recently — 17% until the end of 2024,
 * 18% from 1 January 2025. A figure for a past period must use the rate that
 * applied then, so the schedule is kept and looked up by date. Newest first.
 */
export type VatRatePeriod = {
  /** Inclusive first day this rate applied, `YYYY-MM-DD`. */
  readonly from: string;
  readonly basisPoints: number;
};

export const VAT_RATE_SCHEDULE: readonly VatRatePeriod[] = [
  { from: '2025-01-01', basisPoints: 1_800 },
  { from: '2013-06-02', basisPoints: 1_700 },
];

/** True once at least one cost assumption has been configured. */
export function hasCostConfiguration(config: CostConfig = BUSINESS_CONFIG.costs): boolean {
  return (
    config.productCost.costPerBoxInclVatMinorUnits !== null ||
    config.shipping.costPerBoxInclVatMinorUnits !== null ||
    config.variableOperatingRateBasisPoints !== null ||
    config.fixedExpenses.length > 0
  );
}

/** The VAT rate in force on a given date, or `null` before the schedule starts. */
export function vatRateOn(date: string): number | null {
  return VAT_RATE_SCHEDULE.find((period) => date >= period.from)?.basisPoints ?? null;
}
