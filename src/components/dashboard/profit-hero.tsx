import type { Money } from '@/core/money';
import type { Delta } from '@/core/metrics/comparison';
import { DeltaBadge } from '@/components/dashboard/delta-badge';
import { NOT_CONNECTED_LABEL } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type SupportingStat = {
  readonly label: string;
  readonly value: string | null;
  readonly delta: Delta | null;
};

type ProfitHeroProps = {
  readonly netProfit: Money | null;
  readonly netProfitLabel: string | null;
  readonly netMarginLabel: string | null;
  readonly netProfitDelta: Delta | null;
  readonly netMarginDelta: Delta | null;
  readonly periodLabel: string;
  readonly supporting: readonly SupportingStat[];
};

/**
 * The one thing to read first: is the business making or losing money?
 *
 * There is exactly one hero figure on the dashboard, and this is it. Everything
 * beside it is deliberately a third of its size — a screen with two things
 * competing for first place has no first place.
 *
 * Profit or loss is carried by three channels at once, never by colour alone:
 * the word "profit" or "loss", the sign on the figure, and a restrained tint.
 * The tint is a wash, not a fill; a dashboard that turns red is harder to read
 * on the day it matters most.
 */
export function ProfitHero({
  netProfit,
  netProfitLabel,
  netMarginLabel,
  netProfitDelta,
  netMarginDelta,
  periodLabel,
  supporting,
}: ProfitHeroProps) {
  const losing = netProfit !== null && netProfit.minorUnits < 0;
  const known = netProfit !== null && netProfitLabel !== null;

  return (
    <section
      aria-label="Profitability"
      className={cn(
        'rounded-2xl border p-6 sm:p-8',
        known
          ? losing
            ? 'border-negative/20 bg-negative-muted'
            : 'border-positive/20 bg-positive-muted'
          : 'border-border-subtle bg-surface',
      )}
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-12">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
            {known ? (losing ? 'Net loss' : 'Net profit') : 'Net profit'}
            <span className="ml-2 font-normal normal-case tracking-normal text-foreground-subtle">
              {periodLabel}
            </span>
          </p>

          {/* Labelled "Net loss", so the figure is the magnitude. "Net loss
              −₪3,056" is a double negative and reads as a gain. */}
          {known ? (
            <p
              className={cn(
                // Proportional figures: tabular digits look loose at this size.
                'mt-2 text-[2.75rem] font-semibold leading-none tracking-tight sm:text-6xl',
                losing ? 'text-negative' : 'text-positive',
              )}
            >
              {netProfitLabel}
            </p>
          ) : (
            <p className="mt-3 flex items-center gap-2 text-base text-foreground-subtle">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-foreground-subtle/50" />
              {NOT_CONNECTED_LABEL}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="text-sm text-foreground-muted">
              {netMarginLabel === null ? 'Net margin unavailable' : `${netMarginLabel} net margin`}
            </p>
            <DeltaBadge delta={netMarginDelta} />
          </div>

          {netProfitDelta === null ? null : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-foreground-subtle">
              <DeltaBadge delta={netProfitDelta} />
              <span>vs the previous period</span>
            </p>
          )}
        </div>

        {/* Two columns on a phone so the break-even section stays close to the
            top of the page, where it can still be read at a glance. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 self-center sm:grid-cols-3">
          {supporting.map((stat) => (
            <div key={stat.label}>
              <dt className="text-xs font-medium text-foreground-muted">{stat.label}</dt>
              <dd className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                {stat.value ?? <span className="text-base font-normal text-foreground-subtle">—</span>}
              </dd>
              <DeltaBadge delta={stat.delta} className="mt-0.5" />
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
