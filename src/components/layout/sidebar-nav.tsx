'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_SECTIONS } from '@/lib/config/navigation';
import { isIsoDate } from '@/core/period';
import { cn } from '@/lib/utils/cn';

type SidebarNavProps = {
  /** Called after a navigation click — used to close the mobile drawer. */
  readonly onNavigate?: () => void;
};

export function SidebarNav({ onNavigate = () => {} }: SidebarNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Carry the selected period across navigation.
   *
   * Without this, moving from the dashboard to Sales would drop `?from=&to=`
   * and quietly reset the range to the default — so two screens the reader
   * believes are showing the same period would not be. The dates are validated
   * again on the server; this only decides whether to pass them along.
   */
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const periodQuery =
    from !== null && to !== null && isIsoDate(from) && isIsoDate(to) ? { from, to } : undefined;

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-subtle">
            {section.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.id}>
                  <Link
                    href={
                      periodQuery === undefined
                        ? item.href
                        : { pathname: item.href, query: periodQuery }
                    }
                    onClick={onNavigate}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      isActive
                        ? 'bg-accent-muted font-medium text-accent'
                        : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
                    )}
                  >
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        isActive ? 'text-accent' : 'text-foreground-subtle group-hover:text-foreground-muted',
                      )}
                      aria-hidden="true"
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
