// Profit math. Lives in one place so the dashboard, sync job, and AI prompt
// all share identical definitions.

export type LineCost = {
  unit_cost: number;
  pick_pack_cost: number;
  packaging_cost: number;
  shipping_cost: number;
  duties_pct: number;
};

export type ComputedLine = {
  revenue: number;
  cogs: number;
  profit: number;
};

export function lineEconomics(
  qty: number,
  unitPrice: number,
  discount: number,
  cost: LineCost,
): ComputedLine {
  const revenue = qty * unitPrice - discount;
  const baseCogs = qty * (cost.unit_cost + cost.pick_pack_cost + cost.packaging_cost);
  const duties = revenue * cost.duties_pct;
  const cogs = baseCogs + duties;
  const profit = revenue - cogs;
  return { revenue, cogs, profit };
}

// Shopify Payments fee (US default 2.9% + $0.30; tweak per store as needed).
export function paymentFees(total: number, gateway = "shopify_payments"): number {
  const table: Record<string, { pct: number; flat: number }> = {
    shopify_payments: { pct: 0.029, flat: 0.3 },
    stripe: { pct: 0.029, flat: 0.3 },
    paypal: { pct: 0.0349, flat: 0.49 },
    manual: { pct: 0, flat: 0 },
  };
  const r = table[gateway] || table.shopify_payments;
  return total * r.pct + r.flat;
}

// MER = total revenue / total ad spend across all channels.
export function mer(revenue: number, adSpend: number): number {
  if (adSpend <= 0) return 0;
  return revenue / adSpend;
}

// CAC = ad spend / new customers acquired.
export function cac(adSpend: number, newCustomers: number): number {
  if (newCustomers <= 0) return 0;
  return adSpend / newCustomers;
}

// Contribution margin %: (rev - variable cost) / rev.
export function contributionMargin(revenue: number, variableCost: number): number {
  if (revenue <= 0) return 0;
  return (revenue - variableCost) / revenue;
}

// Days of inventory left at current sell-through rate.
export function daysOfStock(onHand: number, avgDailyUnits: number): number | null {
  if (avgDailyUnits <= 0) return null;
  return Math.round(onHand / avgDailyUnits);
}

// Crude attribution: assign an order's slice of daily ad spend by channel weight.
// dailySpendByChannel must be in same currency as orderRevenue (usually USD).
export function attributedSpend(
  orderRevenue: number,
  channelRevenueTotal: number,
  channelSpendTotal: number,
): number {
  if (channelRevenueTotal <= 0) return 0;
  return (orderRevenue / channelRevenueTotal) * channelSpendTotal;
}
