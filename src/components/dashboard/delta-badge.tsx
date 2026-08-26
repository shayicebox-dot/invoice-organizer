import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { Delta } from '@/core/metrics/comparison';
import { formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * Change against the previous period, stated quietly.
 *
 * The arrow shows the direction; the colour shows whether that direction is
 * good news. Those are not the same thing — a rising CPA and a rising revenue
 * both point up, and only one is worth being pleased about — so colour follows
 * the judgement the metric carries, never the arrow.
 *
 * Deliberately small and low-contrast: this is context for the figure above it,
 * not a figure of its own.
 */
export function DeltaBadge({
  delta,
  className,
}: {
  readonly delta: Delta | null;
  readonly className?: string;
}) {
  if (delta === null) return null;

  const Icon =
    delta.direction === 'up' ? ArrowUpRight : delta.direction === 'down' ? ArrowDownRight : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] leading-none',
        delta.judgement === 'good'
          ? 'text-positive'
          : delta.judgement === 'bad'
            ? 'text-negative'
            : 'text-foreground-subtle',
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      {delta.changeFraction === null ? (
        <span className="sr-only">
          {delta.direction === 'up' ? 'Higher than' : delta.direction === 'down' ? 'Lower than' : 'Unchanged from'} the
          previous period
        </span>
      ) : (
        <>
          <span aria-hidden="true">{formatPercent(Math.abs(delta.changeFraction), 0)}</span>
          <span className="sr-only">
            {formatPercent(Math.abs(delta.changeFraction), 0)}{' '}
            {delta.direction === 'up' ? 'higher' : delta.direction === 'down' ? 'lower' : 'change'} than the previous
            period
          </span>
        </>
      )}
    </span>
  );
}
