import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingCart,
  Megaphone,
  Package,
  Receipt,
  Settings,
} from 'lucide-react';

export type NavItem = {
  /** Stable key used for tests and analytics. */
  readonly id: string;
  readonly label: string;
  readonly href: Route;
  readonly icon: LucideIcon;
  /** One-line description of what the module will own. */
  readonly description: string;
};

export type NavSection = {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
};

/**
 * Single source of truth for application navigation.
 * Adding a module means adding it here plus its route folder — nothing else.
 *
 * Inventory, VAT, Taxes and Cash Flow are deliberately absent from the MVP.
 * They return when there is real data behind them.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        description: 'Company-wide financial overview across every connected source.',
      },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    items: [
      {
        id: 'sales',
        label: 'Sales',
        href: '/sales',
        icon: ShoppingCart,
        description: 'Orders, revenue, discounts and refunds by day, channel and SKU.',
      },
      {
        id: 'marketing',
        label: 'Marketing',
        href: '/marketing',
        icon: Megaphone,
        description: 'Meta and Google ad spend measured against revenue and profit.',
      },
      {
        id: 'products',
        label: 'Products',
        href: '/products',
        icon: Package,
        description: 'Product catalogue, unit costs and per-SKU profitability.',
      },
      {
        id: 'expenses',
        label: 'Expenses',
        href: '/expenses',
        icon: Receipt,
        description: 'Fixed and variable operating expenses, with source documents.',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: Settings,
        description: 'Business profile, cost assumptions, data sources and users.',
      },
    ],
  },
] as const;

export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export function findNavItemByPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
