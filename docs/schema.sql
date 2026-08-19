-- =====================================================================
-- Ecom P&L — proposed Postgres / Supabase schema
-- =====================================================================
--
-- Conventions used throughout:
--
--   * Money is stored as BIGINT in **integer minor currency units**
--     (cents for USD, agorot for ILS). NUMERIC would also be safe, but
--     integers match the application's money model exactly and remove
--     any question of client-side rounding. Column names carry the
--     `_minor` suffix so the unit is impossible to misread.
--
--   * Every financial row carries `organization_id`, `store_id`, `date`
--     and `currency`. That quartet is the tenancy + reporting key, and
--     it is what row-level security is written against.
--
--   * `date` is a calendar date in the store's reporting timezone,
--     resolved at ingestion. Timestamps stay in UTC.
--
--   * No credential is ever stored here. `connections.credential_ref`
--     holds an opaque pointer into a secret manager (Supabase Vault,
--     AWS Secrets Manager, Doppler, …).
--
-- This file is a design document that runs. Apply it as the first
-- migration when the Supabase project is created.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------

create type organization_role as enum ('owner', 'admin', 'analyst', 'viewer');
create type store_platform    as enum ('shopify', 'woocommerce', 'custom');

create type provider_category as enum (
  'commerce', 'advertising', 'email_sms', 'fulfillment', 'payments'
);

create type provider_id as enum (
  'shopify', 'meta_ads', 'google_ads', 'klaviyo', 'omnisend', 'mailchimp',
  'shipbob', 'shipstation', 'stripe', 'shopify_payments', 'paypal'
);

create type connection_status      as enum ('connected', 'disconnected', 'error', 'syncing');
create type order_financial_status as enum ('paid', 'partially_refunded', 'refunded', 'pending');
create type order_channel          as enum ('online_store', 'pos', 'wholesale');
create type refund_reason          as enum ('customer_return', 'damaged', 'wrong_item', 'cancelled', 'other');
create type marketing_channel      as enum ('meta_ads', 'google_ads', 'klaviyo', 'omnisend', 'mailchimp');
create type expense_type           as enum ('fixed', 'variable');
create type expense_recurrence     as enum ('one_off', 'daily', 'weekly', 'monthly', 'annual');

create type expense_category as enum (
  'software', 'payroll', 'rent', 'professional_services',
  'packaging', 'customer_support', 'chargebacks', 'other'
);

-- ---------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------

-- Mirrors auth.users. Supabase owns authentication; this row holds the
-- profile fields the product needs.
create table users (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text        not null unique,
  full_name   text        not null default '',
  created_at  timestamptz not null default now()
);

create table organizations (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  -- Currency every roll-up is reported in.
  base_currency char(3)     not null default 'USD',
  timezone      text        not null default 'UTC',
  created_at    timestamptz not null default now()
);

create table organization_members (
  organization_id uuid              not null references organizations (id) on delete cascade,
  user_id         uuid              not null references users (id) on delete cascade,
  role            organization_role not null default 'viewer',
  created_at      timestamptz       not null default now(),
  primary key (organization_id, user_id)
);

create index on organization_members (user_id);

-- ---------------------------------------------------------------------
-- Stores and provider connections
-- ---------------------------------------------------------------------

create table stores (
  id              uuid           primary key default gen_random_uuid(),
  organization_id uuid           not null references organizations (id) on delete cascade,
  name            text           not null,
  platform        store_platform not null default 'shopify',
  domain          text           not null,
  currency        char(3)        not null default 'USD',
  timezone        text           not null default 'UTC',
  is_active       boolean        not null default true,
  created_at      timestamptz    not null default now(),
  unique (organization_id, domain)
);

create index on stores (organization_id);

-- A link to an external provider. `store_id` is null for account-level
-- connections that serve every store (an ad account, an ESP plan).
create table connections (
  id              uuid              primary key default gen_random_uuid(),
  organization_id uuid              not null references organizations (id) on delete cascade,
  store_id        uuid              references stores (id) on delete cascade,
  provider        provider_id       not null,
  category        provider_category not null,
  status          connection_status not null default 'disconnected',
  account_label   text,
  last_synced_at  timestamptz,
  -- Opaque pointer into the secret manager. NEVER a token.
  credential_ref  text,
  -- Non-secret provider settings: account ids, currency, attribution window.
  settings        jsonb             not null default '{}'::jsonb,
  created_at      timestamptz       not null default now(),
  unique (organization_id, provider, store_id)
);

create index on connections (organization_id, category);

-- Every ingestion run, so a gap in the data is explainable.
create table sync_runs (
  id             uuid        primary key default gen_random_uuid(),
  connection_id  uuid        not null references connections (id) on delete cascade,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  -- Window of calendar dates this run refreshed.
  window_start   date,
  window_end     date,
  records_written integer    not null default 0,
  error_message  text
);

create index on sync_runs (connection_id, started_at desc);

-- ---------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------

create table products (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations (id) on delete cascade,
  store_id        uuid        not null references stores (id) on delete cascade,
  external_id     text,
  title           text        not null,
  sku             text        not null,
  category        text        not null default '',
  price_minor     bigint      not null default 0,
  currency        char(3)     not null default 'USD',
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  unique (store_id, sku)
);

create index on products (organization_id, store_id);

-- Unit cost with a validity window. An order keeps the cost that applied
-- on the day it was placed, so restating history is deliberate rather
-- than a side effect of editing a product.
create table product_costs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references organizations (id) on delete cascade,
  product_id      uuid        not null references products (id) on delete cascade,
  unit_cost_minor bigint      not null,
  currency        char(3)     not null default 'USD',
  effective_from  date        not null,
  effective_to    date,
  created_at      timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create index on product_costs (product_id, effective_from desc);

-- One cost record per product per day at most.
create unique index product_costs_no_overlap
  on product_costs (product_id, effective_from);

-- ---------------------------------------------------------------------
-- Orders and refunds — the revenue source of truth
-- ---------------------------------------------------------------------

create table orders (
  id                    uuid                   primary key default gen_random_uuid(),
  organization_id       uuid                   not null references organizations (id) on delete cascade,
  store_id              uuid                   not null references stores (id) on delete cascade,
  -- Identifier in the source platform, for idempotent re-sync.
  external_id           text                   not null,
  order_number          text                   not null,
  date                  date                   not null,
  processed_at          timestamptz            not null,
  currency              char(3)                not null default 'USD',
  customer_name         text                   not null default '',
  customer_external_id  text,
  -- Line prices plus shipping charged, before discounts. Excludes tax.
  gross_sales_minor     bigint                 not null default 0,
  discounts_minor       bigint                 not null default 0,
  shipping_charged_minor bigint                not null default 0,
  -- Collected on behalf of the tax authority. Excluded from revenue.
  taxes_minor           bigint                 not null default 0,
  -- What the merchant paid to ship and fulfil.
  shipping_cost_minor   bigint                 not null default 0,
  payment_fees_minor    bigint                 not null default 0,
  financial_status      order_financial_status not null default 'paid',
  channel               order_channel          not null default 'online_store',
  item_count            integer                not null default 0,
  created_at            timestamptz            not null default now(),
  unique (store_id, external_id)
);

create index on orders (organization_id, store_id, date);
create index on orders (store_id, processed_at desc);

create table order_items (
  id              uuid    primary key default gen_random_uuid(),
  organization_id uuid    not null references organizations (id) on delete cascade,
  order_id        uuid    not null references orders (id) on delete cascade,
  product_id      uuid    references products (id) on delete set null,
  variant_title   text    not null default 'Default',
  quantity        integer not null check (quantity > 0),
  unit_price_minor bigint not null default 0,
  -- Snapshot of the cost that applied on the order date.
  unit_cost_minor bigint  not null default 0,
  discount_minor  bigint  not null default 0
);

create index on order_items (order_id);
create index on order_items (product_id);

create table refunds (
  id                   uuid          primary key default gen_random_uuid(),
  organization_id      uuid          not null references organizations (id) on delete cascade,
  store_id             uuid          not null references stores (id) on delete cascade,
  order_id             uuid          not null references orders (id) on delete cascade,
  external_id          text,
  -- The date the refund was issued, which may differ from the order date.
  date                 date          not null,
  currency             char(3)       not null default 'USD',
  amount_minor         bigint        not null,
  -- COGS recovered when goods came back in sellable condition.
  restocked_cogs_minor bigint        not null default 0,
  reason               refund_reason not null default 'customer_return',
  created_at           timestamptz   not null default now()
);

create index on refunds (organization_id, store_id, date);
create index on refunds (order_id);

-- ---------------------------------------------------------------------
-- Marketing spend — cost, never revenue
-- ---------------------------------------------------------------------

-- One row per store, per channel, per day. `attributed_*` columns hold
-- what the platform claims; they are reported for context and are never
-- added to revenue in the P&L.
create table marketing_spend_daily (
  id                     uuid              primary key default gen_random_uuid(),
  organization_id        uuid              not null references organizations (id) on delete cascade,
  store_id               uuid              not null references stores (id) on delete cascade,
  connection_id          uuid              references connections (id) on delete set null,
  date                   date              not null,
  currency               char(3)           not null default 'USD',
  channel                marketing_channel not null,
  spend_minor            bigint            not null default 0,
  impressions            bigint            not null default 0,
  clicks                 bigint            not null default 0,
  attributed_conversions integer           not null default 0,
  attributed_revenue_minor bigint          not null default 0,
  created_at             timestamptz       not null default now(),
  unique (store_id, channel, date)
);

create index on marketing_spend_daily (organization_id, date);

-- ---------------------------------------------------------------------
-- Expenses
-- ---------------------------------------------------------------------

-- `store_id` null means shared overhead, allocated across stores.
-- Fixed expenses carry a recurrence and are spread across the days they
-- cover; variable expenses are dated as they occur.
create table expenses (
  id              uuid               primary key default gen_random_uuid(),
  organization_id uuid               not null references organizations (id) on delete cascade,
  store_id        uuid               references stores (id) on delete cascade,
  name            text               not null,
  type            expense_type       not null,
  category        expense_category   not null default 'other',
  recurrence      expense_recurrence not null default 'one_off',
  amount_minor    bigint             not null,
  currency        char(3)            not null default 'USD',
  date            date               not null,
  end_date        date,
  notes           text,
  created_at      timestamptz        not null default now(),
  check (end_date is null or end_date >= date)
);

create index on expenses (organization_id, date);
create index on expenses (organization_id, type, date);

-- ---------------------------------------------------------------------
-- Materialized daily roll-up
-- ---------------------------------------------------------------------

-- What the dashboard reads. Rebuilt by a scheduled job from the tables
-- above; never written by the UI. One row per store per day.
--
-- Net Sales           = gross_sales - discounts - refunds
-- Contribution Profit = Net Sales - cogs - shipping - payment_fees
--                       - (meta + google + email) - variable_expenses
-- Operating Profit    = Contribution Profit - fixed_expenses
create table daily_financials (
  id                       uuid        primary key default gen_random_uuid(),
  organization_id          uuid        not null references organizations (id) on delete cascade,
  store_id                 uuid        not null references stores (id) on delete cascade,
  date                     date        not null,
  currency                 char(3)     not null default 'USD',

  gross_sales_minor        bigint      not null default 0,
  discounts_minor          bigint      not null default 0,
  refunds_minor            bigint      not null default 0,

  cogs_minor               bigint      not null default 0,
  shipping_minor           bigint      not null default 0,
  payment_fees_minor       bigint      not null default 0,

  meta_ad_spend_minor      bigint      not null default 0,
  google_ad_spend_minor    bigint      not null default 0,
  email_spend_minor        bigint      not null default 0,

  variable_expenses_minor  bigint      not null default 0,
  -- Share of fixed overhead allocated to this store on this day.
  fixed_expenses_minor     bigint      not null default 0,

  orders                   integer     not null default 0,
  units_sold               integer     not null default 0,

  computed_at              timestamptz not null default now(),
  unique (store_id, date)
);

create index on daily_financials (organization_id, date);

-- Derived measures, so profit is defined once in the database as well as
-- once in the application.
create view daily_financials_computed as
select
  df.*,
  df.gross_sales_minor - df.discounts_minor - df.refunds_minor
    as net_sales_minor,
  df.meta_ad_spend_minor + df.google_ad_spend_minor
    as ad_spend_minor,
  df.meta_ad_spend_minor + df.google_ad_spend_minor + df.email_spend_minor
    as marketing_spend_minor,
  df.cogs_minor + df.shipping_minor + df.payment_fees_minor
    + df.meta_ad_spend_minor + df.google_ad_spend_minor + df.email_spend_minor
    + df.variable_expenses_minor
    as total_variable_costs_minor,
  (df.gross_sales_minor - df.discounts_minor - df.refunds_minor)
    - (df.cogs_minor + df.shipping_minor + df.payment_fees_minor
       + df.meta_ad_spend_minor + df.google_ad_spend_minor + df.email_spend_minor
       + df.variable_expenses_minor)
    as contribution_profit_minor,
  (df.gross_sales_minor - df.discounts_minor - df.refunds_minor)
    - (df.cogs_minor + df.shipping_minor + df.payment_fees_minor
       + df.meta_ad_spend_minor + df.google_ad_spend_minor + df.email_spend_minor
       + df.variable_expenses_minor + df.fixed_expenses_minor)
    as net_profit_minor
from daily_financials df;

-- ---------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------
--
-- Every table is readable only by members of the owning organization.
-- Ingestion runs with the service role and bypasses these policies.

create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members m
    where m.organization_id = target_org
      and m.user_id = auth.uid()
  );
$$;

alter table organizations        enable row level security;
alter table organization_members enable row level security;
alter table stores               enable row level security;
alter table connections          enable row level security;
alter table sync_runs            enable row level security;
alter table products             enable row level security;
alter table product_costs        enable row level security;
alter table orders               enable row level security;
alter table order_items          enable row level security;
alter table refunds              enable row level security;
alter table marketing_spend_daily enable row level security;
alter table expenses             enable row level security;
alter table daily_financials     enable row level security;

create policy org_read on organizations
  for select using (is_org_member(id));

create policy member_read on organization_members
  for select using (is_org_member(organization_id));

create policy tenant_read on stores
  for select using (is_org_member(organization_id));
create policy tenant_read on connections
  for select using (is_org_member(organization_id));
create policy tenant_read on products
  for select using (is_org_member(organization_id));
create policy tenant_read on product_costs
  for select using (is_org_member(organization_id));
create policy tenant_read on orders
  for select using (is_org_member(organization_id));
create policy tenant_read on order_items
  for select using (is_org_member(organization_id));
create policy tenant_read on refunds
  for select using (is_org_member(organization_id));
create policy tenant_read on marketing_spend_daily
  for select using (is_org_member(organization_id));
create policy tenant_read on expenses
  for select using (is_org_member(organization_id));
create policy tenant_read on daily_financials
  for select using (is_org_member(organization_id));

create policy tenant_read on sync_runs
  for select using (
    exists (
      select 1 from connections c
      where c.id = sync_runs.connection_id
        and is_org_member(c.organization_id)
    )
  );

-- Expenses are the one table people edit by hand in the product.
create policy tenant_write on expenses
  for all
  using (is_org_member(organization_id))
  with check (is_org_member(organization_id));
