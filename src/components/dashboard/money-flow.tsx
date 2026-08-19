import { Card, CardHeader } from "@/components/ui/card";
import { type DataSource, SourceTag } from "@/components/ui/source-tag";
import type { PeriodSummary } from "@/lib/finance";
import { type Money, formatMoney, formatPercent } from "@/lib/money";
import { cn } from "@/lib/cn";

interface FlowLine {
  label: string;
  amount: Money;
  /** Inflows render with a leading +, outflows with a leading −. */
  direction: "in" | "out";
  note?: string;
  /** Omit to leave the line unlabelled. */
  source?: DataSource;
}

/**
 * Every line of money that moved, in and out, adding up to Net Profit.
 * Nothing here is a stored total — each figure comes from the same summary the
 * KPI cards and the table read.
 */
export function MoneyFlow({
  title,
  caption,
  summary,
  revenueSource = "mock",
  metaSource = "mock",
  googleSource = "mock",
  costSources,
}: {
  title: string;
  caption: string;
  summary: PeriodSummary;
  /** Where the revenue lines came from. */
  revenueSource?: DataSource;
  /** Where the Meta Ads line came from. */
  metaSource?: DataSource;
  /** Where the Google Ads line came from. */
  googleSource?: DataSource;
  /** Provenance of each configurable business cost line. */
  costSources?: {
    cogs: DataSource;
    shipping: DataSource;
    paymentFees: DataSource;
    klaviyo: DataSource;
    otherExpenses: DataSource;
  };
}) {
  const inflows: FlowLine[] = [
    {
      label: "Shopify sales",
      amount: summary.grossSales,
      direction: "in",
      note: "Gross, before discounts",
      source: revenueSource,
    },
    { label: "Discounts", amount: summary.discounts, direction: "out", source: revenueSource },
    { label: "Refunds", amount: summary.refunds, direction: "out", source: revenueSource },
  ];

  const outflows: FlowLine[] = [
    { label: "Meta Ads", amount: summary.metaAdSpend, direction: "out", source: metaSource },
    { label: "Google Ads", amount: summary.googleAdSpend, direction: "out", source: googleSource },
    {
      label: "Klaviyo",
      amount: summary.emailSpend,
      direction: "out",
      note: "Email & SMS platform",
      source: costSources?.klaviyo ?? "mock",
    },
    { label: "COGS", amount: summary.cogs, direction: "out", source: costSources?.cogs ?? "mock" },
    {
      label: "Shipping & fulfillment",
      amount: summary.shipping,
      direction: "out",
      source: costSources?.shipping ?? "mock",
    },
    {
      label: "Payment fees",
      amount: summary.paymentFees,
      direction: "out",
      source: costSources?.paymentFees ?? "mock",
    },
    {
      label: "Other expenses",
      amount: summary.variableExpenses,
      direction: "out",
      source: costSources?.otherExpenses ?? "mock",
    },
    {
      label: "Fixed expenses",
      amount: summary.fixedExpenses,
      direction: "out",
      note: "Allocated to this period",
      source: costSources?.otherExpenses ?? "mock",
    },
  ];

  const isLoss = summary.netProfit < 0;

  return (
    <Card>
      <CardHeader title={title} description={caption} />

      <div className="mt-4 grid gap-x-10 gap-y-5 lg:grid-cols-2">
        <div className="flex flex-col">
          <SectionLabel>Money in</SectionLabel>
          {inflows.map((line) => (
            <Line key={line.label} line={line} currency={summary.currency} />
          ))}
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-[12.5px] font-medium text-ink">Total revenue</span>
            <span className="tabular text-[13px] font-semibold text-ink">
              {formatMoney(summary.netSales, summary.currency)}
            </span>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-muted px-4 py-3 lg:mt-auto">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted">
                Net profit
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[26px] font-semibold tracking-[-0.015em]",
                  isLoss ? "text-negative" : "text-ink",
                )}
              >
                {formatMoney(summary.netProfit, summary.currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted">
                Net margin
              </p>
              <p className="tabular mt-0.5 text-[26px] font-semibold tracking-[-0.015em] text-ink">
                {formatPercent(summary.netMargin)}
              </p>
            </div>
          </div>
        </div>

        <div>
          <SectionLabel>Money out</SectionLabel>
          {outflows.map((line) => (
            <Line key={line.label} line={line} currency={summary.currency} />
          ))}
          <div className="mt-1 flex items-baseline justify-between border-t border-line pt-2">
            <span className="text-[12.5px] font-medium text-ink">Total costs</span>
            <span className="tabular text-[13px] font-semibold text-ink">
              {formatMoney(summary.totalCosts, summary.currency)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted">
      {children}
    </p>
  );
}

function Line({ line, currency }: { line: FlowLine; currency: PeriodSummary["currency"] }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-[7px] last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[12.5px] text-ink">
          {line.label}
          {line.note ? (
            <span className="ml-1.5 text-[11px] text-ink-muted">{line.note}</span>
          ) : null}
        </span>
        {line.source ? <SourceTag source={line.source} className="shrink-0" /> : null}
      </div>
      <span
        className={cn(
          "tabular shrink-0 text-[12.5px]",
          line.direction === "in" ? "text-positive" : "text-ink-secondary",
        )}
      >
        {line.direction === "in" ? "+" : "−"}
        {formatMoney(line.amount, currency)}
      </span>
    </div>
  );
}
