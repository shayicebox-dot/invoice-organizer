import type { Metric } from '@/core/metrics/types';
import { formatMetric } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type MetricRowProps = {
  readonly metric: Metric;
  /** Shown before the label: '+' for inflows, '−' for costs. */
  readonly sign?: '+' | '−';
  /** Subtotal rows are separated and set in medium weight. */
  readonly subtotal?: boolean;
  readonly label?: string;
};

/** One line of a breakdown: label on the left, figure right-aligned. */
export function MetricRow({ metric, sign, subtotal = false, label }: MetricRowProps) {
  const value = formatMetric(metric);

  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 py-2',
        subtotal
          ? 'border-t border-border-strong font-medium text-foreground'
          : 'border-t border-border-subtle text-foreground-muted first:border-t-0',
      )}
    >
      <span className="flex items-baseline gap-1.5 text-sm">
        {sign ? (
          <span aria-hidden="true" className="w-2 text-foreground-subtle">
            {sign}
          </span>
        ) : null}
        {label ?? metric.label}
      </span>
      {value === null ? (
        <span
          className="numeric text-sm text-foreground-subtle"
          title={metric.unavailableReason ?? 'Not connected'}
        >
          —
        </span>
      ) : (
        <span className={cn('numeric text-sm', subtotal ? 'font-semibold' : 'text-foreground')}>
          {value}
        </span>
      )}
    </div>
  );
}
