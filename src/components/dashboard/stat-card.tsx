import { NOT_CONNECTED_LABEL } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type StatCardProps = {
  readonly label: string;
  /** Formatted value, or `null` when it could not be computed. */
  readonly value: string | null;
  /** The formula behind it, shown under the figure and never omitted. */
  readonly formula: string;
  /**
   * Why there is no value. `missing` means a source is not connected — the tile
   * says so. `undefined` means the inputs exist but the figure has no meaning
   * for them, such as an average over no orders, and shows a dash.
   */
  readonly unavailable?: 'missing' | 'undefined';
  readonly emphasis?: boolean;
  /** Costs read as deductions, so they are set apart from the figures above. */
  readonly tone?: 'neutral' | 'cost' | 'positive' | 'negative';
};

/**
 * One figure from the profit and loss.
 *
 * Shows the formula alongside every value, because a profit number that cannot
 * be explained is not usable by an accountant. A figure with no value is never
 * rendered as zero — "we have no data" and "the value is zero" are different
 * statements, and a cost engine that confuses them reports a profit the
 * business did not make.
 */
export function StatCard({
  label,
  value,
  formula,
  unavailable = 'missing',
  emphasis = false,
  tone = 'neutral',
}: StatCardProps) {
  return (
    <div
      className="flex min-h-[104px] flex-col justify-between rounded-xl border border-border-subtle bg-surface px-4 py-3.5"
      title={formula}
    >
      <p className="text-xs font-medium text-foreground-muted">{label}</p>

      {value === null ? (
        unavailable === 'undefined' ? (
          <p className="numeric mt-3 text-xl text-foreground-subtle">—</p>
        ) : (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-foreground-subtle">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground-subtle/50" />
            {NOT_CONNECTED_LABEL}
          </p>
        )
      ) : (
        <p
          className={cn(
            'mt-3 font-semibold tracking-tight',
            emphasis ? 'text-2xl' : 'text-xl',
            tone === 'cost' && 'text-foreground-muted',
            tone === 'positive' && 'text-positive',
            tone === 'negative' && 'text-negative',
            tone === 'neutral' && 'text-foreground',
          )}
        >
          {value}
        </p>
      )}

      <p className="mt-2 truncate text-[11px] text-foreground-subtle">{formula}</p>
    </div>
  );
}
