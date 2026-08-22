import type { CurrencyCode, Money } from '@/core/money';

/** Identifier of an upstream input a metric depends on. Used for traceability. */
export type InputId =
  | 'grossRevenue'
  | 'discounts'
  | 'refunds'
  | 'orderCount'
  | 'cogs'
  | 'shippingCost'
  | 'processingFees'
  | 'metaSpend'
  | 'googleSpend'
  | 'operatingExpenses';

/**
 * Everything a period's metrics are derived from.
 *
 * `null` means "this input has no source yet" — it is explicitly NOT zero.
 * Any metric depending on a null input is reported as unavailable rather than
 * silently computed from a made-up zero.
 */
export type PeriodInputs = {
  readonly currency: CurrencyCode;
  readonly grossRevenue: Money | null;
  readonly discounts: Money | null;
  readonly refunds: Money | null;
  readonly orderCount: number | null;
  readonly cogs: Money | null;
  readonly shippingCost: Money | null;
  readonly processingFees: Money | null;
  readonly metaSpend: Money | null;
  readonly googleSpend: Money | null;
  readonly operatingExpenses: Money | null;
};

export type MetricValue =
  | { readonly kind: 'money'; readonly amount: Money }
  | { readonly kind: 'count'; readonly count: number }
  | { readonly kind: 'multiple'; readonly multiple: number }
  | { readonly kind: 'percent'; readonly fraction: number };

/**
 * A single figure, together with everything needed to explain it:
 * the formula that produced it and the inputs it consumed.
 *
 * `value === null` means the metric could not be computed. `unavailableReason`
 * then says why, so the UI never has to guess between "zero" and "unknown".
 */
export type Metric = {
  readonly id: string;
  readonly label: string;
  readonly formula: string;
  readonly dependsOn: readonly InputId[];
  readonly value: MetricValue | null;
  readonly unavailableReason: string | null;
};

export type MetricId =
  | 'revenue'
  | 'orders'
  | 'aov'
  | 'marketingSpend'
  | 'roas'
  | 'cpa'
  | 'cogs'
  | 'grossProfit'
  | 'netProfit'
  | 'netMargin'
  | 'grossRevenue'
  | 'discounts'
  | 'refunds'
  | 'metaSpend'
  | 'googleSpend'
  | 'shippingCost'
  | 'processingFees'
  | 'operatingExpenses';

export type DashboardMetrics = Readonly<Record<MetricId, Metric>>;
