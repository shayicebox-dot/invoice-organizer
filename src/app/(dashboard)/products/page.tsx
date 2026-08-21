import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/dashboard/kpi-cards";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { getProductPerformance, getRangeReport, getStores } from "@/lib/data";
import { percentChange } from "@/lib/finance";
import { type Money, formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison } from "@/lib/date-range";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage(props: PageProps<"/products">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [report, products] = await Promise.all([
    getRangeReport(view.scope, view.range, view.previous),
    getProductPerformance(view.scope, view.range.start, view.range.end),
  ]);

  const { summary, previous } = report;
  const comparison = describeComparison(view.range);
  const withSales = products.filter((entry) => entry.unitsSold > 0);
  const topProduct = withSales[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        description={`${view.scopeLabel} · ${view.range.label}. Product revenue is measured at list price; discounts and refunds are settled at the P&L level.`}
      />

      <p className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12.5px] leading-5 text-ink-secondary">
        <strong className="font-semibold text-ink">Sample catalog.</strong> This page still reads a
        generated product list, not your Shopify catalog — the titles and SKUs below are not real.
        Orders, Profit &amp; Loss, Overview and the Year Summary are all live. Nothing on this page
        feeds the P&amp;L: operational cost comes from the pack model applied to real Shopify line
        items.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Units Sold"
          value={formatNumber(summary.unitsSold)}
          delta={
            previous.unitsSold === 0
              ? null
              : (summary.unitsSold - previous.unitsSold) / Math.abs(previous.unitsSold)
          }
          deltaCaption={comparison}
        />
        <StatTile
          label="COGS"
          value={formatMoney(summary.cogs, summary.currency)}
          delta={percentChange(summary.cogs, previous.cogs)}
          deltaCaption={comparison}
          higherIsBetter={false}
        />
        <StatTile
          label="Gross Margin"
          value={formatPercent(summary.grossMargin)}
          delta={
            previous.grossMargin === null || summary.grossMargin === null
              ? null
              : summary.grossMargin - previous.grossMargin
          }
          deltaCaption={comparison}
          deltaUnit="points"
        />
        <StatTile
          label="Active SKUs"
          value={formatNumber(withSales.length)}
          delta={null}
          footnote={topProduct ? `Top seller: ${topProduct.product.title}` : undefined}
        />
      </div>

      <Card>
        <CardHeader
          title="Product performance"
          description="Ranked by revenue in the selected period. Unit cost is the current cost record."
        />
        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>SKU</Th>
                <Th>Store</Th>
                <Th align="right">Units</Th>
                <Th align="right">Price</Th>
                <Th align="right">Unit cost</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">COGS</Th>
                <Th align="right">Gross profit</Th>
                <Th align="right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <EmptyRow colSpan={10}>No products for this store.</EmptyRow>
              ) : (
                products.map((entry) => (
                  <tr key={entry.product.id} className="transition-colors hover:bg-surface-muted">
                    <Td className="max-w-[280px] pr-6 font-medium">
                      <span className="block truncate">{entry.product.title}</span>
                      <span className="block text-[11px] font-normal text-ink-muted">
                        {entry.product.category}
                      </span>
                    </Td>
                    <Td className="pr-4 tabular text-ink-secondary">{entry.product.sku}</Td>
                    <Td className="pr-4 text-ink-secondary">{entry.storeName}</Td>
                    <Td align="right" numeric>
                      {formatNumber(entry.unitsSold)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(entry.product.price, entry.product.currency)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(entry.unitCost, entry.product.currency)}
                    </Td>
                    <Td align="right" numeric>
                      {formatMoney(entry.revenue, entry.product.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(entry.cogs, entry.product.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="font-semibold">
                      {formatMoney(entry.grossProfit, entry.product.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric>
                      {formatPercent(entry.grossMargin)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {withSales.length > 0 ? (
              <tfoot>
                <tr className="bg-surface-muted">
                  <Td className="pr-6 font-semibold">Total</Td>
                  <Td />
                  <Td />
                  <Td align="right" numeric className="font-semibold">
                    {formatNumber(withSales.reduce((acc, entry) => acc + entry.unitsSold, 0))}
                  </Td>
                  <Td />
                  <Td />
                  <Td align="right" numeric className="font-semibold">
                    {formatMoney(
                      withSales.reduce((acc, entry) => acc + entry.revenue, 0) as Money,
                      summary.currency,
                      { whole: true },
                    )}
                  </Td>
                  <Td align="right" numeric>
                    {formatMoney(
                      withSales.reduce((acc, entry) => acc + entry.cogs, 0) as Money,
                      summary.currency,
                      { whole: true },
                    )}
                  </Td>
                  <Td align="right" numeric className="font-semibold">
                    {formatMoney(
                      withSales.reduce((acc, entry) => acc + entry.grossProfit, 0) as Money,
                      summary.currency,
                      { whole: true },
                    )}
                  </Td>
                  <Td />
                </tr>
              </tfoot>
            ) : null}
          </TableFrame>
        </div>
      </Card>
    </div>
  );
}
