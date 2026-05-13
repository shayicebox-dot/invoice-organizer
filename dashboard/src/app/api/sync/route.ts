import { NextRequest, NextResponse } from "next/server";
import { storeConfigs } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase";
import { iterOrders, iterProducts, detectBundleSize } from "@/lib/shopify";
import { persistRates, toUSD } from "@/lib/currency";
import { lineEconomics, paymentFees } from "@/lib/profit";
import { metaCampaignsDaily, metaPurchaseRevenue } from "@/lib/meta";
import { env } from "@/lib/env";
import { assertCron } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/sync — pulls everything. Designed to be called on a Vercel cron.
// Header: x-cron-secret: <CRON_SECRET>
export async function POST(req: NextRequest) {
  try {
    assertCron(req);
  } catch (r) {
    return r as Response;
  }

  const sinceDays = Number(req.nextUrl.searchParams.get("days") || "7");
  const sinceISO = new Date(Date.now() - sinceDays * 86400000).toISOString();

  const sb = supabaseAdmin();
  const summary: Record<string, unknown> = {};

  // 1. FX rates
  try {
    summary.fxRows = await persistRates(env.fxBase());
  } catch (e) {
    summary.fxError = String(e);
  }

  // 2. Per store: products + orders
  for (const store of storeConfigs()) {
    const storeRow = await upsertStore(store);
    const storeId = storeRow.id;
    let products = 0;
    let orders = 0;

    for await (const p of iterProducts(store)) {
      await sb
        .from("products")
        .upsert(
          {
            store_id: storeId,
            shopify_id: p.id,
            title: p.title,
            handle: p.handle,
            product_type: p.productType,
            vendor: p.vendor,
            status: p.status,
            tags: p.tags,
            is_bundle: !!detectBundleSize(p.title, p.tags),
            bundle_size: detectBundleSize(p.title, p.tags),
            image_url: p.featuredImage?.url,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id,shopify_id" },
        );
      products++;
      // Variants
      for (const v of p.variants.nodes) {
        const { data: prodRow } = await sb
          .from("products")
          .select("id")
          .eq("store_id", storeId)
          .eq("shopify_id", p.id)
          .single();
        if (prodRow) {
          await sb.from("variants").upsert(
            {
              product_id: prodRow.id,
              shopify_id: v.id,
              sku: v.sku,
              title: v.title,
              price: Number(v.price),
              compare_at: v.compareAtPrice ? Number(v.compareAtPrice) : null,
              inventory_qty: v.inventoryQuantity ?? 0,
              weight_grams: v.weight ? Math.round(v.weight * 1000) : null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "product_id,shopify_id" },
          );
        }
      }
    }

    for await (const o of iterOrders(store, sinceISO)) {
      const total = Number(o.currentTotalPriceSet.shopMoney.amount);
      const subtotal = Number(o.currentSubtotalPriceSet.shopMoney.amount);
      const shipping = Number(o.totalShippingPriceSet.shopMoney.amount);
      const tax = Number(o.totalTaxSet.shopMoney.amount);
      const discount = Number(o.currentTotalDiscountsSet.shopMoney.amount);
      const refunds = Number(o.totalRefundedSet.shopMoney.amount);
      const currency = o.currentTotalPriceSet.shopMoney.currencyCode;
      const totalUSD = await toUSD(total, currency);
      const fees = paymentFees(total, o.transactions?.[0]?.gateway || "shopify_payments");

      // Naive line economics; real cost lookups happen against product_costs.
      let cogs = 0;
      let pickPack = 0;
      const lines = o.lineItems.nodes;
      for (const l of lines) {
        const qty = l.quantity;
        const unit = Number(l.discountedUnitPriceSet.shopMoney.amount);
        const econ = lineEconomics(qty, unit, 0, {
          unit_cost: 0,
          pick_pack_cost: 0,
          packaging_cost: 0,
          shipping_cost: 0,
          duties_pct: 0,
        });
        cogs += econ.cogs;
      }

      const netProfit = total - cogs - shipping - fees - refunds;
      const margin = total > 0 ? netProfit / total : 0;

      const utm = o.customerJourneySummary?.firstVisit?.utmParameters;
      const adPlatform = inferAdPlatform(utm?.source, o.sourceName);

      await sb.from("orders").upsert(
        {
          store_id: storeId,
          shopify_id: o.id,
          order_number: o.name,
          email: o.customer?.email,
          currency,
          fx_to_usd: totalUSD / (total || 1),
          subtotal,
          discount_total: discount,
          shipping_charged: shipping,
          tax,
          total,
          refund_total: refunds,
          financial_status: o.displayFinancialStatus,
          fulfillment_status: o.displayFulfillmentStatus,
          channel: o.sourceName,
          source_name: o.sourceName,
          landing_url: o.customerJourneySummary?.firstVisit?.landingPageHtml,
          utm_source: utm?.source,
          utm_medium: utm?.medium,
          utm_campaign: utm?.campaign,
          utm_content: utm?.content,
          ad_platform: adPlatform,
          is_returning: (o.customer?.numberOfOrders || 0) > 1,
          cogs,
          shipping_cost: shipping,
          pick_pack_cost: pickPack,
          payment_fees: fees,
          net_profit: netProfit,
          margin_pct: margin,
          processed_at: o.processedAt,
        },
        { onConflict: "store_id,shopify_id" },
      );
      orders++;
    }

    summary[store.slug] = { products, orders };
  }

  // 3. Meta ad spend
  let metaRows = 0;
  for (const acct of env.metaAccounts()) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
    const until = new Date().toISOString().slice(0, 10);
    const rows = await metaCampaignsDaily(acct, since, until);
    for (const r of rows) {
      const campaign = await upsertCampaign("meta", r.campaign_id, r.campaign_name);
      await sb.from("ad_spend_daily").upsert(
        {
          campaign_id: campaign.id,
          date: r.date_start,
          spend: Number(r.spend),
          impressions: Number(r.impressions || 0),
          clicks: Number(r.clicks || 0),
          conversions: 0,
          reported_revenue: metaPurchaseRevenue(r),
          currency: "USD",
        },
        { onConflict: "campaign_id,date" },
      );
      metaRows++;
    }
  }
  summary.meta = { rows: metaRows };

  // 4. Refresh daily aggregates
  await sb.rpc("refresh_daily_metrics").catch(() => null);

  await sb.from("sync_runs").insert({
    source: "all",
    status: "ok",
    rows_out: Object.values(summary).reduce<number>((acc, v) => {
      if (v && typeof v === "object" && "orders" in v) return acc + Number((v as { orders: number }).orders);
      return acc;
    }, 0),
    finished_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, summary });
}

async function upsertStore(store: ReturnType<typeof storeConfigs>[number]) {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("stores").select("*").eq("slug", store.slug).maybeSingle();
  if (existing) return existing;
  const { data, error } = await sb
    .from("stores")
    .insert({
      slug: store.slug,
      name: store.slug[0].toUpperCase() + store.slug.slice(1),
      domain: store.domain,
      currency: store.currency,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function upsertCampaign(platform: string, externalId: string, name: string) {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("ad_campaigns")
    .upsert({ platform, external_id: externalId, name }, { onConflict: "platform,external_id" })
    .select()
    .single();
  if (!data) throw new Error("campaign upsert failed");
  return data;
}

function inferAdPlatform(utmSource?: string, sourceName?: string): string {
  const s = (utmSource || "").toLowerCase();
  if (s.includes("facebook") || s.includes("meta") || s.includes("instagram")) return "meta";
  if (s.includes("google") || s.includes("adwords")) return "google";
  if (s.includes("klaviyo") || s.includes("email")) return "klaviyo";
  if (sourceName === "web") return "organic";
  return "direct";
}
