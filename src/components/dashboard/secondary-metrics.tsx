import { formatCount, formatMoney } from '@/lib/utils/format';
import type { Money } from '@/core/money';

type SecondaryMetricsProps = {
  readonly vat: Money | null;
  readonly revenueExVat: Money | null;
  readonly productCost: Money | null;
  readonly shipping: Money | null;
  readonly variableCosts: Money | null;
  readonly fixedExpenses: Money;
  readonly physicalBoxes: number | null;
  readonly averageOrderValue: Money | null;
};

/**
 * The detail behind the headline figures.
 *
 * Deliberately quiet: no cards, no borders, no colour. These are the numbers
 * you look up once you already know whether the period made money, and giving
 * them the same visual weight as net profit is what made the old dashboard take
 * a minute to read instead of five seconds.
 */
export function SecondaryMetrics(props: SecondaryMetricsProps) {
  const entries: readonly { readonly label: string; readonly value: string | null }[] = [
    { label: 'VAT', value: money(props.vat) },
    { label: 'Revenue ex VAT', value: money(props.revenueExVat) },
    { label: 'Product cost', value: money(props.productCost) },
    { label: 'Shipping', value: money(props.shipping) },
    { label: 'Variable costs', value: money(props.variableCosts) },
    { label: 'Fixed expenses', value: formatMoney(props.fixedExpenses) },
    {
      label: 'Physical boxes sold',
      value: props.physicalBoxes === null ? null : formatCount(props.physicalBoxes),
    },
    { label: 'Average order value', value: money(props.averageOrderValue) },
  ];

  return (
    <section aria-label="Detail">
      <h2 className="pb-3 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        Detail
      </h2>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4">
        {entries.map((entry) => (
          <div key={entry.label} className="border-t border-border-subtle pt-2.5">
            <dt className="text-xs text-foreground-muted">{entry.label}</dt>
            <dd className="numeric mt-0.5 text-sm font-medium text-foreground">
              {entry.value ?? <span className="text-foreground-subtle">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function money(amount: Money | null): string | null {
  return amount === null ? null : formatMoney(amount);
}
