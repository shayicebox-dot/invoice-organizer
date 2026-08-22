'use client';

import { usePathname } from 'next/navigation';
import { Menu, Search, Bell } from 'lucide-react';
import { findNavItemByPath } from '@/lib/config/navigation';
import { ThemeToggle } from '@/components/layout/theme-toggle';

type TopbarProps = {
  readonly onOpenSidebar: () => void;
};

export function Topbar({ onOpenSidebar }: TopbarProps) {
  const pathname = usePathname();
  const current = findNavItemByPath(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border-subtle bg-background/85 px-4 backdrop-blur-sm lg:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-surface text-foreground-muted transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
      >
        <Menu className="size-4" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {current?.label ?? 'ICEBOX OS'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-label="Search (not available yet)"
          className="hidden items-center gap-2 rounded-md border border-border-subtle bg-surface px-2.5 py-1.5 text-xs text-foreground-subtle md:flex"
        >
          <Search className="size-3.5" aria-hidden="true" />
          <span>Search</span>
          <kbd className="ml-4 rounded border border-border-subtle bg-surface-muted px-1 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          disabled
          aria-label="Notifications (not available yet)"
          className="flex size-8 items-center justify-center rounded-md border border-border-subtle bg-surface text-foreground-subtle"
        >
          <Bell className="size-4" aria-hidden="true" />
        </button>

        <ThemeToggle />

        <div className="ml-1 flex items-center gap-2 border-l border-border-subtle pl-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-[11px] font-medium text-foreground-muted">
            IX
          </span>
          <span className="hidden text-xs leading-tight sm:flex sm:flex-col">
            <span className="font-medium text-foreground">Not signed in</span>
            <span className="text-foreground-subtle">Auth not wired yet</span>
          </span>
        </div>
      </div>
    </header>
  );
}
