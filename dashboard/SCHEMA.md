# Database schema reference

Quick reference for the tables in `supabase/schema.sql`. Run the SQL file once
in the Supabase SQL editor to provision everything.

## Core tables

| Table | Purpose |
|---|---|
| `stores` | One row per brand (Kicksbox, ICEBOX, BRUNO). |
| `fx_rates` | FX snapshots (hourly), so historical orders keep stable USD value. |
| `products` | Mirror of Shopify products + `is_bundle`, `bundle_size`. |
| `variants` | SKUs, prices, inventory quantity. |
| `product_costs` | **You fill this in.** Unit cost / pick & pack / packaging / shipping / duties. |
| `bundle_components` | Links a bundle variant to its component variants × qty. |
| `customers` | Aggregated customer profile incl. total profit and VIP score. |
| `orders` | Order header with **cost snapshot** taken at sync time. |
| `order_lines` | Per-line revenue, COGS, profit. |
| `refunds` | Refund events. |
| `inventory_snapshots` | Time-series inventory (one row per sync). |
| `ad_campaigns` | Meta / Google / Klaviyo campaigns. |
| `ad_spend_daily` | Per campaign per day spend + impressions + clicks + reported revenue. |
| `klaviyo_metrics_daily` | Email/SMS campaign + flow performance. |
| `insights` | AI-generated insights (one row per insight). |
| `daily_store_metrics` | Pre-aggregated daily KPI roll-up (drives the Overview page fast). |
| `sync_runs` | Audit log of every sync run. |

## Cost overrides — the most important table

`product_costs` is where **your** numbers live. The sync writes Shopify data;
this table writes truth.

```sql
insert into product_costs (variant_id, unit_cost, pick_pack_cost, packaging_cost, shipping_cost, duties_pct)
values
  ('<variant uuid>', 4.20, 0.55, 0.30, 6.40, 0.05);
```

`effective_from` defaults to today. To change a cost going forward, insert a
new row with a future `effective_from`; old orders keep their historical cost.

## Bundle math

A 20-pack sells as one SKU but draws down 20 single units of inventory. Tell
the system:

```sql
insert into bundle_components (bundle_variant_id, component_variant_id, quantity)
values ('<20-pack variant>', '<single sneaker box variant>', 20);
```

Now velocity, days-of-stock, and reorder forecasts treat the underlying SKU
correctly.

## Daily aggregates

`daily_store_metrics` is the table the Overview page reads from. The sync
worker refreshes it after every run. It contains:

- `orders`, `revenue_usd`, `gross_profit_usd`, `net_profit_usd`
- `ad_spend_usd`, `shipping_cost_usd`, `refund_usd`
- `new_customers`, `returning_customers`, `aov_usd`
- `mer`, `roas`, `cac_usd`

That's why the dashboard is fast: no joins at page-load time, just a single
read of pre-rolled-up rows.
