import type { WaterfallStep } from '@/core/metrics/profitability';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * The path from what customers paid to what the business kept.
 *
 * Read top to bottom: each deduction is a bar whose width is its size against
 * the largest deduction, so the costs that matter are obvious before any figure
 * is read. Subtotals break the rhythm with a rule and heavier type; the final
 * net profit is set apart entirely, because it is the answer the rest of the
 * page is working towards.
 *
 * A step whose value is unknown shows a dash and does not carry a running total
 * forward — an honest break in the chain rather than a plausible wrong number.
 */
export function ProfitWaterfall({ steps }: { readonly steps: readonly WaterfallStep[] }) {
  const widest = Math.max(
    ...steps
      .filter((step) => step.kind === 'deduction' && step.amount !== null)
      .map((step) => Math.abs(step.amount?.minorUnits ?? 0)),
    1,
  );

  return (
    <ol className="flex flex-col">
      {steps.map((step) => {
        const isTotal = step.kind === 'total';
        const isSubtotal = step.kind === 'subtotal';
        const isStart = step.kind === 'start';
        const isDeduction = step.kind === 'deduction';
        const negative = isTotal && (step.amount?.minorUnits ?? 0) < 0;

        const share =
          isDeduction && step.amount !== null ? Math.abs(step.amount.minorUnits) / widest : 0;

        return (
          <li
            key={step.id}
            className={cn(
              'grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_8rem_auto]',
              isTotal
                ? 'mt-2 border-t-2 border-border-strong pt-4'
                : isSubtotal || isStart
                  ? 'mt-1 border-t border-border-strong pt-3'
                  : 'border-t border-border-subtle py-2.5',
              isSubtotal || isStart ? 'pb-2' : '',
            )}
          >
            <div className="flex min-w-0 items-baseline gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'w-2.5 shrink-0 text-xs',
                  isDeduction ? 'text-foreground-subtle' : 'text-transparent',
                )}
              >
                −
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    isTotal
                      ? 'text-base font-semibold text-foreground'
                      : isSubtotal || isStart
                        ? 'text-sm font-medium text-foreground'
                        : 'text-sm text-foreground-muted',
                  )}
                >
                  {step.label}
                </p>
                <p className="truncate text-[11px] leading-tight text-foreground-subtle">
                  {step.formula}
                </p>
              </div>
            </div>

            {/* Sized against the largest deduction, so the costs that actually
                move net profit stand out without a chart library. */}
            <div className="hidden h-1 self-center overflow-hidden rounded-full bg-surface-muted sm:block">
              {share > 0 ? (
                <div
                  className="h-full rounded-full bg-foreground-subtle/35"
                  style={{ width: `${Math.max(share * 100, 3)}%` }}
                />
              ) : null}
            </div>

            <p
              className={cn(
                'numeric shrink-0 text-right tabular-nums',
                isTotal
                  ? cn('text-xl font-semibold', negative ? 'text-negative' : 'text-positive')
                  : isSubtotal || isStart
                    ? 'text-sm font-medium text-foreground'
                    : 'text-sm text-foreground',
              )}
            >
              {step.amount === null ? (
                <span className="text-foreground-subtle">—</span>
              ) : (
                <>
                  {isDeduction ? '−' : ''}
                  {formatMoney(step.amount)}
                </>
              )}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
