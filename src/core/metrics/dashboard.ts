import {
  divideMoney,
  moneyRatio,
  subtractMoney,
  sumMoney,
  type Money,
} from '@/core/money';
import type { AdPlatformId } from '@/core/metrics/marketing';
import type {
  DashboardMetrics,
  InputId,
  Metric,
  MetricValue,
  PeriodInputs,
} from '@/core/metrics/types';

/**
 * Dashboard metric calculations.
 *
 * Pure: no I/O, no dates, no environment access, no React. Every figure is a
 * function of `PeriodInputs` alone, and carries the formula and the inputs it
 * used so the UI can explain it.
 *
 * A metric whose inputs are missing is reported as unavailable. It is never
 * defaulted to zero — "we have no data" and "the value is zero" are different
 * statements, and confusing them is how a financial system starts lying.
 */

const INPUT_LABELS: Readonly<Record<InputId, string>> = {
  grossRevenue: 'order revenue',
  discounts: 'discounts',
  refunds: 'refunds',
  orderCount: 'order count',
  cogs: 'product costs',
  shippingCost: 'shipping costs',
  processingFees: 'payment processing fees',
  metaSpend: 'Meta ad spend',
  googleSpend: 'Google ad spend',
  operatingExpenses: 'operating expenses',
};

function missingInputs(inputs: PeriodInputs, ids: readonly InputId[]): readonly InputId[] {
  return ids.filter((id) => inputs[id] === null);
}

/** The spend input each ad platform supplies. */
const AD_SPEND_INPUT: Readonly<Record<AdPlatformId, InputId>> = {
  meta: 'metaSpend',
  google: 'googleSpend',
};

/**
 * The spend inputs total marketing spend is made of.
 *
 * Only platforms the business actually advertises on. A platform it does not
 * use contributes nothing and is not waited on — otherwise the total could
 * never be reported until every platform ICEBOX might one day use was wired up.
 */
function adSpendInputs(inputs: PeriodInputs): readonly InputId[] {
  return inputs.activeAdPlatforms.map((platform) => AD_SPEND_INPUT[platform]);
}

/** "Meta spend + Google Ads spend", naming only the platforms in use. */
function adSpendFormula(inputs: PeriodInputs): string {
  const labels = adSpendInputs(inputs).map((id) => INPUT_LABELS[id]);
  return labels.length === 0 ? 'No ad platforms configured' : labels.join(' + ');
}

function describeMissing(ids: readonly InputId[]): string {
  const labels = ids.map((id) => INPUT_LABELS[id]);
  if (labels.length === 0) return 'Not enough data to compute';
  if (labels.length === 1) return `Waiting on ${labels[0]}`;
  return `Waiting on ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

type MetricSpec = {
  readonly id: string;
  readonly label: string;
  readonly formula: string;
  readonly dependsOn: readonly InputId[];
};

/**
 * Builds a metric: runs `compute` only when every declared input is present,
 * and records why it could not be computed otherwise.
 */
function buildMetric(
  spec: MetricSpec,
  inputs: PeriodInputs,
  compute: () => MetricValue | null,
): Metric {
  const missing = missingInputs(inputs, spec.dependsOn);

  if (missing.length > 0) {
    return {
      ...spec,
      value: null,
      unavailableReason: describeMissing(missing),
      unavailableKind: 'missing-input',
    };
  }

  const value = compute();

  if (value === null) {
    return {
      ...spec,
      value: null,
      unavailableReason: 'Not defined for this period',
      unavailableKind: 'not-computable',
    };
  }

  return { ...spec, value, unavailableReason: null, unavailableKind: null };
}

function moneyValue(amount: Money): MetricValue {
  return { kind: 'money', amount };
}

/** Sums the money inputs named by `ids`, or `null` if any of them is missing. */
function sumInputs(inputs: PeriodInputs, ids: readonly InputId[]): Money | null {
  const amounts: Money[] = [];

  for (const id of ids) {
    const input = inputs[id];
    if (input === null || typeof input === 'number') return null;
    amounts.push(input);
  }

  return sumMoney(inputs.currency, amounts);
}

export function computeDashboardMetrics(inputs: PeriodInputs): DashboardMetrics {
  const netRevenue = computeNetRevenue(inputs);
  const marketingSpend = computeMarketingSpend(inputs);
  const grossProfit = computeGrossProfit(inputs, netRevenue);
  const netProfit = computeNetProfit(inputs, grossProfit, marketingSpend);

  return {
    // Source figures, passed through so the UI can show a breakdown.
    grossRevenue: passThroughMoney(inputs, 'grossRevenue', 'Gross revenue'),
    discounts: passThroughMoney(inputs, 'discounts', 'Discounts'),
    refunds: passThroughMoney(inputs, 'refunds', 'Refunds'),
    cogs: passThroughMoney(inputs, 'cogs', 'COGS'),
    shippingCost: passThroughMoney(inputs, 'shippingCost', 'Shipping & fulfilment'),
    processingFees: passThroughMoney(inputs, 'processingFees', 'Payment processing'),
    metaSpend: passThroughMoney(inputs, 'metaSpend', 'Meta spend'),
    googleSpend: passThroughMoney(inputs, 'googleSpend', 'Google Ads spend'),
    operatingExpenses: passThroughMoney(inputs, 'operatingExpenses', 'Operating expenses'),

    // Derived figures.
    revenue: buildMetric(
      {
        id: 'revenue',
        label: 'Revenue',
        formula: 'Gross revenue − discounts − refunds',
        dependsOn: ['grossRevenue', 'discounts', 'refunds'],
      },
      inputs,
      () => (netRevenue === null ? null : moneyValue(netRevenue)),
    ),

    orders: buildMetric(
      {
        id: 'orders',
        label: 'Orders',
        formula: 'Count of orders in the period',
        dependsOn: ['orderCount'],
      },
      inputs,
      () => (inputs.orderCount === null ? null : { kind: 'count', count: inputs.orderCount }),
    ),

    aov: buildMetric(
      {
        id: 'aov',
        label: 'Average order value',
        formula: 'Revenue ÷ orders',
        dependsOn: ['grossRevenue', 'discounts', 'refunds', 'orderCount'],
      },
      inputs,
      () => {
        if (netRevenue === null || inputs.orderCount === null) return null;
        const perOrder = divideMoney(netRevenue, inputs.orderCount);
        return perOrder === null ? null : moneyValue(perOrder);
      },
    ),

    marketingSpend: buildMetric(
      {
        id: 'marketingSpend',
        label: 'Marketing spend',
        formula: adSpendFormula(inputs),
        dependsOn: adSpendInputs(inputs),
      },
      inputs,
      () => (marketingSpend === null ? null : moneyValue(marketingSpend)),
    ),

    roas: buildMetric(
      {
        id: 'roas',
        label: 'ROAS',
        formula: 'Revenue ÷ marketing spend',
        dependsOn: ['grossRevenue', 'discounts', 'refunds', ...adSpendInputs(inputs)],
      },
      inputs,
      () => {
        if (netRevenue === null || marketingSpend === null) return null;
        const ratio = moneyRatio(netRevenue, marketingSpend);
        return ratio === null ? null : { kind: 'multiple', multiple: ratio };
      },
    ),

    cpa: buildMetric(
      {
        id: 'cpa',
        label: 'CPA',
        formula: 'Marketing spend ÷ orders',
        dependsOn: [...adSpendInputs(inputs), 'orderCount'],
      },
      inputs,
      () => {
        if (marketingSpend === null || inputs.orderCount === null) return null;
        const perOrder = divideMoney(marketingSpend, inputs.orderCount);
        return perOrder === null ? null : moneyValue(perOrder);
      },
    ),

    grossProfit: buildMetric(
      {
        id: 'grossProfit',
        label: 'Gross profit',
        formula: 'Revenue − COGS',
        dependsOn: ['grossRevenue', 'discounts', 'refunds', 'cogs'],
      },
      inputs,
      () => (grossProfit === null ? null : moneyValue(grossProfit)),
    ),

    netProfit: buildMetric(
      {
        id: 'netProfit',
        label: 'Net profit',
        formula:
          'Gross profit − marketing spend − shipping − payment processing − operating expenses',
        dependsOn: [
          'grossRevenue',
          'discounts',
          'refunds',
          'cogs',
          ...adSpendInputs(inputs),
          'shippingCost',
          'processingFees',
          'operatingExpenses',
        ],
      },
      inputs,
      () => (netProfit === null ? null : moneyValue(netProfit)),
    ),

    netMargin: buildMetric(
      {
        id: 'netMargin',
        label: 'Net margin',
        formula: 'Net profit ÷ revenue',
        dependsOn: [
          'grossRevenue',
          'discounts',
          'refunds',
          'cogs',
          ...adSpendInputs(inputs),
          'shippingCost',
          'processingFees',
          'operatingExpenses',
        ],
      },
      inputs,
      () => {
        if (netProfit === null || netRevenue === null) return null;
        const ratio = moneyRatio(netProfit, netRevenue);
        return ratio === null ? null : { kind: 'percent', fraction: ratio };
      },
    ),
  };
}

function passThroughMoney(
  inputs: PeriodInputs,
  id: Extract<
    InputId,
    | 'grossRevenue'
    | 'discounts'
    | 'refunds'
    | 'cogs'
    | 'shippingCost'
    | 'processingFees'
    | 'metaSpend'
    | 'googleSpend'
    | 'operatingExpenses'
  >,
  label: string,
): Metric {
  return buildMetric({ id, label, formula: `Reported ${INPUT_LABELS[id]}`, dependsOn: [id] }, inputs, () => {
    const amount = inputs[id];
    return amount === null ? null : moneyValue(amount);
  });
}

function computeNetRevenue(inputs: PeriodInputs): Money | null {
  const { grossRevenue, discounts, refunds } = inputs;
  if (grossRevenue === null || discounts === null || refunds === null) return null;
  return subtractMoney(subtractMoney(grossRevenue, discounts), refunds);
}

/**
 * Total ad spend across the platforms the business runs.
 *
 * With no platform configured there is nothing to total — reported as
 * unavailable rather than as a zero that would look like "we spent nothing".
 */
function computeMarketingSpend(inputs: PeriodInputs): Money | null {
  const ids = adSpendInputs(inputs);
  return ids.length === 0 ? null : sumInputs(inputs, ids);
}

function computeGrossProfit(inputs: PeriodInputs, netRevenue: Money | null): Money | null {
  if (netRevenue === null || inputs.cogs === null) return null;
  return subtractMoney(netRevenue, inputs.cogs);
}

function computeNetProfit(
  inputs: PeriodInputs,
  grossProfit: Money | null,
  marketingSpend: Money | null,
): Money | null {
  const { shippingCost, processingFees, operatingExpenses } = inputs;
  if (
    grossProfit === null ||
    marketingSpend === null ||
    shippingCost === null ||
    processingFees === null ||
    operatingExpenses === null
  ) {
    return null;
  }

  const costs = sumMoney(inputs.currency, [
    marketingSpend,
    shippingCost,
    processingFees,
    operatingExpenses,
  ]);
  return subtractMoney(grossProfit, costs);
}

/** Marketing spend on its own, for callers that only need the total. */
export function totalMarketingSpend(inputs: PeriodInputs): Money | null {
  return computeMarketingSpend(inputs);
}
