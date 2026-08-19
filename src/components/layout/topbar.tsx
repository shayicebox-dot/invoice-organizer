import { Suspense } from "react";

import { FilterBar } from "@/components/layout/filter-bar";
import type { StoreOption } from "@/lib/view-params";

/**
 * One filter row above everything. The store and period selected here scope
 * every KPI, chart and table on the page below.
 */
export function Topbar({
  stores,
  organizationName,
  userName,
}: {
  stores: StoreOption[];
  organizationName: string;
  userName: string;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-line bg-surface/95 px-6 backdrop-blur">
      <Suspense fallback={<div className="h-8 w-[320px] rounded-[6px] bg-surface-sunken" />}>
        <FilterBar stores={stores} />
      </Suspense>

      <div className="flex items-center gap-3">
        <span className="hidden text-[12.5px] text-ink-muted lg:inline">{organizationName}</span>
        <span
          title={userName}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold uppercase text-ink-secondary"
        >
          {initials}
        </span>
      </div>
    </header>
  );
}
