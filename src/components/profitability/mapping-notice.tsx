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
  if (boxes.complete) return null;

  const named = boxes.unmappedVariants
    .slice(0, 3)
    .map((variant) =>
      variant.variantTitle === null
        ? variant.productTitle
        : `${variant.productTitle} (${variant.variantTitle})`,
    )
    .join(', ');

  return (
    <Notice tone="negative" icon={AlertCircle}>
      {formatCount(boxes.unmappedVariants.length)}{' '}
      {boxes.unmappedVariants.length === 1 ? 'product has' : 'products have'} no box count recorded
      — {named}
      {boxes.unmappedVariants.length > 3 ? ' and others' : ''}. They are counted as zero boxes, so
      no product or shipping cost is charged for them and profit is overstated by that amount. Set
      each one in Settings → Product mapping; a shoe is simply 0 boxes.
    </Notice>
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
