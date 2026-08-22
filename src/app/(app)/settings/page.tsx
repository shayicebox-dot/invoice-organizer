import type { Metadata } from 'next';
import { ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShopifyConnectionCard } from '@/components/settings/shopify-connection-card';
import { isShopifyConfigured } from '@/lib/config/env';
import { BUSINESS_CONFIG } from '@/lib/config/business';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Rendered per request, not at build time: whether Shopify credentials exist is
 * a property of the running deployment. A prerendered page would freeze that
 * answer as it stood during the build.
 */
export const dynamic = 'force-dynamic';

/** Settings is rendered on the server, so it can read configuration directly. */
export default function SettingsPage() {
  const shopifyConfigured = isShopifyConfigured();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Business profile, cost assumptions and data source connections."
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Data sources</h2>
        <ShopifyConnectionCard configured={shopifyConfigured} />
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
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-warning">
                <ShieldAlert className="size-4" aria-hidden="true" />
              </span>
              <div>
                <CardTitle>Sign-in is not built yet</CardTitle>
                <CardDescription>
                  Anyone who knows this site&rsquo;s address can open it and press{' '}
                  <span className="text-foreground-muted">Test connection</span>. That reveals the
                  store name, currency, timezone and granted scopes — no credentials, no financial
                  data, and no customer data. Until sign-in exists, restrict access at the hosting
                  level (Vercel&rsquo;s Deployment Protection) if that matters.
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
