import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShopifyConnectionCard } from '@/components/settings/shopify-connection-card';
import { MetaConnectionCard } from '@/components/settings/meta-connection-card';
import { MorningConnectionCard } from '@/components/settings/morning-connection-card';
import { MorningPaymentsCard } from '@/components/settings/morning-payments-card';
import { DateRangePicker } from '@/components/dashboard/date-range-picker';
import { PeriodNotice } from '@/components/dashboard/period-notice';
import { reportingPeriod } from '@/lib/utils/reporting-period';
import { ProductMappingCard } from '@/components/settings/product-mapping-card';
import { getProductsPageData } from '@/data/sales-source';
import { readBoxMapping } from '@/data/box-mapping-store';
import { formatDateRange } from '@/lib/utils/format';
import { resolvePreset } from '@/core/period';
import { todayInBusinessTimeZone } from '@/lib/utils/today';
import { DeploymentCard } from '@/components/settings/deployment-card';
import {
  deploymentInfo,
  isMetaConfigured,
  isMorningConfigured,
  isShopifyConfigured,
} from '@/lib/config/env';
import { BUSINESS_CONFIG } from '@/lib/config/business';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Rendered per request, not at build time: whether Shopify credentials exist is
 * a property of the running deployment. A prerendered page would freeze that
 * answer as it stood during the build.
 */
export const dynamic = 'force-dynamic';

type SettingsPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Settings is rendered on the server, so it can read configuration directly. */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  // The payment diagnostic reads a period, so this screen resolves dates the
  // same way every other one does rather than inventing its own.
  const { range, preset, today, adjustment } = reportingPeriod(await searchParams);
  // A recent window, fixed rather than picked: this table is for checking the
  // cost model's foundation, not for reporting a period.
  const mappingRange = resolvePreset('last30', todayInBusinessTimeZone());
  const [recent, mappingState] = await Promise.all([
    getProductsPageData(mappingRange),
    readBoxMapping(),
  ]);
  const shopifyConfigured = isShopifyConfigured();
  const metaConfigured = isMetaConfigured();
  const morningConfigured = isMorningConfigured();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Business profile, cost assumptions and data source connections."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Deployment</h2>
        <DeploymentCard {...deploymentInfo()} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Cost model</h2>
        <ProductMappingCard
          rows={recent.mapping}
          rangeLabel={formatDateRange(mappingRange)}
          writable={mappingState.writable}
          unavailableReason={mappingState.unavailableReason}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Data sources</h2>
        <ShopifyConnectionCard configured={shopifyConfigured} />
        <MetaConnectionCard configured={metaConfigured} />
        <MorningConnectionCard configured={morningConfigured} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-tight text-foreground">
            Morning payment diagnostics
          </h2>
          <DateRangePicker range={range} preset={preset} today={today} basePath="/settings" />
        </div>
        <PeriodNotice adjustment={adjustment} />
        <MorningPaymentsCard configured={morningConfigured} range={range} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Business profile</h2>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>ICEBOX</CardTitle>
              <CardDescription>
                Facts every calculation depends on. Editing these in the app comes later; today they
                live in <span className="text-foreground-muted">src/lib/config/business.ts</span>.
              </CardDescription>
            </div>
            <Badge tone="neutral">Read only</Badge>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <ProfileRow label="Reporting currency" value={BUSINESS_CONFIG.reportingCurrency} />
              <ProfileRow label="Business timezone" value={BUSINESS_CONFIG.timeZone} />
              <ProfileRow label="Country" value={BUSINESS_CONFIG.countryCode} />
              <ProfileRow
                label="Fiscal year starts"
                value={`Month ${BUSINESS_CONFIG.fiscalYearStartMonth}`}
              />
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Access</h2>
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-positive">
                <ShieldCheck className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Owner sign-in</CardTitle>
                <CardDescription>
                  Every page and action requires the owner password, held only in{' '}
                  <span className="text-foreground-muted">ICEBOX_ADMIN_PASSWORD</span> on the
                  server. A session lasts 7 days; changing the password signs every device out
                  immediately. Use <span className="text-foreground-muted">Sign out</span> in the
                  top bar to end this session now.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </section>
    </div>
  );
}

function ProfileRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-2">
      <dt className="text-sm text-foreground-muted">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
