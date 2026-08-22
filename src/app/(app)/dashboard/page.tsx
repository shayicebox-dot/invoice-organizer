import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { RevenueOverview } from '@/components/dashboard/revenue-overview';
import { MarketingPerformance } from '@/components/dashboard/marketing-performance';
import { ProfitBreakdown } from '@/components/dashboard/profit-breakdown';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { DailyPerformanceChart } from '@/components/dashboard/daily-performance-chart';
import { DataSourcePanel } from '@/components/dashboard/data-source-panel';
import { computeDashboardMetrics } from '@/core/metrics/dashboard';
import type { MetricId } from '@/core/metrics/types';
import { parsePeriodPreset, resolvePeriod } from '@/core/period';
import { connectedSourceCount, getDashboardData } from '@/data/dashboard-source';
import { todayInBusinessTimeZone } from '@/lib/utils/today';
import { formatDateRange } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Dashboard' };

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
  const params = await searchParams;
  const periodParam = params['period'];
  const preset = parsePeriodPreset(typeof periodParam === 'string' ? periodParam : undefined);
  const range = resolvePeriod(preset, todayInBusinessTimeZone());

  const data = await getDashboardData(range);
  const metrics = computeDashboardMetrics(data.inputs);
  const connected = connectedSourceCount(data.sources);
  const salesConnected =
    data.sources.find((source) => source.id === 'shopify')?.connected ?? false;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description={`Financial overview for ${formatDateRange(range)}.`}
        actions={
          <>
            <PeriodSelector active={preset} />
            <Badge tone={connected > 0 ? 'positive' : 'neutral'}>
              {connected > 0 ? `${connected} sources live` : 'No data sources'}
            </Badge>
          </>
        }
      />

      <section aria-label="Key figures">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {KPI_ORDER.map((id) => (
            <KpiCard key={id} metric={metrics[id]} emphasis={LEAD_KPIS.has(id)} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueOverview metrics={metrics} salesConnected={salesConnected} />
        <MarketingPerformance metrics={metrics} sources={data.sources} />
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Daily performance</CardTitle>
            <CardDescription>
              Revenue per day across {formatDateRange(range)}.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <DailyPerformanceChart
            series={data.daily}
            range={range}
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
