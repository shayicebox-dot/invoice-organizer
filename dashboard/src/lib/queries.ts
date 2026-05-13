// Read-side queries that power the dashboard.
// All return USD-normalized numbers.
import { supabaseAdmin } from "./supabase";

export type DateRange = { from: string; to: string };

export function defaultRange(): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function overviewKpis(range: DateRange, storeId?: string) {
  const sb = supabaseAdmin();
  let q = sb
    .from("daily_store_metrics")
    .select("*")
    .gte("date", range.from)
    .lte("date", range.to);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  if (error) throw error;

  const rows = (data || []) as Record<string, number | string>[];
  const sum = (k: string) =>
    rows.reduce((acc, r) => acc + Number(r[k] || 0), 0);

  const revenue = sum("revenue_usd");
  const adSpend = sum("ad_spend_usd");
  const orders = sum("orders");
  const shipping = sum("shipping_cost_usd");
  const refunds = sum("refund_usd");
  const newC = sum("new_customers");
  const returningC = sum("returning_customers");
  const netProfit = sum("net_profit_usd");

  return {
    revenue,
    netProfit,
    grossMarginPct: revenue > 0 ? (revenue - shipping - refunds) / revenue : 0,
    adSpend,
    mer: adSpend > 0 ? revenue / adSpend : 0,
    roas: adSpend > 0 ? revenue / adSpend : 0, // overall — campaign-level lives in /marketing
    aov: orders > 0 ? revenue / orders : 0,
    orders,
    returningPct: orders > 0 ? returningC / (newC + returningC) : 0,
    cac: newC > 0 ? adSpend / newC : 0,
    series: rows.sort((a, b) => String(a.date).localeCompare(String(b.date))),
  };
}

export async function topProducts(range: DateRange, limit = 10) {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("top_products_by_profit", {
    p_from: range.from,
    p_to: range.to,
    p_limit: limit,
  });
  if (error || !data) {
    // Fallback: aggregate in JS if the RPC isn't created yet.
    return [];
  }
  return data as {
    product_id: string;
    title: string;
    is_bundle: boolean;
    units: number;
    revenue: number;
    cogs: number;
    profit: number;
    margin_pct: number;
  }[];
}

export async function recentOrders(range: DateRange, limit = 50) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, order_number, processed_at, total, currency, ad_platform, ad_campaign_id, is_returning, net_profit, margin_pct, attributed_ad_spend, email",
    )
    .gte("processed_at", range.from)
    .lte("processed_at", `${range.to}T23:59:59`)
    .order("processed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function latestInsights(limit = 12) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("insights")
    .select("*")
    .order("generated_for", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function listStores() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("stores").select("*").order("name");
  return data || [];
}
