import { Megaphone } from 'lucide-react';
import type { AdCampaignPerformance } from '@/core/metrics/marketing';
import { EmptyState } from '@/components/ui/empty-state';
import {
  formatCount,
  formatFrequency,
  formatMoney,
  formatMultiple,
  formatPercent,
} from '@/lib/utils/format';

type CampaignTableProps = {
  readonly campaigns: readonly AdCampaignPerformance[];
  /** Campaigns that exist on the account but did not run in this period. */
  readonly dormant: number;
};

/**
 * Campaign-level performance, largest spend first.
 *
 * Purchases, purchase value, CPA and ROAS are Meta's attribution: Meta's claim
 * about what its own ads caused, in its own attribution window. They are not
 * Shopify's record of what was sold, and the two will not agree. The heading
 * says so rather than leaving a reader to assume these are the store's orders.
 */
export function CampaignTable({ campaigns, dormant }: CampaignTableProps) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No campaigns ran in this period"
        description={
          dormant === 0
            ? 'Meta reported no delivery for this ad account over the selected dates.'
            : `Meta reported no delivery over the selected dates. ${formatCount(dormant)} campaigns exist on the account but did not run.`
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border-subtle text-left">
              <Th align="left">Campaign</Th>
              <Th>Spend</Th>
              <Th>Purchases</Th>
              <Th>Purchase value</Th>
              <Th>CPA</Th>
              <Th>ROAS</Th>
              <Th>Impressions</Th>
              <Th>Reach</Th>
              <Th>Frequency</Th>
              <Th>CPM</Th>
              <Th>Link CTR</Th>
              <Th>Link CPC</Th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => {
              const { delivery, efficiency } = campaign;

              return (
                <tr
                  key={campaign.id}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-muted"
                >
                  <td className="max-w-[22rem] py-2.5 pr-4">
                    {/* Campaign names are the advertiser's own text: Hebrew,
                        English, emoji and bidirectional marks. `dir="auto"`
                        lets each name lay itself out by its own first strong
                        character, and isolation stops an RTL name from
                        reordering the columns around it. */}
                    <span
                      dir="auto"
                      className="block truncate [unicode-bidi:isolate]"
                      title={campaign.name}
                    >
                      {campaign.name}
                    </span>
                  </td>
                  <Td>{formatMoney(delivery.spend, { showDecimals: true })}</Td>
                  <Td>{delivery.purchases === null ? '—' : formatCount(delivery.purchases)}</Td>
                  <Td>
                    {delivery.purchaseValue === null ? '—' : formatMoney(delivery.purchaseValue)}
                  </Td>
                  <Td>
                    {efficiency.cpa === null ? '—' : formatMoney(efficiency.cpa, { showDecimals: true })}
                  </Td>
                  <Td>{efficiency.roas === null ? '—' : formatMultiple(efficiency.roas)}</Td>
                  <Td>{formatCount(delivery.impressions)}</Td>
                  <Td>{formatCount(delivery.reach)}</Td>
                  <Td>
                    {efficiency.frequency === null ? '—' : formatFrequency(efficiency.frequency)}
                  </Td>
                  <Td>
                    {efficiency.cpm === null ? '—' : formatMoney(efficiency.cpm, { showDecimals: true })}
                  </Td>
                  <Td>{efficiency.linkCtr === null ? '—' : formatPercent(efficiency.linkCtr, 2)}</Td>
                  <Td>
                    {efficiency.linkCpc === null
                      ? '—'
                      : formatMoney(efficiency.linkCpc, { showDecimals: true })}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dormant > 0 ? (
        <p className="text-xs text-foreground-subtle">
          {formatCount(dormant)} further campaigns exist on this ad account but had no delivery in
          this period, so they are not listed.
        </p>
      ) : null}
    </div>
  );
}

function Th({
  children,
  align = 'right',
}: {
  readonly children: React.ReactNode;
  readonly align?: 'left' | 'right';
}) {
  return (
    <th
      scope="col"
      className={
        align === 'left'
          ? 'py-2 pr-4 text-xs font-medium text-foreground-muted'
          : 'py-2 pl-4 text-right text-xs font-medium text-foreground-muted'
      }
    >
      {children}
    </th>
  );
}

function Td({ children }: { readonly children: React.ReactNode }) {
  return <td className="numeric py-2.5 pl-4 text-right text-foreground">{children}</td>;
}
