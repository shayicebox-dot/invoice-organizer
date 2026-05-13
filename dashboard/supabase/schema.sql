-- ──────────────────────────────────────────────────────────────────────────────
-- Profit Dashboard – database schema
-- Run this in Supabase SQL editor (one-time setup).
-- Designed for multi-store, multi-currency, with snapshots for unit economics.
-- ──────────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ──────────────────────────── Stores / Brands ────────────────────────────────
create table if not exists stores (
  id              uuid primary key default uuid_generate_v4(),
  slug            text unique not null,             -- 'kicksbox', 'icebox', 'bruno'
  name            text not null,
  platform        text not null default 'shopify',  -- 'shopify' | 'woo' | etc.
  domain          text not null,                    -- 'kicksbox.myshopify.com'
  currency        text not null default 'USD',      -- ISO 4217
  timezone        text not null default 'UTC',
  logo_url        text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- FX rate snapshots (USD baseline). Sync ~hourly.
create table if not exists fx_rates (
  base            text not null,
  quote           text not null,
  rate            numeric(18,8) not null,
  fetched_at      timestamptz not null default now(),
  primary key (base, quote, fetched_at)
);

-- ──────────────────────────── Products & Bundles ─────────────────────────────
create table if not exists products (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  shopify_id      text not null,                    -- product gid or numeric id
  title           text not null,
  handle          text,
  product_type    text,
  vendor          text,
  status          text,
  is_bundle       boolean not null default false,
  bundle_size     int,                              -- e.g. 10, 20, 50 pack
  tags            text[] default '{}',
  image_url       text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (store_id, shopify_id)
);
create index if not exists idx_products_store on products(store_id);
create index if not exists idx_products_title_trgm on products using gin (title gin_trgm_ops);

create table if not exists variants (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references products(id) on delete cascade,
  shopify_id      text not null,
  sku             text,
  title           text,
  price           numeric(12,2),
  compare_at      numeric(12,2),
  weight_grams    int,
  inventory_qty   int default 0,
  updated_at      timestamptz default now(),
  unique (product_id, shopify_id)
);
create index if not exists idx_variants_sku on variants(sku);

-- Manual unit-economics overrides (the source of truth for true profit).
create table if not exists product_costs (
  id              uuid primary key default uuid_generate_v4(),
  variant_id      uuid not null references variants(id) on delete cascade,
  unit_cost       numeric(12,4) not null default 0,        -- COGS per unit
  pick_pack_cost  numeric(12,4) not null default 0,        -- 3PL handling
  packaging_cost  numeric(12,4) not null default 0,        -- box, polybag, etc.
  shipping_cost   numeric(12,4) not null default 0,        -- avg outbound
  duties_pct      numeric(6,4) not null default 0,         -- 0.05 = 5%
  notes           text,
  effective_from  date not null default current_date,
  created_at      timestamptz default now(),
  unique (variant_id, effective_from)
);

-- Bundle composition (a 20-pack contains 20× single product).
create table if not exists bundle_components (
  bundle_variant_id   uuid references variants(id) on delete cascade,
  component_variant_id uuid references variants(id) on delete cascade,
  quantity            int not null default 1,
  primary key (bundle_variant_id, component_variant_id)
);

-- ──────────────────────────── Customers ──────────────────────────────────────
create table if not exists customers (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  shopify_id      text not null,
  email           text,
  first_name      text,
  last_name       text,
  country         text,
  orders_count    int default 0,
  total_spent     numeric(14,2) default 0,
  total_profit    numeric(14,2) default 0,
  first_order_at  timestamptz,
  last_order_at   timestamptz,
  vip_score       numeric(6,2),
  created_at      timestamptz default now(),
  unique (store_id, shopify_id)
);
create index if not exists idx_customers_email on customers(email);
create index if not exists idx_customers_store on customers(store_id);

-- ──────────────────────────── Orders & Lines ─────────────────────────────────
create table if not exists orders (
  id                  uuid primary key default uuid_generate_v4(),
  store_id            uuid not null references stores(id) on delete cascade,
  shopify_id          text not null,
  order_number        text,
  customer_id         uuid references customers(id) on delete set null,
  email               text,
  currency            text not null,                -- order currency
  fx_to_usd           numeric(18,8) not null default 1,  -- snapshot at order time
  subtotal            numeric(14,2) not null default 0,
  discount_total      numeric(14,2) not null default 0,
  shipping_charged    numeric(14,2) not null default 0,  -- what customer paid
  tax                 numeric(14,2) not null default 0,
  total               numeric(14,2) not null default 0,
  refund_total        numeric(14,2) not null default 0,
  financial_status    text,
  fulfillment_status  text,
  channel             text,                         -- 'web', 'pos', etc.
  source_name         text,                         -- referring source from shopify
  landing_url         text,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  utm_content         text,
  ad_platform         text,                         -- derived: 'meta' | 'google' | 'klaviyo' | 'organic'
  ad_campaign_id      text,                         -- attributed campaign
  is_returning        boolean default false,
  -- Cost snapshot (computed at sync time so historical metrics stay stable)
  cogs                numeric(14,2) not null default 0,
  shipping_cost       numeric(14,2) not null default 0,
  pick_pack_cost      numeric(14,2) not null default 0,
  packaging_cost      numeric(14,2) not null default 0,
  duties              numeric(14,2) not null default 0,
  payment_fees        numeric(14,2) not null default 0,
  attributed_ad_spend numeric(14,2) not null default 0,
  net_profit          numeric(14,2) not null default 0,
  margin_pct          numeric(6,4) not null default 0,
  processed_at        timestamptz not null,
  created_at          timestamptz default now(),
  unique (store_id, shopify_id)
);
create index if not exists idx_orders_processed on orders(processed_at desc);
create index if not exists idx_orders_store_date on orders(store_id, processed_at desc);
create index if not exists idx_orders_customer on orders(customer_id);
create index if not exists idx_orders_ad_platform on orders(ad_platform);

create table if not exists order_lines (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references orders(id) on delete cascade,
  variant_id      uuid references variants(id) on delete set null,
  product_id      uuid references products(id) on delete set null,
  sku             text,
  title           text,
  quantity        int not null,
  unit_price      numeric(12,2) not null,
  unit_cost       numeric(12,4) not null default 0,
  discount        numeric(12,2) not null default 0,
  line_revenue    numeric(14,2) not null default 0,
  line_cogs       numeric(14,2) not null default 0,
  line_profit     numeric(14,2) not null default 0,
  created_at      timestamptz default now()
);
create index if not exists idx_lines_order on order_lines(order_id);
create index if not exists idx_lines_variant on order_lines(variant_id);

create table if not exists refunds (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references orders(id) on delete cascade,
  shopify_id      text,
  amount          numeric(14,2) not null default 0,
  reason          text,
  refunded_at     timestamptz not null,
  created_at      timestamptz default now()
);

-- ──────────────────────────── Inventory snapshots ────────────────────────────
create table if not exists inventory_snapshots (
  id              uuid primary key default uuid_generate_v4(),
  variant_id      uuid not null references variants(id) on delete cascade,
  location        text,
  on_hand         int not null default 0,
  available       int not null default 0,
  unit_cost       numeric(12,4) not null default 0,
  snapshot_at     timestamptz not null default now()
);
create index if not exists idx_inv_variant_time on inventory_snapshots(variant_id, snapshot_at desc);

-- ──────────────────────────── Marketing / Ads ────────────────────────────────
create table if not exists ad_campaigns (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid references stores(id) on delete cascade,
  platform        text not null,                    -- 'meta' | 'google' | 'klaviyo'
  external_id     text not null,
  name            text not null,
  objective       text,
  status          text,
  created_at      timestamptz default now(),
  unique (platform, external_id)
);

create table if not exists ad_spend_daily (
  id              uuid primary key default uuid_generate_v4(),
  campaign_id     uuid not null references ad_campaigns(id) on delete cascade,
  date            date not null,
  spend           numeric(14,2) not null default 0,
  impressions     bigint default 0,
  clicks          bigint default 0,
  conversions     numeric(14,4) default 0,
  reported_revenue numeric(14,2) default 0,         -- platform-reported (Meta/GA)
  currency        text not null default 'USD',
  unique (campaign_id, date)
);
create index if not exists idx_spend_date on ad_spend_daily(date desc);

-- Klaviyo email/SMS performance (campaign + flow level).
create table if not exists klaviyo_metrics_daily (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid not null references stores(id) on delete cascade,
  date            date not null,
  kind            text not null,                    -- 'campaign' | 'flow'
  external_id     text not null,
  name            text,
  recipients      int default 0,
  opens           int default 0,
  clicks          int default 0,
  placed_orders   int default 0,
  revenue         numeric(14,2) default 0,
  unique (store_id, kind, external_id, date)
);

-- ──────────────────────────── AI Insights ────────────────────────────────────
create table if not exists insights (
  id              uuid primary key default uuid_generate_v4(),
  store_id        uuid references stores(id) on delete cascade,
  category        text not null,                    -- 'product' | 'ad' | 'shipping' | 'customer' | 'cash'
  severity        text not null default 'info',     -- 'info' | 'warn' | 'critical' | 'win'
  title           text not null,
  body            text not null,
  evidence        jsonb,                            -- numbers behind the claim
  action          text,
  generated_for   date not null,                    -- date the analysis pertains to
  model           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_insights_date on insights(generated_for desc);
create index if not exists idx_insights_store on insights(store_id, generated_for desc);

-- ──────────────────────────── Daily aggregates (materialized) ────────────────
-- Refreshed by the sync worker after each pull. Drives the overview cards.
create table if not exists daily_store_metrics (
  store_id              uuid not null references stores(id) on delete cascade,
  date                  date not null,
  orders                int not null default 0,
  revenue_usd           numeric(14,2) not null default 0,
  gross_profit_usd      numeric(14,2) not null default 0,
  net_profit_usd        numeric(14,2) not null default 0,
  ad_spend_usd          numeric(14,2) not null default 0,
  shipping_cost_usd     numeric(14,2) not null default 0,
  refund_usd            numeric(14,2) not null default 0,
  new_customers         int not null default 0,
  returning_customers   int not null default 0,
  aov_usd               numeric(14,2) not null default 0,
  mer                   numeric(8,4) not null default 0,   -- revenue / ad_spend
  roas                  numeric(8,4) not null default 0,   -- attributed_rev / ad_spend
  cac_usd               numeric(14,2) not null default 0,
  primary key (store_id, date)
);

-- ──────────────────────────── Sync log ───────────────────────────────────────
create table if not exists sync_runs (
  id              uuid primary key default uuid_generate_v4(),
  source          text not null,                    -- 'shopify' | 'meta' | 'google' | 'klaviyo'
  store_id        uuid references stores(id),
  status          text not null,                    -- 'ok' | 'error'
  rows_in         int default 0,
  rows_out        int default 0,
  error           text,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz
);

-- ──────────────────────────── Row level security ─────────────────────────────
-- Single-tenant for now (you are the only operator). Enable later for team access.
alter table stores                 enable row level security;
alter table products               enable row level security;
alter table variants               enable row level security;
alter table orders                 enable row level security;
alter table order_lines            enable row level security;
alter table customers              enable row level security;
alter table ad_campaigns           enable row level security;
alter table ad_spend_daily         enable row level security;
alter table klaviyo_metrics_daily  enable row level security;
alter table insights               enable row level security;
alter table daily_store_metrics    enable row level security;

-- Default: only the service role can touch the data (server-side only).
-- Authenticated readers will be added once Supabase Auth is wired.
create policy "service_role_all" on stores
  for all using (auth.role() = 'service_role');
