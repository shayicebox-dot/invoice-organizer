# Ecom P&L

One truthful daily profit and loss view for an ecommerce business.

Connect the places money comes in and goes out, and see a single number that is
hard to argue with: **Net Profit**.

---

## The product

An ecommerce owner has revenue in Shopify, spend in Meta and Google, a bill from
Klaviyo, product costs in a spreadsheet, 3PL invoices in email, and a
bookkeeper three weeks behind. Every one of those systems reports a different
kind of "performance" and none of them reports profit.

Ecom P&L puts them on one page:

Shopify revenue · refunds · Meta Ads spend · Google Ads spend · email/SMS
platform cost · COGS · shipping and fulfillment · payment processing fees ·
other variable expenses · allocated fixed expenses → **net profit** and
**profit margin**.

### The rule that shapes everything

> **Shopify is the source of truth for revenue. Meta, Google and the email
> platforms are costs, not revenue sources.**

Ad platforms report attributed conversions and attributed revenue, and every one
of them claims the same order. Those figures are stored and shown on the
Marketing page as attribution context — they are never added into revenue.
Revenue comes from orders. Ad spend is a line in the cost stack.

### The profit ladder

```
Net Sales            = Gross Sales − Discounts − Refunds

Contribution Profit  = Net Sales
                       − COGS
                       − Shipping & Fulfillment
                       − Payment Fees
                       − Marketing Spend        (Meta + Google + email/SMS)
                       − Variable Expenses

Operating Profit     = Contribution Profit − allocated Fixed Expenses
```

**Operating Profit is displayed as Net Profit.** It is the largest figure on the
Overview, and it is the only hero number on the page.

Sales tax is collected on behalf of an authority, so it is stored on the order
for reconciliation and excluded from revenue.

---

## Status: Phase 2 — Shopify connected

The dashboard runs on **deterministic mock data**, except for Shopify revenue on
the Overview page, which is read live from the Shopify Admin GraphQL API.

| Metric | Source |
|---|---|
| Gross sales, discounts, refunds, orders, units sold | **Live Shopify** (Overview only) |
| COGS, shipping & fulfillment, payment fees | Mock |
| Meta Ads, Google Ads, Klaviyo | Mock |
| Variable and fixed expenses | Mock |

Because Net Profit subtracts mock costs from real revenue, **it is structurally
correct but not yet accurate**. Every figure on the Overview carries a `Live` or
`Mock` tag, and the banner at the top of the page says the same in words.

Only the Overview reads live data. Profit & Loss, Orders, Products, Marketing
and Expenses remain fully mock, so the two can be compared side by side.

- No fake API routes. Data is read through a typed data-access module that
  Supabase queries will replace.
- The mock generator produces the same record shapes the proposed schema
  defines, so the swap is a change inside `src/lib/data/` and nothing above it
  moves.
- Every Connect button other than Shopify is still an inert placeholder.

---

## Connecting Shopify

Create a custom app on the store, enable the **`read_orders`** scope, and put its
credentials in `.env.local`:

```bash
SHOPIFY_STORE_DOMAIN="example.myshopify.com"
SHOPIFY_CLIENT_ID="..."
SHOPIFY_CLIENT_SECRET="..."
```

Restart the dev server. The Overview banner turns green and the Connections page
shows Shopify as **Connected**.

Leave any variable blank and the app falls back to mock data and reports **Not
connected** — a missing credential is never an error state.

### How it works

`src/lib/shopify/client.ts` exchanges the client id and secret for an access
token using the **client credentials grant**, caches it in server memory, and
refreshes it two minutes before expiry. If Shopify rejects a token mid-flight,
the client refreshes once and retries. Requests time out after 15 seconds.

### Security

- The client module imports `server-only`, so importing it from a client
  component is a **build error**, not a runtime bug.
- Credentials are read from `process.env` on the server. Nothing is prefixed
  `NEXT_PUBLIC_`, so nothing reaches the browser bundle.
- The access token never leaves the server. Only aggregated daily totals are
  serialized into the page.
- Error messages carry the HTTP status only. Shopify echoes request parameters
  in some error bodies, so the body is deliberately not propagated — that is how
  a client secret ends up in a log.
- No credential is written to disk, to the database, or to the repository.

### Known limitations

- **Refund timing.** `totalRefundedSet` is attributed to the order's creation
  date, not the date the refund was issued. A refund on an older order shifts
  that older day. Correcting this needs a separate refunds query.
- **60-day history.** Shopify restricts apps to the last 60 days of orders
  unless `read_all_orders` is granted. Days outside the accessible window report
  zero revenue rather than mock revenue.
- **One shop, three mock stores.** The mock dataset has three stores; the live
  integration has one. Live revenue overlays whichever store scope is selected,
  while the mock cost lines stay scoped to that store.
- **Page cap.** A window is read in at most 25 pages of 100 orders. Beyond that
  the banner warns that the period is incomplete.
- **Order-level pages still mock.** The Orders page lists mock orders; only the
  Overview aggregates are live.

---

## Running locally

Requires **Node.js 20.9+** (Node 22 recommended) and npm.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

No environment variables are needed — Phase 1 has no external dependencies and
makes no network calls at runtime.

### Other commands

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run check      # lint + typecheck + build, in that order
```

`.env.example` documents the configuration Phase 2 will need. Copy it to
`.env.local` when Supabase and the provider integrations are wired up;
`.env.local` is git-ignored and no credential belongs in this repository.

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx              root document, fonts, metadata
│   └── (dashboard)/
│       ├── layout.tsx          sidebar + filter bar shell
│       ├── page.tsx            Overview
│       ├── profit-and-loss/
│       ├── marketing/
│       ├── orders/
│       ├── products/
│       ├── expenses/
│       ├── connections/
│       ├── stores/
│       └── settings/
├── components/
│   ├── layout/                 sidebar, filter bar
│   ├── ui/                     card, table, badge, dropdown, delta, icons
│   ├── dashboard/              KPI tiles, money flow, daily P&L table
│   └── charts/                 inline-SVG charts
└── lib/
    ├── money.ts                integer minor units — the money primitive
    ├── finance.ts              the P&L engine
    ├── types.ts                domain entities, one per table
    ├── date-range.ts           period presets and boundaries
    ├── view-params.ts          URL → store + period selection
    └── data/
        ├── catalog.ts          static reference data
        ├── random.ts           seeded, deterministic PRNG
        ├── generate.ts         the mock dataset
        └── index.ts            ← the data-access boundary
```

### Layering

**`lib/money.ts` — the money primitive.** `Money` is a branded integer type
holding minor currency units. A raw `number` cannot be used where money is
expected, and money cannot be combined with `+` — every operation goes through a
helper that keeps the result an integer. Rates (the 2.9% processing fee) apply
through one rounding function. Splitting an amount hands out leftover minor
units one at a time, so the parts always sum back to the whole.

**`lib/finance.ts` — the P&L engine.** Net Sales, Contribution Profit and
Operating Profit are defined once. A KPI card, a chart point and a table row for
the same day cannot disagree, because all three are derived from the same
`DailyFinancials` record through the same functions.

**`lib/data/index.ts` — the data-access boundary.** Every page calls a `get*`
function here and never touches the generator. The functions are `async` even
though the mock data is in memory, so call sites already await and the swap to
real I/O is a one-directory change.

**Server components by default.** Only four components are client-side: the
sidebar (active-route highlighting), the filter bar (URL updates), and the two
charts (pointer interaction).

### State lives in the URL

The store and the period are query parameters (`?store=…&range=…&from=…&to=…`).
Every page resolves the same selection from the same string, nav links carry it
forward, and any view can be shared as a link. Malformed values fall back to the
last 30 days rather than throwing.

### Charts

Hand-written inline SVG, with no charting dependency. Two series, with a
validated colorblind-safe palette, thin marks, hairline gridlines, a legend
whenever more than one series is present, and a crosshair tooltip. Every value a
tooltip shows is also present in the Daily P&L table below it.

---

## Routes

| Route | What it answers |
|---|---|
| `/` | Overview — KPI row, today's money flow, net profit trend, revenue vs expenses, daily P&L |
| `/profit-and-loss` | Full statement, each line as a share of net sales, margins, per-store split |
| `/marketing` | Spend by channel, blended ROAS, MER, cost per order, attribution caveats |
| `/orders` | Recent orders with per-order contribution after product, shipping and fees |
| `/products` | Units, revenue, COGS and gross margin per SKU |
| `/expenses` | Variable and fixed expenses, and how allocation works |
| `/connections` | Provider cards by category — Commerce, Advertising, Email & SMS, Fulfillment, Payments |
| `/stores` | Every store, its own P&L, and its connection count |
| `/settings` | Organization, profit definitions, money model, allocation method |

Every route accepts `?store=<id|all>` and
`?range=today|yesterday|7d|30d|this-month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.

---

## Data model

Full schema: [`docs/schema.sql`](docs/schema.sql). Rationale and allocation
rules: [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md).

Tables: `users`, `organizations`, `organization_members`, `stores`,
`connections`, `sync_runs`, `products`, `product_costs`, `orders`,
`order_items`, `refunds`, `marketing_spend_daily`, `expenses`,
`daily_financials`.

Every table carrying an amount also carries `organization_id`, `store_id`,
`date` and `currency`. Money columns are `BIGINT` in minor units with a `_minor`
suffix. Row-level security scopes every read to the members of the owning
organization.

`daily_financials` is a materialized roll-up rebuilt from the raw tables — the
dashboard reads it, ingestion never writes it directly, and recomputing it
cannot corrupt history.

### Multi-store

Multi-store is a dimension, not a feature flag. Any store can be read on its
own or rolled up with the others. Shared overhead is split across stores each
day in proportion to that day's net sales, so a store that sold nothing absorbs
none of the warehouse lease.

---

## The mock dataset

120 days across three stores, generated from a seeded PRNG keyed by
store + date + purpose. The same input always produces the same output, so a
server render, a re-render and a rebuild never disagree.

The generator writes individual orders, order items, refunds, daily channel
spend and dated expenses, then rolls them up exactly the way an ingestion job
would. Nothing on screen is a stored total: change a product cost and COGS,
gross margin and net profit all move.

Sanity-check the totals without opening a browser:

```bash
npx tsx scripts/check-dataset.ts
```

It prints today's roll-up, the 30-day summary, and asserts that
`net sales − total costs === net profit`.

---

## Future integration architecture

Phase 1 stops at the data-access boundary on purpose. Phase 2 fills in behind
it.

**1 — Supabase.** Apply `docs/schema.sql` as the first migration. Replace the
bodies of the `get*` functions in `src/lib/data/index.ts` with queries against
`daily_financials`, `orders` and the rest. No page or component changes.

**2 — OAuth.** Each provider gets a route pair: one that starts the
authorization flow, one that receives the callback, exchanges the code, writes
the token to the secret manager and stores the resulting pointer in
`connections.credential_ref`. The app-level client id and secret come from the
environment; per-merchant tokens never touch the repository or the application
database.

**3 — Ingestion.** One connector per provider, each writing only its own
tables:

| Connector | Writes |
|---|---|
| Shopify | `orders`, `order_items`, `refunds`, `products` |
| Meta Ads | `marketing_spend_daily` (channel `meta_ads`) |
| Google Ads | `marketing_spend_daily` (channel `google_ads`) |
| Klaviyo / Omnisend / Mailchimp | `marketing_spend_daily` (email/SMS channels) |
| ShipBob / ShipStation | shipping cost on `orders` |
| Stripe / Shopify Payments / PayPal | `orders.payment_fees_minor` |

Every connector is idempotent on the provider's own identifier
(`orders.external_id`, `marketing_spend_daily (store_id, channel, date)`), so a
re-run overwrites rather than duplicates.

**4 — Roll-up job.** After each sync, rebuild `daily_financials` for a trailing
window (`SYNC_LOOKBACK_DAYS`) rather than only the current day — refunds land
days late and ad platforms restate spend for up to 72 hours. `sync_runs`
records what ran and what failed, so a gap in the data is explainable.

**5 — Then, and only then:** alerting on margin drops, cash flow, LTV/cohorts,
and forecasting. None of it is worth building before the profit number is
trustworthy.

---

## A note on this repository

`invoices.py` and `requirements.txt` are an earlier, unrelated Gmail invoice
downloader that predates this application. They are left in place and are not
part of the Next.js app.
