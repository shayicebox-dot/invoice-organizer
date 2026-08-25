import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { StatCard } from '@/components/dashboard/stat-card';
import { ProfitWaterfall } from '@/components/dashboard/profit-waterfall';
import { MappingNotice, VatNotice } from '@/components/profitability/mapping-notice';
import { profitWaterfall } from '@/core/metrics/profitability';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { RevenueOverview } from '@/components/dashboard/revenue-overview';
import { MarketingPerformance } from '@/components/dashboard/marketing-performance';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { DailyPerformanceChart } from '@/components/dashboard/daily-performance-chart';
import { DataSourcePanel } from '@/components/dashboard/data-source-panel';
import { computeDashboardMetrics } from '@/core/metrics/dashboard';
import type { MetricId } from '@/core/metrics/types';
import { connectedSourceCount, getDashboardData } from '@/data/dashboard-source';
import { DataNotices } from '@/components/sales/data-notices';
import { MarketingNotices } from '@/components/marketing/marketing-notices';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import {
  formatCount,
  formatDateRange,
  formatMoney,
  formatMultiple,
  formatPercent,
} from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Dashboard' };

/** Every load reads live from Shopify and Meta, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

/**
 * The Shopify sales figures, kept exactly as Shopify reports them.
 *
 * These are VAT inclusive, because that is what the store took. The
 * profitability row below restates them excluding VAT rather than replacing
 * them — an accountant needs both, and the two must be visibly reconcilable.
 */
const SALES_KPIS: readonly MetricId[] = ['revenue', 'orders', 'aov'];

type DashboardPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);

  const data = await getDashboardData(range);
  const metrics = computeDashboardMetrics(data.inputs);
  const connected = connectedSourceCount(data.sources);
  const { pnl, boxes, vat } = data.profitability;
  const waterfall = profitWaterfall(pnl);
  const m = (amount: Parameters<typeof formatMoney>[0] | null) =>
    amount === null ? null : formatMoney(amount);
  const salesConnected =
    data.sources.find((source) => source.id === 'shopify')?.connected ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`Financial overview for ${formatDateRange(data.range)}.`}
        actions={
          <>
            <DateRangePicker range={range} preset={preset} today={today} basePath="/dashboard" />
            <Badge tone={connected > 0 ? 'positive' : 'neutral'}>
              {connected === 0
                ? 'No data sources'
                : `${connected} ${connected === 1 ? 'source' : 'sources'} live`}
            </Badge>
          </>
        }
      />

      <PeriodNotice adjustment={adjustment} />
      <DataNotices caveats={data.caveats} />
      <MarketingNotices caveats={data.caveats.marketing} singleDay={range.start === range.end} />
      <VatNotice uniform={vat.uniform} changedOn={vat.changedOn} basisPoints={vat.basisPoints} />
      <MappingNotice boxes={boxes} />

      <section aria-label="Sales">
        <h2 className="pb-2 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
          Sales, as Shopify reports them
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {SALES_KPIS.map((id) => (
            <KpiCard key={id} metric={metrics[id]} emphasis={id === 'revenue'} />
          ))}
          <StatCard
            label="VAT"
            value={m(pnl.vat)}
            formula={`Included at ${vat.basisPoints / 100}%`}
            tone="cost"
          />
          <StatCard
            label="Revenue ex VAT"
            value={m(pnl.revenueExVat)}
            formula={`Revenue incl VAT ÷ ${(10_000 + vat.basisPoints) / 10_000}`}
            emphasis
          />
          <StatCard
            label="Physical boxes sold"
            value={pnl.physicalBoxes === null ? null : formatCount(pnl.physicalBoxes)}
            formula="Boxes per pack × packs sold, per line"
          />
        </div>
      </section>

      <section aria-label="Costs and profit">
        <h2 className="pb-2 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
          Costs and profit, excluding VAT
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Product cost"
            value={m(pnl.productCogsExVat)}
            formula="Boxes × ₪12 incl VAT, ex VAT"
            tone="cost"
          />
          <StatCard
            label="Shipping"
            value={m(pnl.shippingExVat)}
            formula="Boxes × ₪4 incl VAT, ex VAT"
            tone="cost"
          />
          <StatCard
            label="Variable costs"
            value={m(pnl.variableOperating)}
            formula="5% of revenue ex VAT"
            tone="cost"
          />
          <StatCard
            label="Contribution profit"
            value={m(pnl.contributionProfit)}
            formula="Revenue ex VAT − product − shipping − variable"
          />
          <StatCard
            label="Meta spend"
            value={m(pnl.adSpend)}
            formula="Meta ad spend for this period"
            tone="cost"
          />
          <StatCard
            label="Fixed expenses"
            value={formatMoney(pnl.fixedExpensesTotal)}
            formula="Monthly costs, allocated by day"
            tone="cost"
          />
          <StatCard
            label="ROAS"
            value={pnl.returnOnAdSpend === null ? null : formatMultiple(pnl.returnOnAdSpend)}
            formula="Revenue ex VAT ÷ Meta spend"
          />
          <StatCard
            label="CPA"
            value={m(pnl.costPerOrder)}
            formula="Meta spend ÷ Shopify orders"
          />
          <StatCard
            label="Net profit"
            value={m(pnl.netProfit)}
            formula="Contribution − advertising − fixed"
            emphasis
            tone={pnl.netProfit === null ? 'neutral' : pnl.netProfit.minorUnits < 0 ? 'negative' : 'positive'}
          />
          <StatCard
            label="Net margin"
            value={pnl.netMargin === null ? null : formatPercent(pnl.netMargin)}
            formula="Net profit ÷ revenue ex VAT"
            tone={pnl.netMargin === null ? 'neutral' : pnl.netMargin < 0 ? 'negative' : 'positive'}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profitability</CardTitle>
            <CardDescription>
              From what customers paid to what the business kept, for{' '}
              {formatDateRange(data.range)}. Every line states the formula behind it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ProfitWaterfall steps={waterfall} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueOverview metrics={metrics} salesConnected={salesConnected} />
        <MarketingPerformance
          metrics={metrics}
          sources={data.sources}
          activePlatforms={data.inputs.activeAdPlatforms}
        />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Daily performance</CardTitle>
            <CardDescription>
              Net revenue per day across {formatDateRange(data.range)}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DailyPerformanceChart
            series={data.daily}
            range={data.range}
            currency={data.inputs.currency}
          />
        </CardContent>
      </Card>

      <DataSourcePanel sources={data.sources} />

      <RecentOrders orders={data.recentOrders} currency={data.inputs.currency} />
    </div>
  );
}
