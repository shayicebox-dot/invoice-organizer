'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { BrandMark } from '@/components/layout/brand-mark';
import { SidebarNav } from '@/components/layout/sidebar-nav';
import { Topbar } from '@/components/layout/topbar';

type AppShellProps = {
  readonly children: ReactNode;
  /** Server-rendered sign-out control, handed down to the top bar. */
  readonly logoutSlot: ReactNode;
};

/**
 * Application chrome: fixed sidebar on desktop, slide-over drawer on mobile,
 * sticky top bar, and the scrolling content region.
 *
 * Layout only — it must never read data or compute anything financial.
 */
export function AppShell({ children, logoutSlot }: AppShellProps) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isSidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSidebarOpen]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border-subtle bg-surface lg:flex">
        <div className="flex h-14 items-center border-b border-border-subtle px-4">
          <BrandMark />
        </div>
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {isSidebarOpen ? (
        <div className="lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border-subtle bg-surface shadow-xl"
          >
            <div className="flex h-14 items-center justify-between border-b border-border-subtle px-4">
              <BrandMark />
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close navigation"
                className="flex size-8 items-center justify-center rounded-md text-foreground-muted hover:bg-surface-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
            <SidebarNav onNavigate={() => setSidebarOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} logoutSlot={logoutSlot} />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarFooter() {
  return (
    <div className="border-t border-border-subtle px-4 py-3">
      <p className="text-[11px] leading-relaxed text-foreground-subtle">
        Internal system · ILS · Israel
      </p>
    </div>
  );
}
