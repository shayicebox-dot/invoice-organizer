-- ──────────────────────────────────────────────────────────────────────────────
-- Helper functions used by the dashboard.
-- Run this after schema.sql.
-- ──────────────────────────────────────────────────────────────────────────────

-- Top products by net profit over a date range.
create or replace function top_products_by_profit(
  p_from date,
  p_to date,
  p_limit int default 25
)
returns table (
  product_id   uuid,
  title        text,
  is_bundle    boolean,
  units        bigint,
  revenue      numeric,
  cogs         numeric,
  profit       numeric,
  margin_pct   numeric
)
language sql stable as $$
  select
    p.id as product_id,
    p.title,
    p.is_bundle,
    sum(ol.quantity)::bigint as units,
    sum(ol.line_revenue) as revenue,
    sum(ol.line_cogs) as cogs,
    sum(ol.line_profit) as profit,
    case when sum(ol.line_revenue) > 0
         then sum(ol.line_profit) / sum(ol.line_revenue)
         else 0 end as margin_pct
  from order_lines ol
  join orders o on o.id = ol.order_id
  join products p on p.id = ol.product_id
  where o.processed_at::date between p_from and p_to
  group by p.id, p.title, p.is_bundle
  order by profit desc
  limit p_limit;
$$;

-- Refresh daily_store_metrics for the trailing 60 days. Called by /api/sync.
create or replace function refresh_daily_metrics()
returns void
language plpgsql as $$
begin
  delete from daily_store_metrics where date >= current_date - 60;

  insert into daily_store_metrics (
    store_id, date, orders, revenue_usd, gross_profit_usd, net_profit_usd,
    ad_spend_usd, shipping_cost_usd, refund_usd,
    new_customers, returning_customers, aov_usd, mer, roas, cac_usd
  )
  select
    o.store_id,
    o.processed_at::date as date,
    count(*)::int as orders,
    coalesce(sum(o.total * o.fx_to_usd), 0) as revenue_usd,
    coalesce(sum((o.total - o.cogs) * o.fx_to_usd), 0) as gross_profit_usd,
    coalesce(sum(o.net_profit * o.fx_to_usd), 0) as net_profit_usd,
    coalesce(sum(o.attributed_ad_spend * o.fx_to_usd), 0) as ad_spend_usd,
    coalesce(sum(o.shipping_cost * o.fx_to_usd), 0) as shipping_cost_usd,
    coalesce(sum(o.refund_total * o.fx_to_usd), 0) as refund_usd,
    sum(case when not o.is_returning then 1 else 0 end)::int as new_customers,
    sum(case when o.is_returning then 1 else 0 end)::int as returning_customers,
    case when count(*) > 0
         then coalesce(sum(o.total * o.fx_to_usd), 0) / count(*) end as aov_usd,
    case when coalesce(sum(o.attributed_ad_spend * o.fx_to_usd), 0) > 0
         then coalesce(sum(o.total * o.fx_to_usd), 0)
              / sum(o.attributed_ad_spend * o.fx_to_usd) end as mer,
    case when coalesce(sum(o.attributed_ad_spend * o.fx_to_usd), 0) > 0
         then coalesce(sum(o.total * o.fx_to_usd), 0)
              / sum(o.attributed_ad_spend * o.fx_to_usd) end as roas,
    case when sum(case when not o.is_returning then 1 else 0 end) > 0
         then coalesce(sum(o.attributed_ad_spend * o.fx_to_usd), 0)
              / sum(case when not o.is_returning then 1 else 0 end) end as cac_usd
  from orders o
  where o.processed_at::date >= current_date - 60
  group by o.store_id, o.processed_at::date;
end;
$$;
