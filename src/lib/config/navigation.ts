import type { Route } from 'next';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Megaphone,
  Receipt,
  Percent,
  Landmark,
  Wallet,
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
    id: 'commerce',
    label: 'Commerce',
    items: [
      {
        id: 'sales',
        label: 'Sales',
        href: '/sales',
        icon: ShoppingCart,
        description: 'Orders, revenue, discounts and refunds by day, channel and SKU.',
      },
      {
        id: 'products',
        label: 'Products',
        href: '/products',
        icon: Package,
        description: 'Product catalogue, unit costs and per-SKU profitability.',
      },
      {
        id: 'inventory',
        label: 'Inventory',
        href: '/inventory',
        icon: Boxes,
        description: 'Stock on hand, inventory valuation and cost of goods movement.',
      },
    ],
  },
  {
    id: 'spend',
    label: 'Spend',
    items: [
      {
        id: 'marketing',
        label: 'Marketing',
        href: '/marketing',
        icon: Megaphone,
        description: 'Meta, Google and total marketing spend against contribution profit.',
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
    id: 'compliance',
    label: 'Compliance',
    items: [
      {
        id: 'vat',
        label: 'VAT',
        href: '/vat',
        icon: Percent,
        description: 'Output VAT, deductible input VAT and estimated VAT payable.',
      },
      {
        id: 'taxes',
        label: 'Taxes',
        href: '/taxes',
        icon: Landmark,
        description: 'Estimated corporate tax and net profit after tax.',
      },
      {
        id: 'cash-flow',
        label: 'Cash Flow',
        href: '/cash-flow',
        icon: Wallet,
        description: 'Cash in, cash out and runway across all accounts.',
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
        description: 'Business profile, fiscal configuration, users and data sources.',
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
