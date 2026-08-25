import type { WaterfallStep } from '@/core/metrics/profitability';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/**
 * The path from what customers paid to what the business kept.
 *
 * Each row states its own formula, and the running total is restated at every
 * subtotal, so a reader can follow the arithmetic down the page rather than
 * having to trust it. A step whose value is unknown breaks the chain honestly:
 * it and everything below it show a dash instead of carrying a wrong total
 * forward.
 */
export function ProfitWaterfall({ steps }: { readonly steps: readonly WaterfallStep[] }) {
  const magnitudes = steps
    .filter((step) => step.kind === 'deduction' && step.amount !== null)
    .map((step) => Math.abs(step.amount?.minorUnits ?? 0));
  const widest = Math.max(...magnitudes, 1);

  return (
    <ol className="flex flex-col">
      {steps.map((step) => {
        const isTotal = step.kind === 'total';
        const isSubtotal = step.kind === 'subtotal';
        const isStart = step.kind === 'start';
        const share =
          step.kind === 'deduction' && step.amount !== null
            ? Math.abs(step.amount.minorUnits) / widest
            : 0;

        return (
          <li
            key={step.id}
            className={cn(
              'flex flex-col gap-1 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4',
              isTotal
                ? 'border-t-2 border-border-strong'
                : isSubtotal || isStart
                  ? 'border-t border-border-strong'
                  : 'border-t border-border-subtle',
            )}
          >
            <div className="flex min-w-0 flex-1 items-baseline gap-2">
              <span
                aria-hidden="true"
                className={cn('w-3 shrink-0 text-xs', step.kind === 'deduction' ? 'text-foreground-subtle' : 'text-transparent')}
              >
                −
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm',
                    isTotal || isSubtotal ? 'font-medium text-foreground' : 'text-foreground-muted',
                  )}
                >
                  {step.label}
                </p>
                <p className="truncate text-[11px] text-foreground-subtle">{step.formula}</p>
              </div>
            </div>

            {/* A hairline bar sized to the deduction, so the big costs are
                visible at a glance without a chart library. */}
            <div className="hidden h-1 w-32 shrink-0 overflow-hidden rounded-full bg-surface-muted sm:block">
              {share > 0 ? (
                <div
                  className="h-full rounded-full bg-foreground-subtle/40"
                  style={{ width: `${Math.max(share * 100, 2)}%` }}
                />
              ) : null}
            </div>

            <p
              className={cn(
                'numeric shrink-0 text-sm sm:w-32 sm:text-right',
                isTotal
                  ? 'text-base font-semibold text-foreground'
                  : isSubtotal
                    ? 'font-medium text-foreground'
                    : 'text-foreground',
              )}
            >
              {step.amount === null ? (
                <span className="text-foreground-subtle">—</span>
              ) : (
                <>
                  {step.kind === 'deduction' ? '−' : ''}
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
