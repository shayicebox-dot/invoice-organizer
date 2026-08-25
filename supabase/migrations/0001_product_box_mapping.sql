-- How many physical boxes each Shopify variant contains.
--
-- Every cost in ICEBOX OS is per physical box, so this table is the foundation
-- the profit figures stand on. It is keyed by Shopify variant ID because that
-- is the only identifier that survives a product being renamed — a box count
-- read from a title would change the moment someone edits a product name, and
-- a shoe called "... - 40" would be costed as forty boxes.
--
-- A row of 0 is a real decision ("this is not packaging"), deliberately
-- different from having no row at all ("nobody has said yet").

create table if not exists public.product_box_mapping (
  variant_id      text primary key,
  boxes_per_unit  integer not null check (boxes_per_unit >= 0 and boxes_per_unit <= 1000),
  -- Kept for readability in the database only. The variant ID is the key; these
  -- are a snapshot of what the product was called when the decision was made.
  product_title   text,
  variant_title   text,
  updated_at      timestamptz not null default now()
);

comment on table public.product_box_mapping is
  'Physical boxes per unit for each Shopify variant. Keyed by variant ID so a product rename cannot change a cost.';

-- Row Level Security on with no policies: the table is unreachable by the anon
-- and authenticated keys, and only the service-role client on the server can
-- read or write it. ICEBOX OS authenticates its single owner with a signed
-- cookie rather than Supabase Auth, so there is no user context to write a
-- policy against — closing the table entirely is the correct posture.
alter table public.product_box_mapping enable row level security;
