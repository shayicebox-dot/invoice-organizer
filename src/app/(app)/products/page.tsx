import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { DataNotices } from '@/components/sales/data-notices';
import { getProductsPageData } from '@/data/sales-source';
import { parsePeriodPreset, resolvePeriod } from '@/core/period';
import { todayInBusinessTimeZone } from '@/lib/utils/today';
import { formatCount, formatDateRange, formatMoney } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Products' };

/** Every load reads live from Shopify, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type ProductsPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const COLUMNS = ['Product', 'SKU', 'Quantity sold', 'Revenue'] as const;

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const params = await searchParams;
  const periodParam = params['period'];
  const preset = parsePeriodPreset(typeof periodParam === 'string' ? periodParam : undefined);
  const range = resolvePeriod(preset, todayInBusinessTimeZone());

  const data = await getProductsPageData(range);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description={`What sold between ${formatDateRange(data.caveats.coverage.range)}.`}
        actions={
          <>
            <PeriodSelector active={preset} basePath="/products" />
            <Badge tone={data.products.length > 0 ? 'positive' : 'neutral'}>
              {formatCount(data.products.length)} products
            </Badge>
          </>
        }
      />

      <DataNotices caveats={data.caveats} />

      {data.lineItemsTruncated ? (
        <p className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs leading-relaxed text-foreground-muted">
          At least one order has more than 100 line items; products on the remaining lines are not
          counted here.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Sold in this period</CardTitle>
            <CardDescription>
              Built from the line items of {formatCount(data.orderCount)} orders. Revenue is after
              discounts and <span className="text-foreground-muted">before</span> refunds — Shopify
              does not report refunds per line item, so a refunded order still shows its products
              here.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border-subtle">
                  {COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className={`px-2 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-foreground-subtle first:pl-0 last:pr-0 ${
                        column === 'Product' || column === 'SKU' ? 'text-left' : 'text-right'
                      }`}
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.products.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="px-2 py-12 text-center">
                      <span className="block text-sm text-foreground-muted">
                        No products sold in this period
                      </span>
                      <span className="mt-1 block text-xs text-foreground-subtle">
                        Shopify reported no order line items between these dates.
                      </span>
                    </td>
                  </tr>
                ) : (
                  data.products.map((product) => (
                    <tr key={product.key} className="border-b border-border-subtle last:border-b-0">
                      <td className="px-2 py-2.5 font-medium text-foreground first:pl-0">
                        {product.productTitle}
                      </td>
                      <td className="numeric px-2 py-2.5 text-foreground-muted">
                        {product.sku ?? <span className="text-foreground-subtle">No SKU</span>}
                      </td>
                      <td className="numeric px-2 py-2.5 text-right text-foreground-muted">
                        {formatCount(product.quantitySold)}
                      </td>
                      <td className="numeric px-2 py-2.5 text-right text-foreground last:pr-0">
                        {formatMoney(product.revenue)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
