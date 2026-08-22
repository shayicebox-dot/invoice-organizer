import type { DashboardMetrics } from '@/core/metrics/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { MetricRow } from '@/components/dashboard/metric-row';
import { hasCostConfiguration } from '@/lib/config/business';

type ProfitBreakdownProps = {
  readonly metrics: DashboardMetrics;
  /** Whether any upstream source is reporting figures yet. */
  readonly anySourceConnected: boolean;
};

/** Section 3 — revenue down to net profit, one deduction per line. */
export function ProfitBreakdown({ metrics, anySourceConnected }: ProfitBreakdownProps) {
  const costsConfigured = hasCostConfiguration();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Profit breakdown</CardTitle>
          <CardDescription>Every deduction between revenue and net profit.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <MetricRow metric={metrics.revenue} sign="+" label="Net revenue" />
          <MetricRow metric={metrics.cogs} sign="−" />
          <MetricRow metric={metrics.grossProfit} subtotal />
          <MetricRow metric={metrics.marketingSpend} sign="−" label="Marketing spend" />
          <MetricRow metric={metrics.shippingCost} sign="−" />
          <MetricRow metric={metrics.processingFees} sign="−" />
          <MetricRow metric={metrics.operatingExpenses} sign="−" />
          <MetricRow metric={metrics.netProfit} subtotal />
          <MetricRow metric={metrics.netMargin} />
        </div>

        {costsConfigured && anySourceConnected ? null : (
          <p className="mt-4 text-[11px] leading-relaxed text-foreground-subtle">
            {costsConfigured ? null : (
              <>
                Shipping, payment processing and fixed operating expenses are not configured yet.
                They are set in <span className="text-foreground-muted">Settings</span>, never
                estimated here.{' '}
              </>
            )}
            {anySourceConnected ? null : 'A dash means no data, not zero.'}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
