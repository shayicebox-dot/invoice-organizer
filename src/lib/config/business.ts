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
  /** Average fulfilment cost per order, minor units. `null` until measured. */
  readonly costPerOrderMinorUnits: number | null;
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
  readonly shipping: ShippingCostConfig;
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
    shipping: { costPerOrderMinorUnits: null, currency: 'ILS' },
    paymentProcessing: { rateBasisPoints: null, fixedFeeMinorUnits: null, currency: 'ILS' },
    fixedExpenses: [],
    fallbackUnitCostMinorUnits: null,
  },
};

/** True once at least one cost assumption has been configured. */
export function hasCostConfiguration(config: CostConfig = BUSINESS_CONFIG.costs): boolean {
  return (
    config.shipping.costPerOrderMinorUnits !== null ||
    config.paymentProcessing.rateBasisPoints !== null ||
    config.fixedExpenses.length > 0
  );
}
