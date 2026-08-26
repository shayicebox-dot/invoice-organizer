import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { BreakEven } from '@/core/metrics/breakeven';
import { cpaBarFill, roasBarFill } from '@/core/metrics/breakeven';
import type { Delta } from '@/core/metrics/comparison';
import { DeltaBadge } from '@/components/dashboard/delta-badge';
import { formatMoney, formatMultiple, formatPercent } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type BreakEvenSectionProps = {
  readonly breakEven: BreakEven;
  readonly cpaDelta: Delta | null;
  readonly roasDelta: Delta | null;
};

/**
 * Whether marketing is paying for itself.
 *
 * Break-even is the line between the two states a business can be in, so it is
 * drawn as a line: a track with a marker at break-even and a fill showing where
 * the period actually landed. Under budget the fill stops short of the marker;
 * over budget it runs past it. The state is legible before any number is read.
 *
 * The figures behind it are exact — `net profit = orders × (break-even CPA −
 * actual CPA)` — so the gap shown here multiplied by the order count is the
 * profit or loss in the hero above. The two cannot disagree.
 */
/** Where break-even sits along the track, as a percentage of its width. */
const BREAK_EVEN_MARK = 70;

export function BreakEvenSection({ breakEven, cpaDelta, roasDelta }: BreakEvenSectionProps) {
  if (breakEven.status === 'unavailable') {
    return (
      <section aria-label="Break-even" className="rounded-2xl border border-border-subtle bg-surface p-6">
        <h2 className="text-sm font-medium text-foreground">Break-even</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Break-even needs orders, ad spend and the full cost model for this period. One of them is
          not available yet.
        </p>
      </section>
    );
  }

  if (breakEven.status === 'unreachable') {
    return (
      <section
        aria-label="Break-even"
        className="rounded-2xl border border-negative/20 bg-negative-muted p-6"
      >
        <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AlertTriangle className="size-4 text-negative" aria-hidden="true" />
          No advertising budget breaks even
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-foreground-muted">
          Contribution profit does not cover fixed expenses, so this period loses money even with no
          advertising at all. Cutting ad spend alone would not make it profitable.
        </p>
      </section>
    );
  }

  const over = breakEven.status === 'below';

  return (
    <section aria-label="Break-even" className="rounded-2xl border border-border-subtle bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Break-even</h2>
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs font-medium',
            over ? 'text-negative' : 'text-positive',
          )}
        >
          {over ? (
            <AlertTriangle className="size-3.5" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-3.5" aria-hidden="true" />
          )}
          {over ? 'Spending above break-even' : 'Spending within break-even'}
        </p>
      </div>

      <div className="mt-5 grid gap-8 md:grid-cols-2 md:gap-12">
        <Gauge
          title="Cost per order"
          actualLabel="Actual CPA"
          actual={breakEven.actualCpa === null ? null : formatMoney(breakEven.actualCpa)}
          targetLabel="Break-even CPA"
          target={breakEven.breakEvenCpa === null ? null : formatMoney(breakEven.breakEvenCpa)}
          fill={cpaBarFill(breakEven)}
          over={over}
          delta={cpaDelta}
          verdict={
            breakEven.cpaHeadroom === null
              ? null
              : over
                ? `${formatMoney(negate(breakEven.cpaHeadroom))} above break-even`
                : `${formatMoney(breakEven.cpaHeadroom)} of headroom per order`
          }
        />

        <Gauge
          title="Return on ad spend"
          actualLabel="Actual ROAS"
          actual={breakEven.actualRoas === null ? null : formatMultiple(breakEven.actualRoas)}
          targetLabel="Break-even ROAS"
          target={breakEven.breakEvenRoas === null ? null : formatMultiple(breakEven.breakEvenRoas)}
          fill={roasBarFill(breakEven)}
          over={over}
          delta={roasDelta}
          verdict={
            breakEven.roasImprovementRequired === null
              ? over
                ? null
                : 'Already at or above break-even'
              : `${formatPercent(breakEven.roasImprovementRequired, 0)} improvement needed to break even`
          }
        />
      </div>
    </section>
  );
}

type GaugeProps = {
  readonly title: string;
  readonly actualLabel: string;
  readonly actual: string | null;
  readonly targetLabel: string;
  readonly target: string | null;
  /** Ratio of actual to break-even; 1 sits exactly on the marker. */
  readonly fill: number | null;
  readonly over: boolean;
  readonly verdict: string | null;
  readonly delta: Delta | null;
};

/**
 * One comparison against break-even.
 *
 * The track is a lighter step of the fill's own colour so the state reads across
 * the whole bar, and the break-even marker sits at the end rather than floating
 * mid-track — the question is "did it reach the line", and the line is the end.
 */
function Gauge({ title, actualLabel, actual, targetLabel, target, fill, over, verdict, delta }: GaugeProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">{title}</p>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{actual ?? '—'}</p>
        <DeltaBadge delta={delta} />
      </div>

      <div className="mt-3">
        {/* Break-even sits at a fixed point on the track, not at its end, so a
            fill that stops short and a fill that runs past are told apart at a
            glance — in both gauges, whichever direction is the good one. */}
        <div
          className={cn(
            'relative h-1.5 w-full rounded-full',
            over ? 'bg-negative/15' : 'bg-positive/15',
          )}
          role="img"
          aria-label={`${actualLabel} ${actual ?? 'unavailable'}, ${targetLabel} ${target ?? 'unavailable'}`}
        >
          {fill === null ? null : (
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full',
                over ? 'bg-negative' : 'bg-positive',
              )}
              style={{ width: `${Math.min(Math.max(fill * BREAK_EVEN_MARK, 2), 100)}%` }}
            />
          )}
          <span
            aria-hidden="true"
            className="absolute inset-y-[-3px] w-px bg-foreground-subtle/60"
            style={{ left: `${BREAK_EVEN_MARK}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-baseline justify-between gap-4 text-[11px]">
          <span className="text-foreground-subtle">{actualLabel}</span>
          <span className="numeric text-foreground-muted">
            {targetLabel} {target ?? '—'}
          </span>
        </div>
      </div>

      {verdict === null ? null : (
        <p className={cn('mt-2 text-xs font-medium', over ? 'text-negative' : 'text-positive')}>
          {verdict}
        </p>
      )}
    </div>
  );
}

function negate(amount: { readonly minorUnits: number; readonly currency: 'ILS' | 'USD' | 'EUR' }) {
  return { ...amount, minorUnits: -amount.minorUnits };
}
