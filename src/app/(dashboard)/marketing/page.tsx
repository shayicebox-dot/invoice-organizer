import type { Metadata } from "next";

import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { StatTile } from "@/components/dashboard/kpi-cards";
import { EmptyRow, TableFrame, Td, Th } from "@/components/ui/table";
import { InfoIcon } from "@/components/ui/icons";
import { getChannelPerformance, getRangeReport, getStores } from "@/lib/data";
import { percentChange } from "@/lib/finance";
import { type Money, formatMoney, formatMultiple, formatNumber, formatPercent, ratio } from "@/lib/money";
import { resolveViewParams } from "@/lib/view-params";
import { describeComparison } from "@/lib/date-range";

export const metadata: Metadata = { title: "Marketing" };

export default async function MarketingPage(props: PageProps<"/marketing">) {
  const searchParams = await props.searchParams;
  const stores = await getStores();
  const view = resolveViewParams(searchParams, stores);

  const [report, channels] = await Promise.all([
    getRangeReport(view.scope, view.range, view.previous),
    getChannelPerformance(view.scope, view.range.start, view.range.end),
  ]);

  const { summary, previous } = report;
  const comparison = describeComparison(view.range);

  const blendedRoas = ratio(summary.netSales, summary.adSpend);
  const mer = ratio(summary.netSales, summary.marketingSpend);
  const cac = summary.orders > 0 ? (Math.round(summary.marketingSpend / summary.orders) as Money) : (0 as Money);
  const previousCac =
    previous.orders > 0 ? (Math.round(previous.marketingSpend / previous.orders) as Money) : (0 as Money);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing"
        description={`${view.scopeLabel} · ${view.range.label}. Ad platforms are cost centres here — revenue always comes from Shopify.`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Marketing Spend"
          value={formatMoney(summary.marketingSpend, summary.currency)}
          delta={percentChange(summary.marketingSpend, previous.marketingSpend)}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote={`Ads ${formatMoney(summary.adSpend, summary.currency, { compact: true })} · Email ${formatMoney(summary.emailSpend, summary.currency, { compact: true })}`}
        />
        <StatTile
          label="Blended ROAS"
          value={formatMultiple(blendedRoas)}
          delta={null}
          footnote="Net sales ÷ paid ad spend"
        />
        <StatTile
          label="MER"
          value={formatMultiple(mer)}
          delta={null}
          footnote="Net sales ÷ all marketing spend"
        />
        <StatTile
          label="Cost per order"
          value={formatMoney(cac, summary.currency)}
          delta={percentChange(cac, previousCac)}
          deltaCaption={comparison}
          higherIsBetter={false}
          footnote="Marketing spend ÷ orders"
        />
      </div>

      <Card>
        <CardHeader
          title="Channels"
          description="Spend is imported per channel per day. Platform-attributed revenue is shown for context only."
        />
        <div className="mt-3">
          <TableFrame>
            <thead>
              <tr>
                <Th>Channel</Th>
                <Th align="right">Spend</Th>
                <Th align="right">Share</Th>
                <Th align="right">Impressions</Th>
                <Th align="right">Clicks</Th>
                <Th align="right">CPC</Th>
                <Th align="right">Attributed conv.</Th>
                <Th align="right">Attributed rev.</Th>
                <Th align="right">Platform ROAS</Th>
              </tr>
            </thead>
            <tbody>
              {channels.length === 0 ? (
                <EmptyRow colSpan={9}>No marketing spend in this period.</EmptyRow>
              ) : (
                channels.map((channel) => (
                  <tr key={channel.channel} className="transition-colors hover:bg-surface-muted">
                    <Td className="pr-6 font-medium">{channel.label}</Td>
                    <Td align="right" numeric>
                      {formatMoney(channel.spend, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatPercent(channel.shareOfSpend)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatNumber(channel.impressions)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatNumber(channel.clicks)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {channel.clicks > 0
                        ? formatMoney(Math.round(channel.spend / channel.clicks) as Money, summary.currency)
                        : "—"}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatNumber(channel.attributedConversions)}
                    </Td>
                    <Td align="right" numeric className="text-ink-secondary">
                      {formatMoney(channel.attributedRevenue, summary.currency, { whole: true })}
                    </Td>
                    <Td align="right" numeric>
                      {formatMultiple(channel.platformRoas)}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
            {channels.length > 0 ? (
              <tfoot>
                <tr className="bg-surface-muted">
                  <Td className="pr-6 font-semibold">Total</Td>
                  <Td align="right" numeric className="font-semibold">
                    {formatMoney(summary.marketingSpend, summary.currency, { whole: true })}
                  </Td>
                  <Td align="right" numeric>
                    100.0%
                  </Td>
                  <Td align="right" numeric>
                    {formatNumber(channels.reduce((acc, channel) => acc + channel.impressions, 0))}
                  </Td>
                  <Td align="right" numeric>
                    {formatNumber(channels.reduce((acc, channel) => acc + channel.clicks, 0))}
                  </Td>
                  <Td align="right" numeric />
                  <Td align="right" numeric>
                    {formatNumber(
                      channels.reduce((acc, channel) => acc + channel.attributedConversions, 0),
                    )}
                  </Td>
                  <Td align="right" numeric />
                  <Td align="right" numeric />
                </tr>
              </tfoot>
            ) : null}
          </TableFrame>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-md border border-line bg-surface-muted px-3 py-2.5 text-[12px] leading-5 text-ink-secondary">
          <InfoIcon className="mt-0.5 shrink-0 text-ink-muted" width={14} height={14} />
          <span>
            Attributed conversions and revenue are what each ad platform claims. They overlap
            across platforms and are never added to revenue in the P&amp;L. Actual revenue comes
            from Shopify; ad platforms contribute only spend.
          </span>
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Marketing against profit"
          description="What the period's spend left behind after every other cost."
        />
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Net sales" value={formatMoney(summary.netSales, summary.currency)} />
          <Metric
            label="Marketing cost ratio"
            value={formatPercent(summary.marketingCostRatio)}
            note="Marketing ÷ net sales"
          />
          <Metric
            label="Contribution profit"
            value={formatMoney(summary.contributionProfit, summary.currency)}
            note="After marketing and all variable costs"
          />
          <Metric
            label="Net profit"
            value={formatMoney(summary.netProfit, summary.currency)}
            note="After allocated fixed expenses"
          />
        </dl>
      </Card>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-surface-muted p-3">
      <dt className="text-[11.5px] text-ink-muted">{label}</dt>
      <dd className="tabular mt-1 text-[18px] font-semibold tracking-[-0.01em] text-ink">{value}</dd>
      {note ? <p className="mt-1 text-[11px] text-ink-muted">{note}</p> : null}
    </div>
  );
}
