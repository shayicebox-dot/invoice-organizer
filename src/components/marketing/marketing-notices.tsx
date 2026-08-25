import { Info, AlertCircle } from 'lucide-react';
import type { MarketingCaveats } from '@/data/marketing-source';
import { Notice } from '@/components/ui/notice';

type MarketingNoticesProps = {
  readonly caveats: MarketingCaveats | null;
  /** True when the period is a single day, where the timezone gap bites hardest. */
  readonly singleDay?: boolean;
};

/**
 * What must be said out loud about advertising figures.
 *
 * The timezone notice is the important one. Meta buckets a day in the ad
 * account's timezone and Shopify in the business timezone, so "25 August" is
 * not the same span of hours in both. Rather than shifting either source's
 * dates — which would report figures neither system actually returned — the gap
 * is measured and stated wherever the two are shown together.
 */
export function MarketingNotices({ caveats, singleDay = false }: MarketingNoticesProps) {
  if (caveats === null) return null;

  if (caveats.error !== null) {
    return (
      <Notice tone="negative" icon={AlertCircle}>
        <span className="font-medium">{caveats.error.message}</span> {caveats.error.guidance}
      </Notice>
    );
  }

  const notices: string[] = [];

  if (!caveats.currencyMatchesReporting && caveats.adAccountCurrency !== null) {
    notices.push(
      `The Meta ad account reports in ${caveats.adAccountCurrency}, but ICEBOX reports in ILS. Spend is not shown, because adding or dividing two currencies without a conversion rate would produce a wrong number.`,
    );
  }

  const offset = caveats.timeZoneOffsetHours;

  if (offset !== null && offset !== 0 && caveats.adAccountTimeZone !== null) {
    const hours = Math.abs(offset);
    const unit = hours === 1 ? 'hour' : 'hours';

    notices.push(
      `Meta counts a day in the ad account's timezone (${caveats.adAccountTimeZone}); ICEBOX counts it in ${caveats.businessTimeZone}, which is ${hours} ${unit} ahead. Spend and orders labelled with the same date therefore cover slightly different hours.` +
        (singleDay
          ? ` Over a single day this matters most: Meta's day has only just begun when the business day is already ${hours} ${unit} old, so today's spend will read low until the ad account's day catches up.`
          : ''),
    );
  }

  if (caveats.campaignsTruncated) {
    notices.push(
      'Meta returned a full page of campaigns, so this list may not be every campaign that ran. The account total above is unaffected — it comes from Meta directly, not from adding these rows up.',
    );
  }

  if (notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {notices.map((notice) => (
        <Notice key={notice} tone="warning" icon={Info}>
          {notice}
        </Notice>
      ))}
    </div>
  );
}
