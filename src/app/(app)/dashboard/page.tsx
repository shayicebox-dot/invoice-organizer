import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { ProfitHero } from '@/components/dashboard/profit-hero';
import { StatusSummary } from '@/components/dashboard/status-summary';
import { BreakEvenSection } from '@/components/dashboard/break-even';
import { ProfitWaterfall } from '@/components/dashboard/profit-waterfall';
import { SecondaryMetrics } from '@/components/dashboard/secondary-metrics';
import { MarketingPerformance } from '@/components/dashboard/marketing-performance';
import { RecentOrders } from '@/components/dashboard/recent-orders';
import { DailyPerformanceChart } from '@/components/dashboard/daily-performance-chart';
import { DataSourcePanel } from '@/components/dashboard/data-source-panel';
import { DataNotices } from '@/components/sales/data-notices';
import { MarketingNotices } from '@/components/marketing/marketing-notices';
import { MappingNotice, VatNotice } from '@/components/profitability/mapping-notice';
import { computeDashboardMetrics } from '@/core/metrics/dashboard';
import { profitWaterfall } from '@/core/metrics/profitability';
import { computeBreakEven } from '@/core/metrics/breakeven';
import { describeBusinessStatus } from '@/core/metrics/summary';
import { compareAmounts, compareNumbers } from '@/core/metrics/comparison';
import { connectedSourceCount, getDashboardData } from '@/data/dashboard-source';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { formatCount, formatDateRange, formatMoney, formatPercent } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Dashboard' };

/** Every load reads live from Shopify and Meta, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type DashboardPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);

  const data = await getDashboardData(range);
  const metrics = computeDashboardMetrics(data.inputs);
  const connected = connectedSourceCount(data.sources);
  const { pnl, boxes, vat } = data.profitability;

  // Every figure below comes from the profit engine unchanged. This page
  // arranges them; it computes nothing.
  const breakEven = computeBreakEven(pnl);
  const waterfall = profitWaterfall(pnl);
  const status = describeBusinessStatus(pnl, breakEven, {
    money: (amount) => formatMoney(amount),
    percent: (fraction) => formatPercent(fraction),
  });

  const before = data.previous?.pnl ?? null;
  const previousBreakEven = before === null ? null : computeBreakEven(before);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={`Financial overview for ${formatDateRange(data.range)}.`}
        actions={<DateRangePicker range={range} preset={preset} today={today} basePath="/dashboard" />}
      />

      <div className="flex flex-col gap-2">
        <PeriodNotice adjustment={adjustment} />
        <DataNotices caveats={data.caveats} />
        <MarketingNotices caveats={data.caveats.marketing} singleDay={range.start === range.end} />
        <VatNotice uniform={vat.uniform} changedOn={vat.changedOn} basisPoints={vat.basisPoints} />
        <MappingNotice boxes={boxes} />
      </div>

      <ProfitHero
        netProfit={pnl.netProfit}
        netProfitLabel={
          pnl.netProfit === null
            ? null
            : formatMoney(
                pnl.netProfit.minorUnits < 0
                  ? { ...pnl.netProfit, minorUnits: -pnl.netProfit.minorUnits }
                  : pnl.netProfit,
              )
        }
        netMarginLabel={pnl.netMargin === null ? null : formatPercent(pnl.netMargin)}
        netProfitDelta={compareAmounts(pnl.netProfit, before?.netProfit ?? null, 'higher')}
        netMarginDelta={compareNumbers(pnl.netMargin, before?.netMargin ?? null, 'higher')}
        periodLabel={formatDateRange(data.range)}
        supporting={[
          {
            label: 'Revenue',
            value: pnl.netRevenueInclVat === null ? null : formatMoney(pnl.netRevenueInclVat),
            delta: compareAmounts(pnl.netRevenueInclVat, before?.netRevenueInclVat ?? null, 'higher'),
          },
          {
            label: 'Marketing spend',
            value: pnl.adSpend === null ? null : formatMoney(pnl.adSpend),
            delta: compareAmounts(pnl.adSpend, before?.adSpend ?? null, 'lower'),
          },
          {
            label: 'Orders',
            value: pnl.orderCount === null ? null : formatCount(pnl.orderCount),
            delta: compareNumbers(pnl.orderCount, before?.orderCount ?? null, 'higher'),
          },
        ]}
      />

      <StatusSummary status={status} />

      <BreakEvenSection
        breakEven={breakEven}
        cpaDelta={compareAmounts(breakEven.actualCpa, previousBreakEven?.actualCpa ?? null, 'lower')}
        roasDelta={compareNumbers(breakEven.actualRoas, previousBreakEven?.actualRoas ?? null, 'higher')}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profitability</CardTitle>
            <CardDescription>
              From what customers paid to what the business kept, for {formatDateRange(data.range)}.
              Every line states the formula behind it.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ProfitWaterfall steps={waterfall} />
        </CardContent>
      </Card>

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

      <SecondaryMetrics
        vat={pnl.vat}
        revenueExVat={pnl.revenueExVat}
        productCost={pnl.productCogsExVat}
        shipping={pnl.shippingExVat}
        variableCosts={pnl.variableOperating}
        fixedExpenses={pnl.fixedExpensesTotal}
        physicalBoxes={pnl.physicalBoxes}
        averageOrderValue={pnl.averageOrderValueInclVat}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <MarketingPerformance
          metrics={metrics}
          sources={data.sources}
          activePlatforms={data.inputs.activeAdPlatforms}
        />
        <DataSourcePanel sources={data.sources} />
      </div>

      <RecentOrders orders={data.recentOrders} currency={data.inputs.currency} />

      {connected === 0 ? null : (
        <p className="text-xs text-foreground-subtle">
          {connected} of {data.sources.length} data sources reporting.
        </p>
      )}
    </div>
  );
}
