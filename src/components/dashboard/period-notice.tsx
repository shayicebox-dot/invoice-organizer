import { Info } from 'lucide-react';
import type { PeriodAdjustment } from '@/core/period';
import { Notice } from '@/components/ui/notice';
import { formatLongDate } from '@/lib/utils/format';

/**
 * Says so when the period on screen is not the period that was asked for.
 *
 * A requested range is never quietly swapped for a different one. If the dates
 * in the URL could not be honoured, the screen reports figures for a period the
 * reader did not choose — which is only safe if it says that out loud.
 */
export function PeriodNotice({ adjustment }: { readonly adjustment: PeriodAdjustment }) {
  if (adjustment.kind === 'none') return null;

  return (
    <Notice tone="warning" icon={Info}>
      {adjustment.kind === 'end-clamped'
        ? `The end date ${formatLongDate(adjustment.requestedEnd)} is in the future, so this period runs up to today instead.`
        : `${adjustment.reason} Showing the last 30 complete days instead.`}
    </Notice>
  );
}
