import { Info, AlertCircle } from 'lucide-react';
import type { BoxTally } from '@/core/metrics/boxes';
import { Notice } from '@/components/ui/notice';
import { formatCount } from '@/lib/utils/format';

/**
 * What the box count rests on.
 *
 * Every cost in the engine is per physical box, so how each line was mapped to
 * a box count decides whether the profit figures are right. Two things must be
 * said out loud: lines that could not be mapped at all, whose cost is therefore
 * missing from the totals, and lines mapped by reading a number out of a title
 * rather than from a configured variant ID, which is a guess that happens to be
 * checkable.
 */
export function MappingNotice({ boxes }: { readonly boxes: BoxTally }) {
  const notices: { readonly key: string; readonly tone: 'warning' | 'negative'; readonly text: string }[] = [];

  if (boxes.unresolvedLines > 0) {
    const named = boxes.unmappedProducts
      .slice(0, 3)
      .map((product) =>
        product.variantTitle === null
          ? product.productTitle
          : `${product.productTitle} (${product.variantTitle})`,
      )
      .join(', ');

    notices.push({
      key: 'unresolved',
      tone: 'negative',
      text: `${formatCount(boxes.unresolvedLines)} order ${boxes.unresolvedLines === 1 ? 'line' : 'lines'} could not be matched to a physical box count — ${named}${boxes.unmappedProducts.length > 3 ? ' and others' : ''}. Their product and shipping cost is missing from every figure below, so profit is overstated. Map them in Settings → Product mapping.`,
    });
  }

  if (boxes.titleResolvedLines > 0) {
    notices.push({
      key: 'title',
      tone: 'warning',
      text: `${formatCount(boxes.titleResolvedLines)} order ${boxes.titleResolvedLines === 1 ? 'line was' : 'lines were'} costed using a box count read from the product title, because no variant ID is configured for them. Confirm these in Settings → Product mapping: a renamed product would silently change the cost.`,
    });
  }

  if (notices.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {notices.map((notice) => (
        <Notice
          key={notice.key}
          tone={notice.tone}
          icon={notice.tone === 'negative' ? AlertCircle : Info}
        >
          {notice.text}
        </Notice>
      ))}
    </div>
  );
}

/** Says when a period spans a VAT rate change, which one rate cannot settle. */
export function VatNotice({
  uniform,
  changedOn,
  basisPoints,
}: {
  readonly uniform: boolean;
  readonly changedOn: string | null;
  readonly basisPoints: number;
}) {
  if (uniform || changedOn === null) return null;

  return (
    <Notice tone="warning" icon={Info}>
      Israeli VAT changed on {changedOn}, inside this period. Every figure here uses{' '}
      {basisPoints / 100}%, the rate at the end of the range, so the earlier days are stated at the
      wrong rate. Split the period at that date to be exact.
    </Notice>
  );
}
