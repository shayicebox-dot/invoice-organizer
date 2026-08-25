import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Megaphone } from 'lucide-react';
import { PeriodSelector } from '@/components/dashboard/period-selector';
import { MarketingNotices } from '@/components/marketing/marketing-notices';
import { CampaignTable } from '@/components/marketing/campaign-table';
import { computeBlendedAdMetrics } from '@/core/metrics/marketing';
import { parsePeriodPreset, resolvePeriod } from '@/core/period';
import { getMarketingData } from '@/data/marketing-source';
import { getSalesPageData } from '@/data/sales-source';
import { todayInBusinessTimeZone } from '@/lib/utils/today';
import {
  formatCount,
  formatDateRange,
  formatFrequency,
  formatMoney,
  formatMultiple,
  formatPercent,
} from '@/lib/utils/format';

export const metadata: Metadata = { title: 'Marketing' };

/** Every load reads live from Meta, so nothing is prerendered. */
export const dynamic = 'force-dynamic';

type MarketingPageProps = {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MarketingPage({ searchParams }: MarketingPageProps) {
  const params = await searchParams;
  const periodParam = params['period'];
  const preset = parsePeriodPreset(typeof periodParam === 'string' ? periodParam : undefined);
  const range = resolvePeriod(preset, todayInBusinessTimeZone());

  const [marketing, sales] = await Promise.all([getMarketingData(range), getSalesPageData(range)]);
  const { delivery, efficiency, caveats } = marketing;

  // Blended figures divide Meta spend by Shopify's figures, so both must cover
  // the same period. Shopify trims a range to the history it has; when that
  // happens the two no longer line up and the blend is withheld rather than
  // computed across mismatched periods.
  // Blended figures also need Shopify to have actually answered: its totals are
  // zero-filled when it did not, and dividing by a stand-in zero would report a
  // confident "0 orders" for a store that was simply never asked.
  const storeRange = sales.caveats.coverage.range;
  const rangesAgree = storeRange.start === range.start && storeRange.end === range.end;
  const blended =
    delivery !== null && sales.sourceAnswered && rangesAgree && caveats.currencyMatchesReporting
      ? computeBlendedAdMetrics(delivery.spend, sales.totals.orderCount, sales.totals.netRevenue)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Marketing"
        description={
          marketing.accountName === null
            ? `Meta Ads performance for ${formatDateRange(range)}.`
            : `Meta Ads performance for ${formatDateRange(range)}, from the ${marketing.accountName} ad account.`
        }
        actions={
          <>
            <PeriodSelector active={preset} basePath="/marketing" />
            <Badge tone={delivery === null ? 'neutral' : 'positive'}>
              {delivery === null ? 'Not connected' : `${formatCount(marketing.campaigns.length)} campaigns`}
            </Badge>
          </>
        }
      />

      <MarketingNotices caveats={caveats} singleDay={range.start === range.end} />

      {!marketing.configured ? (
        <EmptyState
          icon={Megaphone}
          title="Meta Ads is not connected"
          description="Add the Meta credentials to this deployment, then confirm the connection in Settings. Ad spend, purchases and campaign performance appear here once it answers."
        />
      ) : delivery === null || efficiency === null ? (
        <EmptyState
          icon={Megaphone}
          title="Meta reported nothing for this period"
          description={`No delivery was recorded for ${formatDateRange(range)}. Try a longer period, or check that campaigns were running.`}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Meta Ads performance</CardTitle>
                  <CardDescription>
                    Purchases, purchase value, CPA and ROAS are Meta&rsquo;s own attribution — its
                    account of what its ads caused, not the store&rsquo;s record of what sold.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {/* Two groups rather than one two-column list: money and what it
                    returned on the left, how the ads were delivered on the
                    right. A single grid pairs rows by position and would sit
                    "Purchase value" next to "CPA", which reads as a relationship
                    that is not there. */}
                <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  <Group title="Spend and return">
                    <Row label="Ad spend" value={formatMoney(delivery.spend, { showDecimals: true })} emphasis />
                    <Row
                      label="Purchases"
                      value={delivery.purchases === null ? '—' : formatCount(delivery.purchases)}
                    />
                    <Row
                      label="Purchase value"
                      value={delivery.purchaseValue === null ? '—' : formatMoney(delivery.purchaseValue)}
                    />
                    <Row
                      label="CPA"
                      value={efficiency.cpa === null ? '—' : formatMoney(efficiency.cpa, { showDecimals: true })}
                    />
                    <Row
                      label="ROAS"
                      value={efficiency.roas === null ? '—' : formatMultiple(efficiency.roas)}
                    />
                  </Group>

                  <Group title="Delivery">
                    <Row label="Impressions" value={formatCount(delivery.impressions)} />
                    <Row label="Reach" value={formatCount(delivery.reach)} />
                    <Row
                      label="Frequency"
                      value={efficiency.frequency === null ? '—' : formatFrequency(efficiency.frequency)}
                    />
                    <Row
                      label="CPM"
                      value={efficiency.cpm === null ? '—' : formatMoney(efficiency.cpm, { showDecimals: true })}
                    />
                    <Row
                      label="Link CTR"
                      value={efficiency.linkCtr === null ? '—' : formatPercent(efficiency.linkCtr, 2)}
                    />
                    <Row
                      label="Link CPC"
                      value={
                        efficiency.linkCpc === null
                          ? '—'
                          : formatMoney(efficiency.linkCpc, { showDecimals: true })
                      }
                    />
                  </Group>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Against the store&rsquo;s own books</CardTitle>
                  <CardDescription>
                    The same spend measured against what Shopify actually recorded. This attributes
                    nothing — it only says both happened in the same period.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {blended === null ? (
                  <p className="text-sm text-foreground-muted">
                    {!sales.sourceAnswered
                      ? 'Shopify did not answer for this period, so there is nothing to measure the spend against. These figures stay blank rather than reading zero.'
                      : rangesAgree
                        ? 'Shopify sales are not available for this period, so there is nothing to measure the spend against.'
                        : `Shopify only provides orders from ${formatDateRange(storeRange)}, which is a shorter period than the spend above covers. Dividing across two different periods would give a wrong figure, so these are not shown.`}
                  </p>
                ) : (
                  <dl className="grid gap-x-8 sm:grid-cols-2">
                    <Row label="Shopify orders" value={formatCount(sales.totals.orderCount)} />
                    <Row label="Shopify net revenue" value={formatMoney(sales.totals.netRevenue)} />
                    <Row
                      label="Blended CPA"
                      value={blended.cpa === null ? '—' : formatMoney(blended.cpa, { showDecimals: true })}
                    />
                    <Row
                      label="Blended ROAS"
                      value={blended.roas === null ? '—' : formatMultiple(blended.roas)}
                      emphasis
                    />
                  </dl>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Campaigns</CardTitle>
                <CardDescription>
                  Ordered by spend. Reach is deduplicated per row, so campaign reach does not add up
                  to the account total above.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <CampaignTable campaigns={marketing.campaigns} dormant={caveats.dormantCampaigns} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{title}</h3>
      <dl className="mt-1.5">{children}</dl>
    </div>
  );
}

function Row({
  label,
  value,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? 'flex items-baseline justify-between gap-4 border-t border-border-strong py-2 font-medium'
          : 'flex items-baseline justify-between gap-4 border-t border-border-subtle py-2'
      }
    >
      <dt className="text-sm text-foreground-muted">{label}</dt>
      <dd className="numeric text-sm text-foreground">{value}</dd>
    </div>
  );
}
