# Architecture

A high-level map of the Profit Dashboard. One source of truth: **Supabase**.
One job: **the sync worker** pulls data from every platform on a cron, computes
true unit economics, and writes them back. The Next.js app reads from Supabase
only — no live calls to Shopify/Meta/etc. on page load, so the dashboard stays
fast and the platforms stay under their rate limits.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              SOURCES                                         │
│  Shopify (Kicksbox · ICEBOX · BRUNO)   Meta Ads   Google Ads   Klaviyo      │
└──────────────┬───────────────┬────────────────┬──────────────┬─────────────┘
               │               │                │              │
               ▼               ▼                ▼              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       SYNC WORKER  (Next.js /api/sync)                      │
│                                                                              │
│   • Runs every 15 min on Vercel Cron                                         │
│   • Pulls deltas (last 2 days by default, full backfill on demand)           │
│   • Joins orders ↔ products ↔ costs ↔ ad spend                              │
│   • Computes net profit per order + per product snapshot                     │
│   • Refreshes daily_store_metrics aggregate                                  │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │
                                 ▼
                ┌────────────────────────────────┐
                │           SUPABASE              │
                │     (Postgres + auth + RLS)     │
                │                                 │
                │  stores · products · variants   │
                │  product_costs · bundle_components
                │  orders · order_lines · refunds │
                │  customers · ad_campaigns       │
                │  ad_spend_daily · klaviyo_*     │
                │  inventory_snapshots · insights │
                │  daily_store_metrics (rolled-up)│
                └──────────────┬─────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS APP  (App Router · React Server Comp.)             │
│                                                                              │
│  /            Overview KPIs + trend charts                                   │
│  /products    Per-SKU & per-bundle profitability                             │
│  /orders      Order-level profit + ad attribution                            │
│  /inventory   Stock value + days-of-stock + reorder alerts                   │
│  /marketing   Campaign profitability (Meta · Google · Klaviyo)               │
│  /customers   LTV · profit · VIP score                                       │
│  /insights    AI insights generated daily by Claude                          │
└────────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────────┐
              │  AI INSIGHTS  (/api/insights/generate)
              │                                     │
              │  • Daily 07:00 UTC                   │
              │  • Builds a numbers-only snapshot    │
              │  • Sends to Claude (Sonnet 4.6)      │
              │  • Persists structured insights to   │
              │    Supabase `insights` table         │
              └─────────────────────────────────────┘
```

## Key design choices

**Snapshot, don't recompute.** When the sync writes an order, it also writes
the COGS, fees, shipping, and attributed ad spend *at that moment*. Historical
charts stay stable even if cost overrides change tomorrow.

**Multi-currency.** Each order keeps its native currency + an FX rate captured
at sync time. `daily_store_metrics` rolls up in USD. UI shows native amounts on
order detail, USD on dashboards.

**Bundles.** `bundle_components` links a bundle variant to its single-unit
component. Velocity, COGS, and inventory are computed against components, so
selling one 20-pack draws down 20 units of the underlying SKU.

**Attribution.** We store `utm_*` + `source_name` per order. The sync infers
`ad_platform`. A simple weighted attribution distributes daily ad spend across
orders by attributed revenue share. (MTA / data-clean-room upgrades can layer
on later without schema changes.)

**RLS off until needed.** Single-operator today. When you add team members,
enable RLS policies on each table — they're already created with
`alter table … enable row level security` so flipping the policy is the only
change required.

## Folder map

```
dashboard/
├── src/
│   ├── app/                     ← Next.js App Router (UI pages + API)
│   │   ├── page.tsx              · /          (Overview)
│   │   ├── products/page.tsx     · /products
│   │   ├── orders/page.tsx       · /orders
│   │   ├── inventory/page.tsx    · /inventory
│   │   ├── marketing/page.tsx    · /marketing
│   │   ├── customers/page.tsx    · /customers
│   │   ├── insights/page.tsx     · /insights
│   │   ├── settings/page.tsx     · /settings
│   │   └── api/
│   │       ├── sync/route.ts             ← pull everything, write to Supabase
│   │       ├── insights/generate/route.ts ← Claude-powered insights
│   │       └── overview/route.ts          ← KPI endpoint
│   ├── components/              ← shared UI (Sidebar, Charts, KpiCard, …)
│   └── lib/                     ← integrations + business logic
│       ├── shopify.ts            · GraphQL client + iterators
│       ├── meta.ts               · Marketing API client
│       ├── google.ts             · Google Ads REST client
│       ├── klaviyo.ts            · Reporting API client
│       ├── profit.ts             · CAC, MER, line economics
│       ├── currency.ts           · FX fetch + USD conversion
│       ├── ai.ts                 · Claude wrapper for insights
│       ├── supabase.ts           · admin + anon clients
│       ├── queries.ts            · read-side queries
│       ├── env.ts                · typed env reader
│       └── mock.ts               · seed data shown before any sync runs
├── supabase/schema.sql          ← run this first
├── vercel.json                  ← cron schedule
└── .env.example                 ← every credential you need
```
