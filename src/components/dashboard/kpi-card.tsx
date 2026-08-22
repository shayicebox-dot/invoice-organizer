import type { Metric } from '@/core/metrics/types';
import { formatMetric, NOT_CONNECTED_LABEL } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type KpiCardProps = {
  readonly metric: Metric;
  /** Lead metrics render slightly larger. */
  readonly emphasis?: boolean;
};

/**
 * Compact KPI tile: label, value, and the formula that produced it.
 * A metric with no value shows "Not connected" — never a zero standing in for
 * data we do not have. The full reason is available on hover.
 */
export function KpiCard({ metric, emphasis = false }: KpiCardProps) {
  const value = formatMetric(metric);

  return (
    <div
      className="flex min-h-[104px] flex-col justify-between rounded-xl border border-border-subtle bg-surface px-4 py-3.5"
      title={metric.unavailableReason ?? metric.formula}
    >
      <p className="text-xs font-medium text-foreground-muted">{metric.label}</p>

      {value === null ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-foreground-subtle">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground-subtle/50" />
          {NOT_CONNECTED_LABEL}
        </p>
      ) : (
        <p
          className={cn(
            'mt-3 font-semibold tracking-tight text-foreground',
            emphasis ? 'text-2xl' : 'text-xl',
          )}
        >
          {value}
        </p>
      )}

      <p className="mt-2 truncate text-[11px] text-foreground-subtle">{metric.formula}</p>
    </div>
  );
}
