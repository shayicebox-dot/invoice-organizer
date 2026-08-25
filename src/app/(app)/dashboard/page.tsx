import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { RevenueOverview } from '@/components/dashboard/revenue-overview';
import { MarketingPerformance } from '@/components/dashboard/marketing-performance';
import { ProfitBreakdown } from '@/components/dashboard/profit-breakdown';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { DailyPerformanceChart } from '@/components/dashboard/daily-performance-chart';
import { DataSourcePanel } from '@/components/dashboard/data-source-panel';
import { computeDashboardMetrics } from '@/core/metrics/dashboard';
import type { MetricId } from '@/core/metrics/types';
import { connectedSourceCount, getDashboardData } from '@/data/dashboard-source';
import { DataNotices } from '@/components/sales/data-notices';
import { MarketingNotices } from '@/components/marketing/marketing-notices';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { formatDateRange } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Dashboard' };

/** Every load reads live from Shopify and Meta, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

/** The KPI row, in reading order. */
const KPI_ORDER: readonly MetricId[] = [
  'revenue',
  'orders',
  'aov',
  'marketingSpend',
  'roas',
  'cpa',
  'cogs',
  'grossProfit',
  'netProfit',
  'netMargin',
];

const LEAD_KPIS: ReadonlySet<MetricId> = new Set<MetricId>(['revenue', 'netProfit']);

type DashboardPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);

  const data = await getDashboardData(range);
  const metrics = computeDashboardMetrics(data.inputs);
  const connected = connectedSourceCount(data.sources);
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

      <section aria-label="Key figures">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {KPI_ORDER.map((id) => (
            <KpiCard key={id} metric={metrics[id]} emphasis={LEAD_KPIS.has(id)} />
          ))}
        </div>
      </section>

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

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ProfitBreakdown metrics={metrics} anySourceConnected={connected > 0} />
        <DataSourcePanel sources={data.sources} />
      </div>

      <RecentOrders orders={data.recentOrders} currency={data.inputs.currency} />
    </div>
  );
}
