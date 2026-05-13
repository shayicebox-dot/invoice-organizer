"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Boxes,
  Sparkles,
  Megaphone,
  Users,
  Settings,
} from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/products", label: "Products", icon: Package },
  { href: "/orders", label: "Orders", icon: ShoppingBag },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/insights", label: "AI Insights", icon: Sparkles },
];

export function Sidebar() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen flex-col border-r border-border bg-bg-elev">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="h-2 w-2 rounded-full bg-accent shadow-glow" />
        <span className="text-sm font-semibold tracking-tight">Profit OS</span>
      </div>
      <nav className="flex-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-bg-card text-ink"
                  : "text-ink-muted hover:bg-bg-card hover:text-ink",
              )}
            >
              <Icon className={clsx("h-4 w-4", active ? "text-accent" : "text-ink-dim")} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-bg-card hover:text-ink"
        >
          <Settings className="h-4 w-4 text-ink-dim" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
