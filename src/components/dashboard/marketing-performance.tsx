import type { DashboardMetrics } from '@/core/metrics/types';
import type { DataSource } from '@/data/dashboard-source';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MetricRow } from '@/components/dashboard/metric-row';
import { SourceBadge } from '@/components/dashboard/source-badge';

type MarketingPerformanceProps = {
  readonly metrics: DashboardMetrics;
  readonly sources: readonly DataSource[];
};

/** Section 2 — what was spent to acquire the period's revenue, and how efficiently. */
export function MarketingPerformance({ metrics, sources }: MarketingPerformanceProps) {
  const adPlatforms = sources.filter(
    (source) => source.id === 'meta-ads' || source.id === 'google-ads',
  );

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Marketing performance</CardTitle>
          <CardDescription>Ad spend by platform, with return and cost per order.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <MetricRow metric={metrics.metaSpend} sign="−" />
          <MetricRow metric={metrics.googleSpend} sign="−" />
          <MetricRow metric={metrics.marketingSpend} subtotal label="Total marketing spend" />
          <MetricRow metric={metrics.roas} />
          <MetricRow metric={metrics.cpa} />
        </div>

        <ul className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-3">
          {adPlatforms.map((source) => (
            <li key={source.id} className="flex items-center justify-between gap-3">
              <span className="text-xs text-foreground-muted">{source.label}</span>
              <SourceBadge source={source} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
