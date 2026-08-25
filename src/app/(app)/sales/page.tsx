import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { DataNotices } from '@/components/sales/data-notices';
import { OrdersTable } from '@/components/sales/orders-table';
import { getSalesPageData } from '@/data/sales-source';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { formatCount, formatDateRange, formatMoney } from '@/lib/utils/format';
import { divideMoney } from '@/core/money';

export const metadata: Metadata = { title: 'Sales' };

/** Every load reads live from Shopify, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type SalesPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SalesPage({ searchParams }: SalesPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);

  const data = await getSalesPageData(range);
  const { totals } = data;
  const averageOrderValue =
    totals.orderCount > 0 ? divideMoney(totals.netRevenue, totals.orderCount) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Sales"
        description={`Orders from Shopify for ${formatDateRange(data.caveats.coverage.range)}.`}
        actions={
          <>
            <DateRangePicker range={range} preset={preset} today={today} basePath="/sales" />
            <Badge tone={data.orders.length > 0 ? 'positive' : 'neutral'}>
              {formatCount(data.orders.length)} orders
            </Badge>
          </>
        }
      />

      <PeriodNotice adjustment={adjustment} />
      <DataNotices caveats={data.caveats} />

      {data.lineItemsTruncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
          At least one order has more than 100 line items; only the first 100 are listed for it.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Period totals</CardTitle>
            <CardDescription>
              Gross sales are product prices before discounts. Net revenue is gross sales less
              discounts and refunds.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <TotalRow label="Gross sales" value={formatMoney(totals.grossSales)} sign="+" />
            <TotalRow label="Discounts" value={formatMoney(totals.discounts)} sign="−" />
            <TotalRow label="Refunds" value={formatMoney(totals.refunds)} sign="−" />
            <TotalRow label="Net revenue" value={formatMoney(totals.netRevenue)} emphasis />
            <TotalRow label="Orders" value={formatCount(totals.orderCount)} />
            <TotalRow
              label="Average order value"
              value={averageOrderValue === null ? '—' : formatMoney(averageOrderValue)}
            />
          </dl>
        </CardContent>
      </Card>

      <OrdersTable orders={data.orders} />
    </div>
  );
}

function TotalRow({
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
