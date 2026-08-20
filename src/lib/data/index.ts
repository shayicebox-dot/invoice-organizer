/**
 * Data access layer.
 *
 * This module is the seam between the UI and the data source. Every screen
 * calls one of the `get*` functions below and never touches the generator
 * directly. When Supabase is wired up, these functions become queries against
 * the tables in `docs/schema.sql` and nothing above this file changes.
 *
 * The functions are synchronous today because the mock data is in memory. They
 * are all `async` so the call sites already await, which keeps the swap to real
 * I/O a one-file change.
 */

import "server-only";

import { type DailyFinancials, type PeriodSummary, summarize } from "../finance";
import { type Money, ZERO, add, ratio, sum } from "../money";
import { type DateRange, today } from "../date-range";
import type {
  Connection,
  ISODate,
  Expense,
  MarketingChannel,
  MarketingSpendDaily,
  Order,
  OrderItem,
  Product,
  Refund,
  Store,
} from "../types";
import {
  CONNECTIONS,
  FIXED_EXPENSES,
  ORGANIZATION,
  PRODUCTS,
  STORES,
  catalogForStore,
} from "./catalog";
import { type MockDataset, generateDataset, mergeDailySeries } from "./generate";
import {
  type ShopifyStatus,
  applyShopifySales,
  loadShopifySales,
  probeShopifyStatus,
} from "./live-shopify";
import {
  type MetaStatus,
  applyMetaSpend,
  loadMetaSpend,
  probeMetaStatus,
} from "./live-meta";
import {
  type GoogleAdsStatus,
  applyGoogleAdsSpend,
  loadGoogleAdsMetrics,
  probeGoogleAdsStatus,
} from "./live-google-ads";
import {
  type BusinessCostStatus,
  type HistoricalMapping,
  applyBusinessCosts,
  loadHistoricalMapping,
} from "./live-costs";

export const ALL_STORES = "all" as const;

/** The store selector value: a store id, or "all". */
export type StoreScope = string;

let cache: MockDataset | null = null;

/**
 * Build the dataset once per process. Keyed on the anchor date so a long-lived
 * server picks up a new day rather than serving stale history.
 */
function dataset(): MockDataset {
  const anchor = today();
  if (!cache || cache.generatedFor !== anchor) {
    cache = generateDataset(anchor);
  }
  return cache;
}

export async function getOrganization() {
  return ORGANIZATION;
}

export async function getStores(): Promise<Store[]> {
  return STORES;
}

export async function getConnections(): Promise<Connection[]> {
  return CONNECTIONS;
}

/** Resolve a selector value to the store ids it covers. */
export function resolveScope(scope: StoreScope): string[] {
  if (scope === ALL_STORES) return STORES.map((store) => store.id);
  const match = STORES.find((store) => store.id === scope);
  return match ? [match.id] : STORES.map((store) => store.id);
}

export function normalizeScope(scope: string | undefined): StoreScope {
  if (!scope || scope === ALL_STORES) return ALL_STORES;
  return STORES.some((store) => store.id === scope) ? scope : ALL_STORES;
}

export function scopeLabel(scope: StoreScope): string {
  if (scope === ALL_STORES) return "All Stores";
  return STORES.find((store) => store.id === scope)?.name ?? "All Stores";
}

/** Daily P&L rows for a scope and an inclusive date window, oldest first. */
export async function getDailyFinancials(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<DailyFinancials[]> {
  const data = dataset();
  const storeIds = resolveScope(scope);
  const dates = data.dates.filter((date) => date >= start && date <= end);
  if (dates.length === 0) return [];

  const series = storeIds
    .map((storeId) => data.dailyByStore.get(storeId) ?? [])
    .map((days) => days.filter((day) => day.date >= start && day.date <= end));

  return mergeDailySeries(series, dates);
}

/** Totals for a range, plus the same totals for the preceding equal window. */
export interface RangeReport {
  range: DateRange;
  days: DailyFinancials[];
  summary: PeriodSummary;
  previous: PeriodSummary;
}

export async function getRangeReport(
  scope: StoreScope,
  range: DateRange,
  previousWindow: { start: ISODate; end: ISODate },
): Promise<RangeReport> {
  const [days, previousDays] = await Promise.all([
    getDailyFinancials(scope, range.start, range.end),
    getDailyFinancials(scope, previousWindow.start, previousWindow.end),
  ]);

  return {
    range,
    days,
    summary: summarize(days),
    previous: summarize(previousDays),
  };
}

/** Trailing `days` of daily records ending at `end`, for trend charts. */
export async function getTrailingDays(
  scope: StoreScope,
  end: ISODate,
  days: number,
): Promise<DailyFinancials[]> {
  const data = dataset();
  const available = data.dates.filter((date) => date <= end);
  const window = available.slice(-days);
  if (window.length === 0) return [];
  return getDailyFinancials(scope, window[0], window[window.length - 1]);
}

export interface OrderWithItems {
  order: Order;
  items: OrderItem[];
  cogs: Money;
  /** Gross sales less discounts, COGS, shipping and processing fees. */
  contribution: Money;
}

/** Recent orders for a scope and window, newest first. */
export async function getOrders(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
  limit = 50,
): Promise<OrderWithItems[]> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of data.orderItems) {
    const bucket = itemsByOrder.get(item.orderId);
    if (bucket) bucket.push(item);
    else itemsByOrder.set(item.orderId, [item]);
  }

  const results: OrderWithItems[] = [];
  for (const order of data.orders) {
    if (results.length >= limit) break;
    if (!storeIds.has(order.storeId)) continue;
    if (order.date < start || order.date > end) continue;

    const items = itemsByOrder.get(order.id) ?? [];
    const cogs = sum(items.map((item) => (item.unitCost * item.quantity) as Money));
    const contribution = (order.grossSales -
      order.discounts -
      cogs -
      order.shippingCost -
      order.paymentFees) as Money;

    results.push({ order, items, cogs, contribution });
  }

  return results;
}

export async function getRefunds(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
  limit = 50,
): Promise<Refund[]> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));
  return data.refunds
    .filter((refund) => storeIds.has(refund.storeId) && refund.date >= start && refund.date <= end)
    .slice(0, limit);
}

export interface ChannelPerformance {
  channel: MarketingChannel;
  label: string;
  spend: Money;
  impressions: number;
  clicks: number;
  attributedConversions: number;
  attributedRevenue: Money;
  /** Attributed revenue ÷ spend, as the platform reports it. */
  platformRoas: number | null;
  /** Share of total marketing spend. */
  shareOfSpend: number | null;
  /** Cost per click. `null` when the channel had no clicks. */
  cpc: Money | null;
  /** Clicks ÷ impressions. */
  ctr: number | null;
  /** Whether these figures came from the provider or the mock generator. */
  source: "live" | "mock";
}

export const CHANNEL_LABELS: Record<MarketingChannel, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  klaviyo: "Klaviyo",
  omnisend: "Omnisend",
  mailchimp: "Mailchimp",
};

export async function getChannelPerformance(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<ChannelPerformance[]> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));
  const rows = data.marketingSpend.filter(
    (row) => storeIds.has(row.storeId) && row.date >= start && row.date <= end,
  );

  const byChannel = new Map<MarketingChannel, ChannelPerformance>();
  for (const row of rows) {
    const existing = byChannel.get(row.channel) ?? {
      channel: row.channel,
      label: CHANNEL_LABELS[row.channel],
      spend: ZERO,
      impressions: 0,
      clicks: 0,
      attributedConversions: 0,
      attributedRevenue: ZERO,
      platformRoas: null,
      shareOfSpend: null,
      cpc: null,
      ctr: null,
      source: "mock",
    };
    existing.spend = add(existing.spend, row.spend);
    existing.impressions += row.impressions;
    existing.clicks += row.clicks;
    existing.attributedConversions += row.attributedConversions;
    existing.attributedRevenue = add(existing.attributedRevenue, row.attributedRevenue);
    byChannel.set(row.channel, existing);
  }

  return finalizeChannels([...byChannel.values()]);
}

/** Derive the ratios every channel row shows, from whatever totals it holds. */
function finalizeChannels(channels: ChannelPerformance[]): ChannelPerformance[] {
  const totalSpend = sum(channels.map((channel) => channel.spend));

  for (const channel of channels) {
    channel.platformRoas = ratio(channel.attributedRevenue, channel.spend);
    channel.shareOfSpend = totalSpend === 0 ? null : channel.spend / totalSpend;
    channel.cpc = channel.clicks > 0 ? (Math.round(channel.spend / channel.clicks) as Money) : null;
    channel.ctr = channel.impressions > 0 ? channel.clicks / channel.impressions : null;
  }

  return channels.sort((a, b) => b.spend - a.spend);
}

export async function getMarketingSpendRows(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<MarketingSpendDaily[]> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));
  return data.marketingSpend.filter(
    (row) => storeIds.has(row.storeId) && row.date >= start && row.date <= end,
  );
}

export interface ProductPerformance {
  product: Product;
  storeName: string;
  unitsSold: number;
  revenue: Money;
  cogs: Money;
  grossProfit: Money;
  grossMargin: number | null;
  unitCost: Money;
}

export async function getProductPerformance(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<ProductPerformance[]> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));

  const ordersInRange = new Map<string, Order>();
  for (const order of data.orders) {
    if (!storeIds.has(order.storeId)) continue;
    if (order.date < start || order.date > end) continue;
    ordersInRange.set(order.id, order);
  }

  const totals = new Map<string, { units: number; revenue: Money; cogs: Money }>();
  for (const item of data.orderItems) {
    if (!ordersInRange.has(item.orderId)) continue;
    const entry = totals.get(item.productId) ?? { units: 0, revenue: ZERO, cogs: ZERO };
    entry.units += item.quantity;
    entry.revenue = add(entry.revenue, (item.unitPrice * item.quantity) as Money);
    entry.cogs = add(entry.cogs, (item.unitCost * item.quantity) as Money);
    totals.set(item.productId, entry);
  }

  return PRODUCTS.filter((product) => storeIds.has(product.storeId))
    .map((product) => {
      const entry = totals.get(product.id) ?? { units: 0, revenue: ZERO, cogs: ZERO };
      const grossProfit = (entry.revenue - entry.cogs) as Money;
      const catalogEntry = catalogForStore(product.storeId).find(
        (candidate) => candidate.product.id === product.id,
      );
      const unitCost = catalogEntry?.costs.at(-1)?.unitCost ?? ZERO;
      return {
        product,
        storeName: STORES.find((store) => store.id === product.storeId)?.name ?? "—",
        unitsSold: entry.units,
        revenue: entry.revenue,
        cogs: entry.cogs,
        grossProfit,
        grossMargin: ratio(grossProfit, entry.revenue),
        unitCost,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface ExpenseBreakdownRow {
  name: string;
  category: Expense["category"];
  type: Expense["type"];
  storeName: string;
  amount: Money;
  /** Share of all expenses in the range. */
  share: number | null;
}

/**
 * Variable expenses summed from dated records, plus the allocated share of
 * each fixed expense for the same window.
 */
export async function getExpenseBreakdown(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<{ variable: ExpenseBreakdownRow[]; fixed: ExpenseBreakdownRow[]; total: Money }> {
  const data = dataset();
  const storeIds = new Set(resolveScope(scope));

  const variableTotals = new Map<string, ExpenseBreakdownRow>();
  for (const expense of data.variableExpenses) {
    if (expense.storeId && !storeIds.has(expense.storeId)) continue;
    if (expense.date < start || expense.date > end) continue;
    const key = `${expense.name}:${expense.storeId ?? "org"}`;
    const existing = variableTotals.get(key) ?? {
      name: expense.name,
      category: expense.category,
      type: expense.type,
      storeName: expense.storeId
        ? (STORES.find((store) => store.id === expense.storeId)?.name ?? "—")
        : "All stores",
      amount: ZERO,
      share: null,
    };
    existing.amount = add(existing.amount, expense.amount);
    variableTotals.set(key, existing);
  }

  // Fixed expenses are reported at their allocated daily share for the window.
  const days = await getDailyFinancials(scope, start, end);
  const allocatedFixed = sum(days.map((day) => day.fixedExpenses));

  const fixedRows: ExpenseBreakdownRow[] = [];
  const applicable = FIXED_EXPENSES.filter(
    (expense) => expense.storeId === null || storeIds.has(expense.storeId),
  );
  const applicableTotal = sum(applicable.map((expense) => expense.amount));

  for (const expense of applicable) {
    const share = applicableTotal === 0 ? 0 : expense.amount / applicableTotal;
    fixedRows.push({
      name: expense.name,
      category: expense.category,
      type: expense.type,
      storeName: expense.storeId
        ? (STORES.find((store) => store.id === expense.storeId)?.name ?? "—")
        : "All stores",
      amount: Math.round(allocatedFixed * share) as Money,
      share: null,
    });
  }

  const variableRows = [...variableTotals.values()].sort((a, b) => b.amount - a.amount);
  fixedRows.sort((a, b) => b.amount - a.amount);

  const total = add(
    sum(variableRows.map((row) => row.amount)),
    sum(fixedRows.map((row) => row.amount)),
  );

  for (const row of [...variableRows, ...fixedRows]) {
    row.share = total === 0 ? null : row.amount / total;
  }

  return { variable: variableRows, fixed: fixedRows, total };
}

// ---------------------------------------------------------------------------
// Live Shopify variants
//
// These sit alongside the mock readers rather than replacing them. Only the
// Overview and Connections pages call them, so every other screen keeps
// reading pure mock data until its own integration lands.
// ---------------------------------------------------------------------------

/** The live-source state behind a set of daily records. */
export interface LiveSourceStatus {
  shopify: ShopifyStatus;
  meta: MetaStatus;
  googleAds: GoogleAdsStatus;
  costs: BusinessCostStatus;
}

/**
 * Daily records with every available live source overlaid.
 *
 * The overlays are applied in sequence, each replacing only its own fields:
 * Shopify owns revenue and order counts, Meta owns ad spend. Everything a
 * provider does not own is left exactly as the mock generator produced it.
 */
export async function getLiveDailyFinancials(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<{ days: DailyFinancials[]; status: LiveSourceStatus }> {
  const [mockDays, shopifyResult] = await Promise.all([
    getDailyFinancials(scope, start, end),
    loadShopifySales(start, end),
  ]);

  const currency = mockDays[0]?.currency ?? "USD";
  const [metaResult, googleResult] = await Promise.all([
    loadMetaSpend(start, end, currency),
    loadGoogleAdsMetrics(start, end, currency),
  ]);

  let days = mockDays;
  if (shopifyResult.days) days = applyShopifySales(days, shopifyResult.days);
  if (metaResult.days) days = applyMetaSpend(days, metaResult.days);
  if (googleResult.metrics) days = applyGoogleAdsSpend(days, googleResult.metrics);

  // Costs go last: they read the revenue the provider overlays produced, so
  // percentage-based fees are charged on real sales rather than mock ones.
  const costs = await applyBusinessCosts(days, start, end);

  return {
    days: costs.days,
    status: {
      shopify: shopifyResult.status,
      meta: metaResult.status,
      googleAds: googleResult.status,
      costs: costs.status,
    },
  };
}

export interface LiveRangeReport extends RangeReport {
  shopify: ShopifyStatus;
  meta: MetaStatus;
  googleAds: GoogleAdsStatus;
  costs: BusinessCostStatus;
}

/**
 * Range report where both the current and the comparison window use live
 * revenue. Comparing a live period against a mock one would make every delta
 * meaningless, so they always come from the same source.
 */
export async function getLiveRangeReport(
  scope: StoreScope,
  range: DateRange,
  previousWindow: { start: ISODate; end: ISODate },
): Promise<LiveRangeReport> {
  const [current, previous] = await Promise.all([
    getLiveDailyFinancials(scope, range.start, range.end),
    getLiveDailyFinancials(scope, previousWindow.start, previousWindow.end),
  ]);

  return {
    range,
    days: current.days,
    summary: summarize(current.days),
    previous: summarize(previous.days),
    shopify: current.status.shopify,
    meta: current.status.meta,
    googleAds: current.status.googleAds,
    costs: current.status.costs,
  };
}

/** Trailing window for the Overview charts, with live revenue overlaid. */
export async function getLiveTrailingDays(
  scope: StoreScope,
  end: ISODate,
  days: number,
): Promise<DailyFinancials[]> {
  const mockDays = await getTrailingDays(scope, end, days);
  if (mockDays.length === 0) return mockDays;

  const from = mockDays[0].date;
  const to = mockDays[mockDays.length - 1].date;
  const currency = mockDays[0].currency;

  const [shopifyResult, metaResult, googleResult] = await Promise.all([
    loadShopifySales(from, to),
    loadMetaSpend(from, to, currency),
    loadGoogleAdsMetrics(from, to, currency),
  ]);

  let result = mockDays;
  if (shopifyResult.days) result = applyShopifySales(result, shopifyResult.days);
  if (metaResult.days) result = applyMetaSpend(result, metaResult.days);
  if (googleResult.metrics) result = applyGoogleAdsSpend(result, googleResult.metrics);

  const costs = await applyBusinessCosts(result, from, to);
  return costs.days;
}

/**
 * Product identities seen on orders, for the Historical Product Mapping page.
 *
 * The window is wide on purpose — a gap in June has to be fixable from a page
 * that is not showing June.
 */
export async function getHistoricalMapping(
  start: ISODate,
  end: ISODate,
): Promise<HistoricalMapping> {
  return loadHistoricalMapping(start, end);
}

export type { HistoricalMapping };

/** Connection status for the Connections page. Metadata only, no data sync. */
export async function getShopifyStatus(): Promise<ShopifyStatus> {
  return probeShopifyStatus();
}

export async function getMetaStatus(): Promise<MetaStatus> {
  return probeMetaStatus();
}

export async function getGoogleAdsStatus(): Promise<GoogleAdsStatus> {
  return probeGoogleAdsStatus();
}

/**
 * Channel table for the Marketing page, with the Google Ads row replaced by
 * real figures when the API is reachable. Every other channel stays mock and
 * is labelled as such, so the table never presents mock numbers as live.
 */
export async function getLiveChannelPerformance(
  scope: StoreScope,
  start: ISODate,
  end: ISODate,
): Promise<{ channels: ChannelPerformance[]; googleAds: GoogleAdsStatus }> {
  const [channels, days] = await Promise.all([
    getChannelPerformance(scope, start, end),
    getDailyFinancials(scope, start, end),
  ]);

  const currency = days[0]?.currency ?? "USD";
  const google = await loadGoogleAdsMetrics(start, end, currency);
  if (!google.metrics) return { channels, googleAds: google.status };

  // Totals come straight off the range object, which converted the raw micro
  // sum once. Re-adding the per-day figures here would work too, but reading
  // the authoritative total leaves no room for it to drift.
  const metrics = google.metrics;

  const live: ChannelPerformance = {
    channel: "google_ads",
    label: CHANNEL_LABELS.google_ads,
    spend: metrics.totalSpend,
    impressions: metrics.totalImpressions,
    clicks: metrics.totalClicks,
    attributedConversions: metrics.totalConversions,
    attributedRevenue: metrics.totalConversionValue,
    platformRoas: null,
    shareOfSpend: null,
    cpc: null,
    ctr: null,
    source: "live",
  };

  const merged = channels.filter((channel) => channel.channel !== "google_ads");
  merged.push(live);

  return { channels: finalizeChannels(merged), googleAds: google.status };
}

export { type ShopifyStatus, type MetaStatus, type GoogleAdsStatus, type BusinessCostStatus };

export { type DailyFinancials, type PeriodSummary };
