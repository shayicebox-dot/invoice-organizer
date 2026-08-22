import type { Metadata } from 'next';
import Link from 'next/link';
import { Plug, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { NAV_SECTIONS } from '@/lib/config/navigation';

export const metadata: Metadata = { title: 'Dashboard' };

/**
 * Company overview. Intentionally empty: no data sources are connected, and
 * ICEBOX OS never renders sample or estimated figures.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Financial overview for ICEBOX. Figures appear here once data sources are connected and calculations are implemented."
        actions={<Badge tone="neutral">No data sources</Badge>}
      />

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
              <Plug className="size-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Nothing is connected yet</CardTitle>
              <CardDescription>
                This is the application shell only. Integrations, the database schema and every
                financial calculation are still to be built. Until then no numbers are shown —
                placeholder values would be indistinguishable from real ones.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium tracking-tight text-foreground">Modules</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NAV_SECTIONS.flatMap((section) => section.items)
            .filter((item) => item.id !== 'dashboard')
            .map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="group rounded-xl border border-border-subtle bg-surface p-4 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-8 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-foreground-subtle">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <ArrowRight
                      className="size-4 text-foreground-subtle opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">{item.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground-muted">
                    {item.description}
                  </p>
                </Link>
              );
            })}
        </div>
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Planned metrics</CardTitle>
            <CardDescription>
              The figures this dashboard will eventually own. Each one must be traceable to its
              source records before it is displayed.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-1.5 text-xs text-foreground-muted sm:grid-cols-2 lg:grid-cols-3">
            {PLANNED_METRICS.map((metric) => (
              <li key={metric} className="flex items-baseline justify-between gap-3 border-b border-border-subtle/60 py-1.5">
                <span>{metric}</span>
                <span className="numeric text-foreground-subtle" aria-label="No value">
                  —
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

const PLANNED_METRICS: readonly string[] = [
  'Gross revenue',
  'Revenue excl. VAT',
  'Output VAT',
  'Input VAT (deductible)',
  'Estimated VAT payable',
  'Discounts',
  'Refunds',
  'Net revenue',
  'COGS',
  'Gross profit',
  'Shipping & fulfilment',
  'Payment processing fees',
  'Meta spend',
  'Google Ads spend',
  'Total marketing spend',
  'Contribution profit',
  'Fixed operating expenses',
  'Operating profit',
  'Estimated tax',
  'Estimated net profit',
  'Cash flow',
  'Inventory value',
];
