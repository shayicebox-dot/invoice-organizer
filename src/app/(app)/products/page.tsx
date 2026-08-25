import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { DataNotices } from '@/components/sales/data-notices';
import { getProductsPageData } from '@/data/sales-source';
import { MappingNotice } from '@/components/profitability/mapping-notice';
import type { BoxCountSource } from '@/core/metrics/boxes';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { formatCount, formatDateRange, formatMoney, formatPercent } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Products' };

/** Every load reads live from Shopify, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type ProductsPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);

  const data = await getProductsPageData(range);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description={`What sold between ${formatDateRange(data.caveats.coverage.range)}.`}
        actions={
          <>
            <DateRangePicker range={range} preset={preset} today={today} basePath="/products" />
            <Badge tone={data.profitability.length > 0 ? 'positive' : 'neutral'}>
              {formatCount(data.profitability.length)}{' '}
              {data.profitability.length === 1 ? 'pack' : 'packs'}
            </Badge>
          </>
        }
      />

      <PeriodNotice adjustment={adjustment} />
      <DataNotices caveats={data.caveats} />
      <MappingNotice boxes={data.boxes} />

      {data.lineItemsTruncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
          At least one order has more than 100 line items; products on the remaining lines are not
          counted here.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profitability by pack</CardTitle>
            <CardDescription>
              Grouped by variant, because a 10 pack and a 50 pack are different numbers of physical
              boxes and so have different cost structures. Revenue is after discounts and{' '}
              <span className="text-foreground-muted">before</span> refunds — Shopify reports
              refunds per order, not per line. Contribution stops before advertising and fixed
              costs: nothing in the data says which product an ad sold or which product the
              warehouse held.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.profitability.length === 0 ? (
            <p className="py-8 text-center text-sm text-foreground-muted">
              No products sold in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left">
                    <th scope="col" className="py-2 pr-4 text-xs font-medium text-foreground-muted">
                      Pack
                    </th>
                    {[
                      'Units',
                      'Boxes',
                      'Revenue incl VAT',
                      'Revenue ex VAT',
                      'Product COGS',
                      'Shipping',
                      'Contribution',
                      'Margin',
                    ].map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="py-2 pl-4 text-right text-xs font-medium text-foreground-muted"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.profitability.map((product) => (
                    <tr key={product.key} className="border-b border-border-subtle last:border-b-0">
                      <td className="max-w-[18rem] py-2.5 pr-4">
                        <span dir="auto" className="block truncate [unicode-bidi:isolate] text-foreground">
                          {product.productTitle}
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-subtle">
                          {product.variantTitle === null ? null : <span dir="auto">{product.variantTitle}</span>}
                          {product.sku === null ? null : <span className="numeric">{product.sku}</span>}
                          <BoxSourceTag source={product.boxSource} boxesPerUnit={
                            product.boxesSold === null || product.unitsSold === 0
                              ? null
                              : product.boxesSold / product.unitsSold
                          } />
                        </span>
                      </td>
                      <Cell>{formatCount(product.unitsSold)}</Cell>
                      <Cell>{product.boxesSold === null ? null : formatCount(product.boxesSold)}</Cell>
                      <Cell>{formatMoney(product.revenueInclVat)}</Cell>
                      <Cell>{formatMoney(product.revenueExVat)}</Cell>
                      <Cell>{product.productCogsExVat === null ? null : formatMoney(product.productCogsExVat)}</Cell>
                      <Cell>{product.shippingExVat === null ? null : formatMoney(product.shippingExVat)}</Cell>
                      <Cell>{product.contributionProfit === null ? null : formatMoney(product.contributionProfit)}</Cell>
                      <Cell>
                        {product.contributionMargin === null ? null : formatPercent(product.contributionMargin)}
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({ children }: { readonly children: React.ReactNode }) {
  return (
    <td className="numeric py-2.5 pl-4 text-right text-foreground">
      {children === null ? <span className="text-foreground-subtle">—</span> : children}
    </td>
  );
}

/** How this pack's box count was arrived at — a guess is labelled as one. */
function BoxSourceTag({
  source,
  boxesPerUnit,
}: {
  readonly source: BoxCountSource;
  readonly boxesPerUnit: number | null;
}) {
  if (source === 'unmapped') {
    return (
      <span className="rounded bg-negative/10 px-1.5 py-0.5 text-[10px] text-negative">
        Needs setting in Settings
      </span>
    );
  }

  return (
    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-foreground-subtle">
      {boxesPerUnit === null ? 'mapped' : `${boxesPerUnit} boxes/unit`}
    </span>
  );
}
