import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { DataNotices } from '@/components/sales/data-notices';
import { MappingNotice, VatNotice } from '@/components/profitability/mapping-notice';
import { getDashboardData } from '@/data/dashboard-source';
import { expenseLines, totalExpenses } from '@/data/profitability-source';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { formatDateRange, formatMoney, formatPercent } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Expenses' };

/** Every load reads live from Shopify and Meta, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type ExpensesPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Every cost the business carries in a period, and what share of revenue each
 * one takes.
 *
 * The shares are of revenue **excluding VAT**, because VAT is not the
 * business's money — measuring a cost against a VAT-inclusive figure would
 * understate it by the VAT rate.
 */
export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);
  const data = await getDashboardData(range);
  const { pnl, boxes, vat } = data.profitability;

  const lines = expenseLines(pnl);
  const total = totalExpenses(lines, pnl.currency);
  const totalShare =
    total === null || pnl.revenueExVat === null || pnl.revenueExVat.minorUnits === 0
      ? null
      : total.minorUnits / pnl.revenueExVat.minorUnits;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Expenses"
        description={`Every cost carried over ${formatDateRange(data.range)}, excluding VAT.`}
        actions={
          <>
            <DateRangePicker range={range} preset={preset} today={today} basePath="/expenses" />
            <Badge tone={total === null ? 'neutral' : 'positive'}>
              {total === null ? 'Incomplete' : formatMoney(total)}
            </Badge>
          </>
        }
      />

      <PeriodNotice adjustment={adjustment} />
      <DataNotices caveats={data.caveats} />
      <VatNotice uniform={vat.uniform} changedOn={vat.changedOn} basisPoints={vat.basisPoints} />
      <MappingNotice boxes={boxes} />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Expense breakdown</CardTitle>
            <CardDescription>
              Shares are of revenue excluding VAT — {pnl.revenueExVat === null ? 'unavailable for this period' : formatMoney(pnl.revenueExVat)}. VAT
              is not the business&rsquo;s money, so measuring a cost against a VAT-inclusive figure
              would understate it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-left">
                  <th scope="col" className="py-2 pr-4 text-xs font-medium text-foreground-muted">
                    Expense
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium text-foreground-muted">
                    Amount
                  </th>
                  <th scope="col" className="py-2 pl-4 text-right text-xs font-medium text-foreground-muted">
                    % of revenue
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4">
                      <p className="text-foreground">{line.label}</p>
                      <p className="text-[11px] text-foreground-subtle">
                        {line.monthly === null ? line.basis : `${formatMoney(line.monthly)} ${line.basis}`}
                      </p>
                    </td>
                    <td className="numeric py-2.5 pl-4 text-right text-foreground">
                      {line.amount === null ? (
                        <span className="text-foreground-subtle">—</span>
                      ) : (
                        formatMoney(line.amount)
                      )}
                    </td>
                    <td className="numeric py-2.5 pl-4 text-right text-foreground-muted">
                      {line.shareOfRevenue === null ? (
                        <span className="text-foreground-subtle">—</span>
                      ) : (
                        formatPercent(line.shareOfRevenue)
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border-strong font-medium">
                  <td className="py-2.5 pr-4 text-foreground">Total expenses</td>
                  <td className="numeric py-2.5 pl-4 text-right text-foreground">
                    {total === null ? <span className="text-foreground-subtle">—</span> : formatMoney(total)}
                  </td>
                  <td className="numeric py-2.5 pl-4 text-right text-foreground">
                    {totalShare === null ? (
                      <span className="text-foreground-subtle">—</span>
                    ) : (
                      formatPercent(totalShare)
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {total === null ? (
            <p className="mt-4 text-xs text-foreground-subtle">
              A dash means the cost is unknown for this period, not that it was zero. The total is
              withheld while any line is unknown rather than adding up to something misleading.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Not yet included</CardTitle>
            <CardDescription>
              Costs the business carries that this page does not yet measure. They are named rather
              than estimated — an invented figure would make net profit look precise when it is not.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-1.5 text-sm text-foreground-muted">
            {[
              'Payment processing fees, which are currently inside the 5% variable rate rather than measured',
              'Supplier invoices from Israeli invoicing and accounting systems',
              'Deductible input VAT on expenses, which would reduce the VAT actually paid',
              'Google Ads, once the business advertises there',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-foreground-subtle">
                  •
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
