import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { MappingGate } from "@/components/dashboard/mapping-gate";
import { getLiveYearReport, getStores } from "@/lib/data";
import { today } from "@/lib/date-range";
import { formatMoney, formatNumber, formatPercent } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { cn } from "@/lib/cn";
import type { MonthlyPeriod } from "@/lib/data";
import type { PeriodSummary } from "@/lib/finance";

export const metadata: Metadata = { title: "Year Summary" };

/** Reporting starts in 2026; earlier years have no data to summarise. */
const FIRST_YEAR = 2026;

function resolveYear(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  const current = Number.parseInt(today().slice(0, 4), 10);
  if (!Number.isFinite(parsed)) return current;
  return Math.min(Math.max(parsed, FIRST_YEAR), current);
}

export default async function YearPage(props: PageProps<"/year">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);
  const year = resolveYear(searchParams.year);

  const report = await getLiveYearReport(view.scope, year);
  const { summary, completeness } = report;
  const complete = completeness.complete;

  // Only months that have actually happened. A future month is an empty row
  // that makes the table look like a business that stopped trading.
  const months = report.months.filter((month) => month.start <= report.end);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${year} Summary`}
        description={`${view.scopeLabel} · ${report.start} through ${report.end}. Every figure is the same live data the rest of the dashboard reads; the year total is the sum of the months below.`}
      />

      <MappingGate costs={report.costs} completeness={completeness} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <YearTile label="Net Sales" value={formatMoney(summary.netSales, summary.currency)} />
        <YearTile label="Orders" value={formatNumber(summary.orders)} />
        <YearTile
          label="Ad Spend"
          value={formatMoney(summary.adSpend, summary.currency)}
          note={`Meta ${formatMoney(summary.metaAdSpend, summary.currency, { compact: true })} · Google ${formatMoney(summary.googleAdSpend, summary.currency, { compact: true })}`}
        />
        <YearTile
          label="Operational Cost"
          value={formatMoney(summary.cogs, summary.currency)}
          note="Pack model · $45 per ten boxes"
        />
        <YearTile
          label="Other Variable (5%)"
          value={formatMoney(summary.variableExpenses, summary.currency)}
          note="5% of Shopify net sales"
        />
        <YearTile
          label="Net Profit"
          value={complete ? formatMoney(summary.netProfit, summary.currency) : "INCOMPLETE"}
          emphasis
          withheld={!complete}
        />
        <YearTile
          label="Net Margin"
          value={complete ? formatPercent(summary.netMargin) : "—"}
          withheld={!complete}
        />
        <YearTile
          label="Contribution Profit"
          value={complete ? formatMoney(summary.contributionProfit, summary.currency) : "—"}
          withheld={!complete}
        />
      </div>

      <Card>
        <CardHeader
          title="Monthly breakdown"
          description="One row per month. These are buckets of the same daily records the year total sums, so they reconcile by construction."
        />
        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Net Sales</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Ad Spend</Th>
                <Th align="right">Operational Cost</Th>
                <Th align="right">Net Profit</Th>
                <Th align="right">Margin</Th>
              </tr>
            </thead>
            <tbody>
              {months.length === 0 ? (
                <EmptyRow colSpan={7}>No months in this year yet.</EmptyRow>
              ) : (
                months.map((month) => (
                  <MonthRow key={month.month} month={month} complete={complete} />
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line font-semibold">
                <Td className="pr-4">Total {year}</Td>
                <Td align="right" numeric>
                  {formatMoney(summary.netSales, summary.currency)}
                </Td>
                <Td align="right" numeric>
                  {formatNumber(summary.orders)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(summary.adSpend, summary.currency)}
                </Td>
                <Td align="right" numeric>
                  {formatMoney(summary.cogs, summary.currency)}
                </Td>
                <Td
                  align="right"
                  numeric
                  className={cn(!complete && "text-amber-700", complete && summary.netProfit < 0 && "text-negative")}
                >
                  {complete ? formatMoney(summary.netProfit, summary.currency) : "INCOMPLETE"}
                </Td>
                <Td align="right" numeric>
                  {complete ? formatPercent(summary.netMargin) : "—"}
                </Td>
              </tr>
            </tfoot>
          </TableFrame>
        </div>
      </Card>
    </div>
  );
}

function MonthRow({ month, complete }: { month: MonthlyPeriod; complete: boolean }) {
  const s: PeriodSummary = month.summary;
  const traded = s.orders > 0 || s.netSales !== 0;

  return (
    <tr className="transition-colors hover:bg-surface-muted">
      <Td className="pr-4 font-medium">{month.label}</Td>
      <Td align="right" numeric>
        {formatMoney(s.netSales, s.currency)}
      </Td>
      <Td align="right" numeric>
        {formatNumber(s.orders)}
      </Td>
      <Td align="right" numeric>
        {formatMoney(s.adSpend, s.currency)}
      </Td>
      <Td align="right" numeric>
        {formatMoney(s.cogs, s.currency)}
      </Td>
      <Td
        align="right"
        numeric
        className={cn(
          !complete && traded && "text-amber-700",
          complete && s.netProfit < 0 && "text-negative",
        )}
      >
        {!traded ? "—" : complete ? formatMoney(s.netProfit, s.currency) : "—"}
      </Td>
      <Td align="right" numeric className="text-ink-secondary">
        {!traded || !complete ? "—" : formatPercent(s.netMargin)}
      </Td>
    </tr>
  );
}

function YearTile({
  label,
  value,
  note,
  emphasis = false,
  withheld = false,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
  withheld?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </p>
      <p
        className={cn(
          "tabular mt-2 font-semibold tracking-[-0.01em]",
          withheld ? "text-[16px] text-amber-700" : emphasis ? "text-[28px] text-ink" : "text-[22px] text-ink",
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-[11.5px] text-ink-muted">{note}</p> : null}
    </div>
  );
}
