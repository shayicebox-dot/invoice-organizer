import type { BusinessStatus } from '@/core/metrics/summary';
import { cn } from '@/lib/utils/cn';

/**
 * The period in one sentence.
 *
 * Every clause is derived in `src/core/metrics/summary.ts` from figures the
 * profit engine produced — it states what the numbers say and stops. No advice,
 * no hedging, and no cause named unless the arithmetic establishes it.
 */
export function StatusSummary({ status }: { readonly status: BusinessStatus }) {
  return (
    <section
      aria-label="Summary"
      className={cn(
        'rounded-2xl border px-6 py-5',
        status.tone === 'negative'
          ? 'border-negative/20 bg-negative-muted'
          : status.tone === 'positive'
            ? 'border-positive/20 bg-positive-muted'
            : status.tone === 'warning'
              ? 'border-warning/20 bg-warning-muted'
              : 'border-border-subtle bg-surface-muted',
      )}
    >
      <p className="text-base font-medium leading-snug text-foreground">{status.headline}</p>
      {status.detail === null ? null : (
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-foreground-muted">
          {status.detail}
        </p>
      )}
    </section>
  );
}
