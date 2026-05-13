import { NextRequest, NextResponse } from "next/server";
import { assertCron } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { generateInsights, persistInsights, type InsightPayload } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/insights/generate?store=kicksbox
// Builds a numbers snapshot, asks Claude for insights, persists them.
export async function POST(req: NextRequest) {
  try {
    assertCron(req);
  } catch (r) {
    return r as Response;
  }

  const sb = supabaseAdmin();
  const slug = req.nextUrl.searchParams.get("store");
  const q = sb.from("stores").select("*").order("name");
  const { data: stores } = await (slug ? q.eq("slug", slug) : q.eq("active", true));
  if (!stores?.length) return NextResponse.json({ ok: false, error: "no stores" }, { status: 404 });

  const out: { store: string; count: number }[] = [];
  for (const store of stores) {
    const payload = await buildPayload(store);
    const insights = await generateInsights(payload);
    await persistInsights(store.id, payload.date, insights);
    out.push({ store: store.slug, count: insights.length });
  }
  return NextResponse.json({ ok: true, stores: out });
}

async function buildPayload(store: { id: string; slug: string; currency: string }): Promise<InsightPayload> {
  const sb = supabaseAdmin();
  const today = new Date();
  const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
  const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString().slice(0, 10);

  const { data: weekRows } = await sb
    .from("daily_store_metrics")
    .select("*")
    .eq("store_id", store.id)
    .gte("date", weekAgo)
    .order("date");

  const ydy = (weekRows || []).find((r) => r.date === yest);

  return {
    date: yest,
    store: store.slug,
    currency: store.currency,
    yesterday: {
      revenue: Number(ydy?.revenue_usd || 0),
      netProfit: Number(ydy?.net_profit_usd || 0),
      marginPct: Number(ydy?.net_profit_usd || 0) / Math.max(1, Number(ydy?.revenue_usd || 1)),
      adSpend: Number(ydy?.ad_spend_usd || 0),
      mer: Number(ydy?.mer || 0),
      aov: Number(ydy?.aov_usd || 0),
      orders: Number(ydy?.orders || 0),
      newCustomers: Number(ydy?.new_customers || 0),
      returningPct:
        Number(ydy?.returning_customers || 0) /
        Math.max(1, Number(ydy?.new_customers || 0) + Number(ydy?.returning_customers || 0)),
      shippingCostPct:
        Number(ydy?.shipping_cost_usd || 0) / Math.max(1, Number(ydy?.revenue_usd || 1)),
    },
    weekTrend: (weekRows || []).map((r) => ({
      revenue: Number(r.revenue_usd),
      netProfit: Number(r.net_profit_usd),
      adSpend: Number(r.ad_spend_usd),
      cac: Number(r.cac_usd),
    })),
    topProducts: [],
    losingProducts: [],
    campaigns: [],
  };
}
