import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { NetProfitTile, StatTile } from "@/components/dashboard/kpi-cards";
import { MoneyFlow } from "@/components/dashboard/money-flow";
import { DailyPlTable } from "@/components/dashboard/daily-pl-table";
import { NetProfitTrend } from "@/components/charts/net-profit-trend";
import { RevenueVsExpenses } from "@/components/charts/revenue-vs-expenses";
import { DataSourceBanner } from "@/components/dashboard/data-source-banner";
import {
  getLiveDailyFinancials,
  getLiveRangeReport,
  getLiveTrailingDays,
  getStores,
} from "@/lib/data";
import {
  dailyNetProfit,
  dailyNetSales,
  dailyTotalCosts,
  percentChange,
  summarize,
} from "@/lib/finance";
import { formatMoney, formatNumber, formatPercent, toMinor } from "@/lib/money";
import { daysBetween, describeComparison, describeRange, today } from "@/lib/date-range";
import { resolveViewParams } from "@/lib/view-params";

/** Below this many days the charts widen to a trailing window so they stay readable. */
const MIN_CHART_DAYS = 7;
const CHART_FALLBACK_DAYS = 30;

export default async function OverviewPage(props: PageProps<"/">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const report = await getLiveRangeReport(view.scope, view.range, view.previous);
  const { summary, previous, shopify, meta, googleAds } = report;

  // Each provider labels only the figures it owns. Shopify owns revenue and
  // order counts; Meta owns ad spend; every other cost line is still mock.
  const revenueSource = shopify.state === "connected" ? "live" : "mock";
  const metaSource = meta.state === "connected" ? "live" : "mock";
  const googleSource = googleAds.state === "connected" ? "live" : "mock";
  // The Ad Spend tile covers both platforms, so it is only fully live when
  // both are; one of two makes it a blend.
  const adSpendSource =
    metaSource === "live" && googleSource === "live"
      ? "live"
      : metaSource === "live" || googleSource === "live"
        ? "blend"
        : "mock";
  const anyLive =
    revenueSource === "live" || metaSource === "live" || googleSource === "live";

  const selectedDayCount = daysBetween(view.range.start, view.range.end);
  const usesTrailingWindow = selectedDayCount < MIN_CHART_DAYS;
  const chartDays = usesTrailingWindow
    ? await getLiveTrailingDays(view.scope, view.range.end, CHART_FALLBACK_DAYS)
    : report.days;

  const tableDays = usesTrailingWindow
    ? (await getLiveDailyFinancials(view.scope, view.range.start, view.range.end)).days
    : report.days;

  const chartCaption = usesTrailingWindow
    ? `Trailing ${chartDays.length} days to ${describeRange("custom", view.range.end, view.range.end)}`
    : view.range.label;

  const isSingleDayToday = view.range.start === view.range.end && view.range.end === today();
  const comparison = describeComparison(view.range);

  const trendPoints = chartDays.map((day) => ({
    date: day.date,
    value: toMinor(dailyNetProfit(day)),
  }));

  const revenueExpensePoints = chartDays.map((day) => ({
    date: day.date,
    revenue: toMinor(dailyNetSales(day)),
    expenses: toMinor(dailyTotalCosts(day)),
  }));

  const chartSummary = summarize(chartDays);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={`${view.scopeLabel} · ${view.range.label}. Shopify is the source of truth for revenue; ad platforms and email tools are costs.`}
      />

      <DataSourceBanner shopify={shopify} meta={meta} googleAds={googleAds} />

      {/* KPI row. Net Profit is the hero figure — one per view. */}
      <div className="grid gap-3 lg:grid-cols-12">
        <NetProfitTile
          className="lg:col-span-4"
          value={formatMoney(summary.netProfit, summary.currency)}
          isLoss={summary.netProfit < 0}
          delta={percentChange(summary.netProfit, previous.netProfit)}
          deltaCaption={comparison}
          marginLabel={formatPercent(summary.netMargin)}
          contributionLabel={formatMoney(summary.contributionProfit, summary.currency)}
          note={netProfitNote(
            revenueSource === "live",
            metaSource === "live",
            googleSource === "live",
          )}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-8 xl:grid-cols-3">
          <StatTile
            label="Net Revenue"
            value={formatMoney(summary.netSales, summary.currency)}
            delta={percentChange(summary.netSales, previous.netSales)}
            deltaCaption={comparison}
            source={revenueSource}
            footnote={`Gross ${formatMoney(summary.grossSales, summary.currency, { whole: true })} less discounts and refunds`}
          />
          <StatTile
            label="Ad Spend"
            value={formatMoney(summary.adSpend, summary.currency)}
            delta={percentChange(summary.adSpend, previous.adSpend)}
            deltaCaption={comparison}
            higherIsBetter={false}
            source={adSpendSource}
            footnote={`Meta ${formatMoney(summary.metaAdSpend, summary.currency, { compact: true })} ${metaSource} · Google ${formatMoney(summary.googleAdSpend, summary.currency, { compact: true })} ${googleSource}`}
          />
          <StatTile
            label="Orders"
            value={formatNumber(summary.orders)}
            delta={
              previous.orders === 0
                ? null
                : (summary.orders - previous.orders) / Math.abs(previous.orders)
            }
            deltaCaption={comparison}
            source={revenueSource}
            footnote={`${formatNumber(summary.unitsSold)} units sold`}
          />
          <StatTile
            label="AOV"
            value={formatMoney(summary.averageOrderValue, summary.currency)}
            delta={percentChange(summary.averageOrderValue, previous.averageOrderValue)}
            deltaCaption={comparison}
            source={revenueSource}
            footnote="Net revenue ÷ orders"
          />
          <StatTile
            label="COGS"
            value={formatMoney(summary.cogs, summary.currency)}
            delta={percentChange(summary.cogs, previous.cogs)}
            deltaCaption={comparison}
            higherIsBetter={false}
            source="mock"
            footnote={`Gross margin ${formatPercent(summary.grossMargin)}`}
          />
          <StatTile
            label="Profit Margin"
            value={formatPercent(summary.netMargin)}
            delta={
              previous.netMargin === null || summary.netMargin === null
                ? null
                : summary.netMargin - previous.netMargin
            }
            deltaCaption={comparison}
            deltaUnit="points"
            source={anyLive ? "blend" : "mock"}
            footnote={`Contribution margin ${formatPercent(summary.contributionMargin)}`}
          />
        </div>
      </div>

      <MoneyFlow
        title={isSingleDayToday ? "Today's Money Flow" : "Money Flow"}
        caption={`${view.scopeLabel} · ${view.range.label}`}
        summary={summary}
        revenueSource={revenueSource}
        metaSource={metaSource}
        googleSource={googleSource}
      />

      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Net profit trend"
            description={chartCaption}
            actions={
              <span className="tabular text-[12px] text-ink-secondary">
                {formatMoney(chartSummary.netProfit, chartSummary.currency, { compact: true })} total
              </span>
            }
          />
          <div className="mt-2">
            <NetProfitTrend points={trendPoints} currency={summary.currency} />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Revenue vs expenses"
            description={chartCaption}
            actions={
              <span className="tabular text-[12px] text-ink-secondary">
                {formatPercent(chartSummary.netMargin)} margin
              </span>
            }
          />
          <div className="mt-2">
            <RevenueVsExpenses points={revenueExpensePoints} currency={summary.currency} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Daily P&L"
          description={`${view.scopeLabel} · ${view.range.label}. Every row reconciles: revenue less each cost column equals net profit.`}
        />
        <div className="mt-3">
          <DailyPlTable days={tableDays} />
        </div>
      </Card>
    </div>
  );
}

/** One line under the hero figure describing what Net Profit is made of. */
function netProfitNote(revenueLive: boolean, metaLive: boolean, googleLive: boolean): string {
  const live: string[] = [];
  if (revenueLive) live.push("Shopify revenue");
  if (metaLive) live.push("Meta spend");
  if (googleLive) live.push("Google Ads spend");

  if (live.length === 0) return "Every input is mock data.";

  const joined =
    live.length === 1
      ? live[0]
      : `${live.slice(0, -1).join(", ")} and ${live[live.length - 1]}`;

  return `Live ${joined}, less mock COGS, shipping, fees and remaining expenses — not yet a true P&L.`;
}
