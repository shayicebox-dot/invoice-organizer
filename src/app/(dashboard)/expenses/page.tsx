import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/dashboard/kpi-cards";
import { Badge } from "@/components/ui/badge";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { getExpenseBreakdown, getRangeReport, getStores } from "@/lib/data";
import { percentChange } from "@/lib/finance";
import { type CurrencyCode, type Money, add, formatMoney, formatPercent, ratio } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison } from "@/lib/date-range";
import type { ExpenseCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Expenses" };

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  software: "Software",
  payroll: "Payroll",
  rent: "Rent",
  professional_services: "Professional services",
  packaging: "Packaging",
  customer_support: "Customer support",
  chargebacks: "Chargebacks",
  other: "Other",
};

export default async function ExpensesPage(props: PageProps<"/expenses">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [report, breakdown] = await Promise.all([
    getRangeReport(view.scope, view.range, view.previous),
    getExpenseBreakdown(view.scope, view.range.start, view.range.end),
  ]);

  const { summary, previous } = report;
  const comparison = describeComparison(view.range);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description={`${view.scopeLabel} · ${view.range.label}. Variable expenses are dated as they occur; fixed expenses are recorded monthly and allocated across the period.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Variable Expenses"
          value={formatMoney(summary.variableExpenses, summary.currency)}
          delta={percentChange(summary.variableExpenses, previous.variableExpenses)}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote={`${formatPercent(ratio(summary.variableExpenses, summary.netSales))} of net sales`}
        />
        <StatTile
          label="Fixed Expenses"
          value={formatMoney(summary.fixedExpenses, summary.currency)}
          delta={percentChange(summary.fixedExpenses, previous.fixedExpenses)}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote={`${formatPercent(ratio(summary.fixedExpenses, summary.netSales))} of net sales`}
        />
        <StatTile
          label="Shipping & Fees"
          value={formatMoney(add(summary.shipping, summary.paymentFees), summary.currency)}
          delta={percentChange(
            add(summary.shipping, summary.paymentFees),
            add(previous.shipping, previous.paymentFees),
          )}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote="Fulfillment and payment processing"
        />
        <StatTile
          label="Total Costs"
          value={formatMoney(summary.totalCosts, summary.currency)}
          delta={percentChange(summary.totalCosts, previous.totalCosts)}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote="Every cost line in the P&L"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Variable expenses"
            description="Recorded on the day they occur and scoped to a store."
          />
          <div className="mt-3">
            <ExpenseTable rows={breakdown.variable} currency={summary.currency} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Fixed expenses"
            description="Monthly overheads, shown at the share allocated to this period."
          />
          <div className="mt-3">
            <ExpenseTable rows={breakdown.fixed} currency={summary.currency} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="How allocation works"
          description="So the same overhead is never counted twice across stores."
        />
        <ul className="mt-3 space-y-2 text-[12.5px] leading-5 text-ink-secondary">
          <li>
            A monthly fixed expense is divided evenly across the days of its month. Leftover
            minor units are handed out one at a time, so the daily shares add back to the exact
            monthly amount.
          </li>
          <li>
            Expenses with no store attached are shared overhead. Each day they are split across
            stores in proportion to that day&apos;s net sales, so a store that sold nothing does
            not absorb the warehouse lease.
          </li>
          <li>
            Expenses attached to a single store are charged to that store in full.
          </li>
        </ul>
      </Card>
    </div>
  );
}

function ExpenseTable({
  rows,
  currency,
}: {
  rows: Array<{
    name: string;
    category: ExpenseCategory;
    storeName: string;
    amount: Money;
    share: number | null;
  }>;
  currency: CurrencyCode;
}) {
  return (
    <TableFrame>
      <thead>
        <tr>
          <Th>Expense</Th>
          <Th>Category</Th>
          <Th>Scope</Th>
          <Th align="right">Amount</Th>
          <Th align="right">% of costs</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyRow colSpan={5}>No expenses recorded in this period.</EmptyRow>
        ) : (
          rows.map((row) => (
            <tr key={`${row.name}-${row.storeName}`} className="transition-colors hover:bg-surface-muted">
              <Td className="pr-4 font-medium">{row.name}</Td>
              <Td className="pr-4">
                <Badge>{CATEGORY_LABELS[row.category]}</Badge>
              </Td>
              <Td className="pr-4 text-ink-secondary">{row.storeName}</Td>
              <Td align="right" numeric>
                {formatMoney(row.amount, currency)}
              </Td>
              <Td align="right" numeric className="text-ink-secondary">
                {formatPercent(row.share)}
              </Td>
            </tr>
          ))
        )}
      </tbody>
    </TableFrame>
  );
}
