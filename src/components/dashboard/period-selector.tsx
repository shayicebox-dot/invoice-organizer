import Link from 'next/link';
import type { Route } from 'next';
import { PERIOD_PRESETS, type PeriodPreset } from '@/core/period';
import { cn } from '@/lib/utils/cn';

type PeriodSelectorProps = {
  readonly active: PeriodPreset;
  /** The page the links point back at, so Sales and Products can reuse this. */
  readonly basePath: Route;
};

/**
 * Period switcher. Plain links carrying `?period=` so the page stays a Server
 * Component — no client JavaScript is needed to change the reporting range.
 */
export function PeriodSelector({ active, basePath }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Reporting period"
      className="inline-flex items-center gap-0.5 rounded-lg border border-border-subtle bg-surface p-0.5"
    >
      {PERIOD_PRESETS.map((preset) => {
        const isActive = preset.id === active;

        return (
          <Link
            key={preset.id}
            href={{ pathname: basePath, query: { period: preset.id } }}
            aria-current={isActive ? 'true' : undefined}
            className={cn(
              'rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isActive
                ? 'bg-accent-muted text-accent'
                : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
            )}
          >
            <span className="sm:hidden">{preset.shortLabel}</span>
            <span className="hidden sm:inline">{preset.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
