import type { AdPlatformId } from '@/core/metrics/marketing';
import type { DashboardMetrics, MetricId } from '@/core/metrics/types';
import type { DataSource, DataSourceId } from '@/data/dashboard-source';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MetricRow } from '@/components/dashboard/metric-row';
import { SourceBadge } from '@/components/dashboard/source-badge';

type MarketingPerformanceProps = {
  readonly metrics: DashboardMetrics;
  readonly sources: readonly DataSource[];
  /** Platforms the business advertises on, from business configuration. */
  readonly activePlatforms: readonly AdPlatformId[];
};

/** How each ad platform appears here: its spend metric and its data source. */
const PLATFORMS: Readonly<Record<AdPlatformId, { metric: MetricId; source: DataSourceId }>> = {
  meta: { metric: 'metaSpend', source: 'meta-ads' },
  google: { metric: 'googleSpend', source: 'google-ads' },
};

/**
 * Section 2 — what was spent to acquire the period's revenue, and how
 * efficiently.
 *
 * Only platforms the business actually advertises on are listed. A row reading
 * "Google Ads — Not connected" directly above a computed total would contradict
 * it: the total is complete precisely because Google Ads is not a platform
 * ICEBOX spends on. When it becomes one, adding it to `BUSINESS_CONFIG` brings
 * back both the row and the "waiting on Google Ads spend" state of the total.
 */
export function MarketingPerformance({
  metrics,
  sources,
  activePlatforms,
}: MarketingPerformanceProps) {
  const platformSourceIds = new Set(activePlatforms.map((id) => PLATFORMS[id].source));
  const adPlatforms = sources.filter((source) => platformSourceIds.has(source.id));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Marketing performance</CardTitle>
          <CardDescription>
            Ad spend by platform, with return and cost per order measured against Shopify revenue.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          {activePlatforms.map((platform) => (
            <MetricRow key={platform} metric={metrics[PLATFORMS[platform].metric]} sign="−" />
          ))}
          <MetricRow metric={metrics.marketingSpend} subtotal label="Total marketing spend" />
          <MetricRow metric={metrics.roas} />
          <MetricRow metric={metrics.cpa} />
        </div>

        {adPlatforms.length === 0 ? null : (
          <ul className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-3">
            {adPlatforms.map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3">
                <span className="text-xs text-foreground-muted">{source.label}</span>
                <SourceBadge source={source} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
