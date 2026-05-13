// Mock data so the UI is fully usable on first `npm run dev` — before any
// integrations are wired. Once /api/sync runs, real numbers replace these.

export const MOCK_OVERVIEW = {
  revenue: 184230,
  netProfit: 47215,
  grossMarginPct: 0.412,
  adSpend: 58940,
  mer: 3.12,
  roas: 3.12,
  aov: 86.4,
  orders: 2132,
  returningPct: 0.31,
  cac: 27.6,
  ordersToday: 64,
  profitToday: 1820,
};

const DAYS = 30;
const today = new Date();
function dayOffset(n: number) {
  const d = new Date(today);
  d.setDate(today.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export const MOCK_TREND = Array.from({ length: DAYS }, (_, i) => {
  const day = DAYS - 1 - i;
  const base = 4500 + Math.sin(i / 3) * 1200 + (Math.random() - 0.5) * 800;
  const spend = 1200 + Math.sin(i / 4) * 400 + (Math.random() - 0.5) * 250;
  const profit = base * (0.22 + Math.random() * 0.08) - spend * 0.05;
  return {
    date: dayOffset(day),
    revenue: Math.round(base + 1500),
    adSpend: Math.round(spend + 700),
    netProfit: Math.round(profit + 350),
  };
});

export const MOCK_PRODUCTS = [
  { title: "10-Pack Sneaker Box (Clear)", bundle: 10, units: 412, revenue: 32960, cogs: 18540, profit: 8920, margin: 0.27 },
  { title: "20-Pack Sneaker Box (Clear)", bundle: 20, units: 287, revenue: 45920, cogs: 23200, profit: 16240, margin: 0.354 },
  { title: "50-Pack Sneaker Box (Clear)", bundle: 50, units: 84, revenue: 31920, cogs: 14280, profit: 13104, margin: 0.41 },
  { title: "ICEBOX Display Stand", bundle: null, units: 156, revenue: 11700, cogs: 6240, profit: 3120, margin: 0.267 },
  { title: "BRUNO Heavy Hoodie — Black", bundle: null, units: 92, revenue: 8280, cogs: 4140, profit: 2484, margin: 0.30 },
  { title: "BRUNO Heavy Tee — White", bundle: null, units: 218, revenue: 8720, cogs: 4700, profit: 1808, margin: 0.207 },
  { title: "Sneaker Box Single (Test SKU)", bundle: 1, units: 38, revenue: 1140, cogs: 980, profit: -210, margin: -0.184 },
];

export const MOCK_ORDERS = Array.from({ length: 30 }, (_, i) => {
  const profitable = Math.random() > 0.18;
  const total = 40 + Math.random() * 220;
  const profit = profitable ? total * (0.15 + Math.random() * 0.25) : -(total * (0.05 + Math.random() * 0.2));
  const channels = ["meta", "google", "klaviyo", "organic", "direct"];
  return {
    id: `#${100432 + i}`,
    date: dayOffset(Math.floor(i / 3)),
    total: Math.round(total * 100) / 100,
    currency: i % 4 === 0 ? "ILS" : "USD",
    channel: channels[i % channels.length],
    campaign: i % 5 === 0 ? "Spring_Bundle_20Pack" : i % 3 === 0 ? "Brand_Search_US" : "—",
    returning: i % 4 === 0,
    profit: Math.round(profit * 100) / 100,
    margin: profit / total,
  };
});

export const MOCK_INSIGHTS = [
  {
    severity: "win",
    category: "product",
    title: "The 50-pack carries 41% margin — 1.5× your portfolio average",
    body: "84 units shipped at $380 AOV. Even after factoring duties and outbound freight, the 50-pack contributes $13.1k profit this month — the highest of any SKU.",
    action: "Reallocate 20% of 10-pack Meta spend toward 50-pack ASCs and test a 'volume saves' bundle landing page.",
  },
  {
    severity: "critical",
    category: "ad",
    title: "Meta 'Spring_Bundle_20Pack' is generating revenue but losing money",
    body: "Spent $3,140 for $7,820 attributed revenue (ROAS 2.49). After 28% COGS, $14 shipping/order and 2.9% fees, contribution is −$120. The campaign optimized off purchases, not profit.",
    action: "Pause the broad audience set; keep the bundle-page retargeter (4.1x ROAS) and add value-based optimization.",
  },
  {
    severity: "warn",
    category: "shipping",
    title: "Shipping costs are eating 14.2% of revenue this week (up from 11.1%)",
    body: "ShipBob US carrier surcharges plus a higher share of 10-pack orders going via 3-day air. The 10-pack is $4.20 less profitable per order than 30 days ago.",
    action: "Default 10-pack to ground unless customer pays for expedited; renegotiate ShipBob rate card for boxes >18\" long.",
  },
  {
    severity: "info",
    category: "customer",
    title: "Returning customers are 3.1× more profitable than first-timers",
    body: "Avg returning order profit: $34.20 vs $11.05 for new. They skip discount codes 62% more often and trend toward the 20- and 50-pack.",
    action: "Move 15% of acquisition budget into a Klaviyo win-back flow targeted at 60–120 day lapsed buyers.",
  },
  {
    severity: "warn",
    category: "cash",
    title: "20-pack will stock out in ~18 days at current pace",
    body: "On-hand 287 units, 30-day velocity 16/day. Lead time from supplier is 32 days — you'll be 14 days out of stock if you reorder today.",
    action: "Place a 600-unit PO this week and bump retail $4 to slow velocity until restock.",
  },
];

export const MOCK_CAMPAIGNS = [
  { platform: "meta", name: "ASC_Catalog_US", spend: 12420, revenue: 41680, roas: 3.36, profit: 9120 },
  { platform: "meta", name: "Spring_Bundle_20Pack", spend: 3140, revenue: 7820, roas: 2.49, profit: -120 },
  { platform: "google", name: "Brand_Search_US", spend: 1840, revenue: 18420, roas: 10.0, profit: 7240 },
  { platform: "google", name: "Shopping_Bundles", spend: 4220, revenue: 13180, roas: 3.12, profit: 3120 },
  { platform: "klaviyo", name: "Abandoned Cart Flow", spend: 0, revenue: 9420, roas: Infinity, profit: 4180 },
  { platform: "klaviyo", name: "Welcome Flow", spend: 0, revenue: 6180, roas: Infinity, profit: 2740 },
];

export const MOCK_INVENTORY = [
  { product: "10-Pack Sneaker Box", onHand: 1820, velocity: 13.7, daysLeft: 132, value: 24570 },
  { product: "20-Pack Sneaker Box", onHand: 287, velocity: 16.0, daysLeft: 18, value: 11480 },
  { product: "50-Pack Sneaker Box", onHand: 124, velocity: 2.8, daysLeft: 44, value: 12400 },
  { product: "ICEBOX Display Stand", onHand: 412, velocity: 5.2, daysLeft: 79, value: 8240 },
  { product: "BRUNO Heavy Hoodie — Black", onHand: 28, velocity: 3.1, daysLeft: 9, value: 1120 },
];

export const MOCK_CUSTOMERS = [
  { email: "j.lee@gmail.com", orders: 14, ltv: 1240, profit: 412, lastOrder: "2026-05-08", vip: 92 },
  { email: "marco@nyc.com", orders: 9, ltv: 880, profit: 318, lastOrder: "2026-05-11", vip: 84 },
  { email: "noa.cohen@gmail.com", orders: 11, ltv: 720, profit: 256, lastOrder: "2026-05-12", vip: 78 },
  { email: "tom_b@yahoo.com", orders: 6, ltv: 540, profit: 180, lastOrder: "2026-04-29", vip: 64 },
  { email: "alex.k@protonmail.com", orders: 4, ltv: 420, profit: 92, lastOrder: "2026-05-01", vip: 51 },
];
