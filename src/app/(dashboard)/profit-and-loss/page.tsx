import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DailyPlTable } from "@/components/dashboard/daily-pl-table";
import { TableFrame, Td, Th } from "@/components/ui/table";
import { getDailyFinancials, getRangeReport, getStores } from "@/lib/data";
import { type PeriodSummary, percentChange, summarize } from "@/lib/finance";
import { type Money, formatMoney, formatPercent, ratio } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison } from "@/lib/date-range";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Profit & Loss" };

interface StatementLine {
  label: string;
  amount: Money;
  kind: "revenue" | "cost" | "subtotal" | "total";
  note?: string;
}

function buildStatement(summary: PeriodSummary): StatementLine[] {
  return [
    { label: "Gross sales", amount: summary.grossSales, kind: "revenue", note: "Shopify, before discounts" },
    { label: "Discounts", amount: summary.discounts, kind: "cost" },
    { label: "Refunds", amount: summary.refunds, kind: "cost" },
    { label: "Net sales", amount: summary.netSales, kind: "subtotal" },

    { label: "Cost of goods sold", amount: summary.cogs, kind: "cost" },
    { label: "Gross profit", amount: (summary.netSales - summary.cogs) as Money, kind: "subtotal" },

    { label: "Shipping & fulfillment", amount: summary.shipping, kind: "cost" },
    { label: "Payment processing fees", amount: summary.paymentFees, kind: "cost" },
    { label: "Marketing spend", amount: summary.marketingSpend, kind: "cost", note: "Meta, Google, email & SMS" },
    { label: "Variable expenses", amount: summary.variableExpenses, kind: "cost" },
    { label: "Contribution profit", amount: summary.contributionProfit, kind: "subtotal" },

    { label: "Fixed expenses", amount: summary.fixedExpenses, kind: "cost", note: "Allocated across the period" },
    { label: "Net profit", amount: summary.netProfit, kind: "total", note: "Operating profit" },
  ];
}

export default async function ProfitAndLossPage(props: PageProps<"/profit-and-loss">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const report = await getRangeReport(view.scope, view.range, view.previous);
  const statement = buildStatement(report.summary);
  const previousStatement = buildStatement(report.previous);
  const comparison = describeComparison(view.range);

  const perStore =
    view.scope === "all"
      ? await Promise.all(
          stores.map(async (store) => ({
            store,
            summary: summarize(
              await getDailyFinancials(store.id, view.range.start, view.range.end),
            ),
          })),
        )
      : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profit & Loss"
        description={`${view.scopeLabel} · ${view.range.label}. Net sales down to operating profit, with every line as a share of net sales.`}
      />

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Statement"
            description="Each cost is shown as a positive amount and subtracted in the order listed."
          />
          <div className="mt-3">
            <TableFrame>
              <thead>
                <tr>
                  <Th>Line</Th>
                  <Th align="right">Amount</Th>
                  <Th align="right">% of net sales</Th>
                  <Th align="right">{comparison}</Th>
                </tr>
              </thead>
              <tbody>
                {statement.map((line, index) => {
                  const share = ratio(line.amount, report.summary.netSales);
                  const change = percentChange(line.amount, previousStatement[index].amount);
                  const isTotal = line.kind === "total";
                  const isSubtotal = line.kind === "subtotal";

                  return (
                    <tr
                      key={line.label}
                      className={cn(
                        isSubtotal && "bg-surface-muted",
                        isTotal && "bg-surface-sunken",
                      )}
                    >
                      <Td
                        className={cn(
                          "pr-6",
                          (isSubtotal || isTotal) && "font-semibold",
                          line.kind === "cost" && "pl-4 text-ink-secondary",
                        )}
                      >
                        {line.kind === "cost" ? "− " : ""}
                        {line.label}
                        {line.note ? (
                          <span className="ml-2 text-[11px] font-normal text-ink-muted">
                            {line.note}
                          </span>
                        ) : null}
                      </Td>
                      <Td
                        align="right"
                        numeric
                        className={cn(
                          (isSubtotal || isTotal) && "font-semibold",
                          isTotal && line.amount < 0 && "text-negative",
                        )}
                      >
                        {formatMoney(line.amount, report.summary.currency)}
                      </Td>
                      <Td align="right" numeric className="text-ink-secondary">
                        {formatPercent(share)}
                      </Td>
                      <Td
                        align="right"
                        numeric
                        className={cn(
                          change === null
                            ? "text-ink-muted"
                            : (change > 0) === (line.kind !== "cost")
                              ? "text-positive"
                              : "text-negative",
                        )}
                      >
                        {change === null
                          ? "—"
                          : `${change > 0 ? "+" : "−"}${formatPercent(Math.abs(change))}`}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableFrame>
          </div>
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="Margins" description="Derived from the totals above." />
            <dl className="mt-4 space-y-3">
              <MarginRow label="Gross margin" value={formatPercent(report.summary.grossMargin)} />
              <MarginRow
                label="Contribution margin"
                value={formatPercent(report.summary.contributionMargin)}
              />
              <MarginRow label="Net margin" value={formatPercent(report.summary.netMargin)} emphasized />
            </dl>
          </Card>

          <Card>
            <CardHeader
              title="Cost structure"
              description="Share of net sales absorbed by each cost group."
            />
            <dl className="mt-4 space-y-3">
              <MarginRow
                label="COGS"
                value={formatPercent(ratio(report.summary.cogs, report.summary.netSales))}
              />
              <MarginRow
                label="Marketing"
                value={formatPercent(report.summary.marketingCostRatio)}
              />
              <MarginRow
                label="Shipping & fees"
                value={formatPercent(
                  ratio(
                    (report.summary.shipping + report.summary.paymentFees) as Money,
                    report.summary.netSales,
                  ),
                )}
              />
              <MarginRow
                label="Fixed overhead"
                value={formatPercent(ratio(report.summary.fixedExpenses, report.summary.netSales))}
              />
            </dl>
          </Card>
        </div>
      </div>

      {perStore.length > 0 ? (
        <Card>
          <CardHeader
            title="By store"
            description="The same period, split by store. Shared overhead is allocated in proportion to each store's net sales."
          />
          <div className="mt-3">
            <TableFrame>
              <thead>
                <tr>
                  <Th>Store</Th>
                  <Th align="right">Net sales</Th>
                  <Th align="right">COGS</Th>
                  <Th align="right">Marketing</Th>
                  <Th align="right">Contribution</Th>
                  <Th align="right">Fixed</Th>
                  <Th align="right">Net profit</Th>
                  <Th align="right">Margin</Th>
                </tr>
              </thead>
              <tbody>
                {perStore.map(({ store, summary }) => (
                  <tr key={store.id} className="transition-colors hover:bg-surface-muted">
                    <Td className="pr-6 font-medium">{store.name}</Td>
                    <Td align="right" numeric>
                      {formatMoney(summary.netSales, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(summary.cogs, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(summary.marketingSpend, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric>
                      {formatMoney(summary.contributionProfit, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(summary.fixedExpenses, summary.currency, { whole: true })}
                    </Td>
                    <Td
                      align="right"
                      numeric
                      className={cn("font-semibold", summary.netProfit < 0 && "text-negative")}
                    >
                      {formatMoney(summary.netProfit, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric>
                      {formatPercent(summary.netMargin)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableFrame>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Daily P&L" description={`${view.scopeLabel} · ${view.range.label}`} />
        <div className="mt-3">
          <DailyPlTable days={report.days} />
        </div>
      </Card>
    </div>
  );
}

function MarginRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[12.5px] text-ink-secondary">{label}</dt>
      <dd
        className={cn(
          "tabular text-[13px] text-ink",
          emphasized ? "text-[16px] font-semibold" : "font-medium",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
