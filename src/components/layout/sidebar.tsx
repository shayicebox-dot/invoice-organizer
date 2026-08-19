"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

import { cn } from "@/lib/cn";
import { NAV_ITEMS, type NavIcon } from "@/lib/nav";
import {
  ConnectionsIcon,
  ExpensesIcon,
  MarketingIcon,
  OrdersIcon,
  OverviewIcon,
  ProductsIcon,
  ProfitIcon,
  SettingsIcon,
  StoresIcon,
} from "@/components/ui/icons";

const ICONS: Record<NavIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  overview: OverviewIcon,
  profit: ProfitIcon,
  marketing: MarketingIcon,
  orders: OrdersIcon,
  products: ProductsIcon,
  expenses: ExpensesIcon,
  connections: ConnectionsIcon,
  stores: StoresIcon,
  settings: SettingsIcon,
};

/**
 * The filter state lives in the query string, so every nav link carries the
 * current store and period forward instead of resetting the view.
 */
export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const query = search ? `?${search}` : "";

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 flex h-screen w-[228px] shrink-0 flex-col border-r border-line bg-surface"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
        <span
          aria-hidden
          className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-ink text-[11px] font-semibold text-white"
        >
          P
        </span>
        <span className="text-[13.5px] font-semibold tracking-tight text-ink">Ecom P&amp;L</span>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={`${item.href}${query}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-[6px] px-2.5 py-[7px] text-[13px] transition-colors",
                  isActive
                    ? "bg-surface-sunken font-medium text-ink"
                    : "text-ink-secondary hover:bg-surface-muted hover:text-ink",
                )}
              >
                <Icon className={isActive ? "text-ink" : "text-ink-muted"} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line px-4 py-3">
        <p className="text-[11px] leading-4 text-ink-muted">
          Demo data. No provider is connected yet — see{" "}
          <Link
            href={`/connections${query}`}
            className="text-ink-secondary underline underline-offset-2"
          >
            Connections
          </Link>
          .
        </p>
      </div>
    </nav>
  );
}
