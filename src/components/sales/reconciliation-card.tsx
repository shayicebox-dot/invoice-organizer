import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { PeriodTotals } from '@/core/metrics/sales';
import type { PeriodReturn } from '@/data/shopify-orders';
import { formatCount, formatDateRange, formatMoney, formatShortDate } from '@/lib/utils/format';
import type { DateRange } from '@/core/period';

type ReconciliationCardProps = {
  readonly totals: PeriodTotals;
  readonly returns: readonly PeriodReturn[];
  readonly returnsComplete: boolean;
  readonly range: DateRange;
};

/**
 * The period's sales, laid out in Shopify Analytics' own vocabulary.
 *
 * Named to match Shopify line for line — Gross sales, Discounts, Sales
 * reversals, Net sales — so the two can be compared without translation. If a
 * figure ever disagrees, this shows which one, rather than leaving a single
 * total to argue with.
 */
export function ReconciliationCard({
  totals,
  returns,
  returnsComplete,
  range,
}: ReconciliationCardProps) {
  const lateReturns = returns.filter((entry) => entry.againstEarlierOrder);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Reconciliation to Shopify Analytics</CardTitle>
          <CardDescription>
            The same four lines Shopify reports for {formatDateRange(range)}, using Shopify&rsquo;s
            own definitions. Set this beside Analytics → Sales for the identical dates and every
            row should match.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          <Row label="Gross sales" value={formatMoney(totals.grossSales)} sign="+" />
          <Row label="Discounts" value={formatMoney(totals.discounts)} sign="−" />
          <Row label="Sales reversals" value={formatMoney(totals.salesReversals)} sign="−" />
          <Row label="Net sales" value={formatMoney(totals.netRevenue)} emphasis />
          <Row label="Orders" value={formatCount(totals.orderCount)} />
        </dl>

        <div className="mt-4 border-t border-border-subtle pt-3 text-xs leading-relaxed text-foreground-muted">
          <p>
            <span className="font-medium text-foreground">Sales reversals</span> are the goods
            returned during this period — product value only, excluding tax and shipping — counted
            on the day each refund happened, not the day its order was placed. That is how Shopify
            counts them.
          </p>

          {returns.length === 0 ? (
            <p className="mt-2">No returns were processed in this period.</p>
          ) : (
            <>
              <p className="mt-2">
                {formatCount(returns.length)} {returns.length === 1 ? 'return' : 'returns'} in this
                period
                {lateReturns.length > 0 ? (
                  <>
                    , of which{' '}
                    <span className="font-medium text-foreground">
                      {formatCount(lateReturns.length)}
                    </span>{' '}
                    {lateReturns.length === 1 ? 'was' : 'were'} against orders placed before it.
                    Those are the ones a figure dated by the order would miss entirely.
                  </>
                ) : (
                  '.'
                )}
              </p>

              <ul className="mt-2 flex flex-col gap-1">
                {returns.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="flex items-baseline justify-between gap-4">
                    <span>
                      <span className="numeric">{entry.orderNumber}</span>{' '}
                      <span className="text-foreground-subtle">
                        refunded {formatShortDate(entry.businessDate)}
                        {entry.againstEarlierOrder ? ' · earlier order' : ''}
                      </span>
                    </span>
                    <span className="numeric">{formatMoney(entry.productSubtotal)}</span>
                  </li>
                ))}
              </ul>

              {returns.length > 8 ? (
                <p className="mt-1 text-foreground-subtle">
                  and {formatCount(returns.length - 8)} more.
                </p>
              ) : null}
            </>
          )}

          {returnsComplete ? null : (
            <p className="mt-2 text-negative">
              The refund sweep stopped before every page was read, so sales reversals are
              incomplete for this period. Choose a shorter period.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  sign,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly sign?: '+' | '−';
  readonly emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex items-baseline justify-between gap-4 border-t border-border-strong py-2 font-medium'
          : 'flex items-baseline justify-between gap-4 border-t border-border-subtle py-2'
      }
    >
      <dt className="flex items-baseline gap-1.5 text-sm text-foreground-muted">
        {sign ? (
          <span aria-hidden="true" className="w-2 text-foreground-subtle">
            {sign}
          </span>
        ) : null}
        {label}
      </dt>
      <dd className="numeric text-sm text-foreground">{value}</dd>
    </div>
  );
}
