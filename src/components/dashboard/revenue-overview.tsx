import type { DashboardMetrics } from '@/core/metrics/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MetricRow } from '@/components/dashboard/metric-row';

type RevenueOverviewProps = {
  readonly metrics: DashboardMetrics;
  /** Whether the sales channel providing these figures is connected. */
  readonly salesConnected: boolean;
};

/** Section 1 — how gross revenue becomes net revenue, and what an order is worth. */
export function RevenueOverview({ metrics, salesConnected }: RevenueOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Revenue overview</CardTitle>
          <CardDescription>Sales after discounts and refunds, and value per order.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <MetricRow metric={metrics.grossRevenue} sign="+" />
          <MetricRow metric={metrics.discounts} sign="−" />
          <MetricRow metric={metrics.refunds} sign="−" />
          <MetricRow metric={metrics.revenue} subtotal label="Net revenue" />
          <MetricRow metric={metrics.orders} />
          <MetricRow metric={metrics.aov} />
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-foreground-subtle">
          {salesConnected
            ? 'VAT is not separated yet — these figures are as reported by the sales channel.'
            : 'Shopify is not connected, so no sales have been reported. A dash means no data, not zero.'}
        </p>
      </CardContent>
    </Card>
  );
}
