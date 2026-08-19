/** Sidebar routes, in display order. */
export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/profit-and-loss", label: "Profit & Loss", icon: "profit" },
  { href: "/marketing", label: "Marketing", icon: "marketing" },
  { href: "/orders", label: "Orders", icon: "orders" },
  { href: "/products", label: "Products", icon: "products" },
  { href: "/expenses", label: "Expenses", icon: "expenses" },
  { href: "/connections", label: "Connections", icon: "connections" },
  { href: "/stores", label: "Stores", icon: "stores" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export type NavItem = (typeof NAV_ITEMS)[number];
export type NavIcon = NavItem["icon"];
