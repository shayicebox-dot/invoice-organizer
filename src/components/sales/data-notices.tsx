import { Info, AlertCircle } from 'lucide-react';
import type { DataCaveats } from '@/data/dashboard-source';
import { Notice } from '@/components/ui/notice';
import { formatDateRange, formatShortDate } from '@/lib/utils/format';

/**
 * Everything a screen must say out loud about the figures it is showing.
 *
 * These notices are not decoration. A period label that silently covers less
 * time than it claims, or a total that quietly carries VAT inside it, is a
 * wrong number — so each caveat is stated where the figures are read.
 */
export function DataNotices({ caveats }: { readonly caveats: DataCaveats }) {
  const { coverage, availableFrom, incomplete, taxesIncluded, error } = caveats;

  if (error !== null) {
    return (
      <Notice tone="negative" icon={AlertCircle}>
        <span className="font-medium">{error.message}</span> {error.guidance}
      </Notice>
    );
  }

  const notices: string[] = [];

  if (coverage.truncated) {
    notices.push(
      `You asked for ${formatShortDate(coverage.requestedStart)} onwards, but Shopify only provides orders from ${
        availableFrom === null ? formatShortDate(coverage.range.start) : formatShortDate(availableFrom)
      }. Showing ${formatDateRange(coverage.range)} only.`,
    );
  }

  if (incomplete) {
    notices.push(
      'This period has more orders than were read in one go, so the totals are incomplete. Choose a shorter period.',
    );
  }

  if (taxesIncluded) {
    notices.push(
      'Your Shopify prices include tax, so the figures on this page include VAT. The dashboard and Expenses restate them excluding VAT.',
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
