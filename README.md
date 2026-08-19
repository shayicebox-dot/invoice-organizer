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

## Status: Phase 2 — Shopify, Meta Ads and Google Ads connected

The dashboard runs on **deterministic mock data**, except for Shopify revenue
and both ad platforms' spend, which are read live from their APIs.

| Metric | Source |
|---|---|
| Gross sales, discounts, refunds, orders, units sold | **Live Shopify** (Overview only) |
| Meta Ads spend | **Live Meta** (Overview only) |
| Google Ads spend | **Live Google Ads** (Overview) |
| Google Ads impressions, clicks, conversions, value | **Live Google Ads** (Marketing) |
| Klaviyo | Mock |
| COGS, shipping & fulfillment, payment fees | Mock |
| Variable and fixed expenses | Mock |

Ad Spend on the Overview is now live Meta + live Google Ads, and Net Profit,
Contribution Profit and every margin recompute from those live inputs.

Because Net Profit still subtracts mock COGS, shipping, fees and expenses,
**it is structurally correct but not yet accurate**. Every figure on the
Overview carries a `Live`, `Mock` or `Mixed` tag, and the banner at the top of
the page says the same in words.

Each provider is independent: Shopify can be live while Meta is unavailable, and
the banner reports them separately.

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

## Connecting Meta Ads

Put a token with the **`ads_read`** permission and the ad account id in
`.env.local`:

```bash
META_ACCESS_TOKEN="..."
META_AD_ACCOUNT_ID="act_1234567890"   # or just 1234567890
```

Restart the dev server. Meta Ads shows as **Live** in the Overview banner and
**Connected** on the Connections page.

### How it works

`src/lib/meta/insights.ts` calls `/act_{id}/insights` with `level=account` and
`time_increment=1`, which returns one row per day for the selected range — the
daily granularity the P&L needs. A single range total could not be spread
across days without inventing a distribution.

The overlay in `src/lib/data/live-meta.ts` replaces `metaAdSpend` and then
**recomputes** `adSpend` and `marketingSpend`. The profit ladder consumes
`marketingSpend`, so replacing only the Meta field would leave Net Profit
unchanged and the page silently wrong.

### Security

- The token is sent as an `Authorization: Bearer` header, never as an
  `access_token` query parameter. A token in a URL ends up in proxy logs,
  server access logs and browser history.
- Meta embeds the token in the `paging.next` URLs it returns. The client
  **strips it** before following the cursor, so pagination cannot carry the
  credential into a log.
- `server-only` on the client, insights and overlay modules, so importing any
  of them from a client component is a build error.
- Nothing is prefixed `NEXT_PUBLIC_`; no token reaches the browser bundle.

### Known limitations

- **Currency must match.** If the ad account bills in a different currency than
  the dashboard reports in, Meta spend falls back to mock and the banner says
  why. Subtracting EUR spend from USD revenue would produce a Net Profit that
  looks plausible and is wrong. Converting needs a daily FX rate table.
- **Timezone.** Meta buckets days in the *ad account* timezone; Shopify buckets
  in the *store* timezone. If they differ, a day boundary can disagree by a few
  hours of spend. Both timezones are disclosed in the UI.
- **Attribution is not revenue.** Only `spend` is read. Meta's attributed
  conversions and revenue are deliberately not used — Shopify remains the sole
  source of revenue.
- **API version.** Meta retires versions on a rolling schedule. If it reports an
  unsupported version, set `META_API_VERSION`.
- **Overview only.** The Marketing page still shows mock channel data.

---

## Connecting Google Ads

Add a service account as a **Read Only** user on the Google Ads manager
account, then put its credentials in `.env.local`:

```bash
GOOGLE_ADS_DEVELOPER_TOKEN="..."
GOOGLE_ADS_LOGIN_CUSTOMER_ID="2770007329"     # manager account
GOOGLE_ADS_CUSTOMER_ID="3230817078"           # account to read
GOOGLE_ADS_SERVICE_ACCOUNT_KEY_FILE="secrets/google-ads-service-account.json"
```

`secrets/` is gitignored. **Never commit the key file.**

If the service account cannot be added as a Google Ads user directly, set
`GOOGLE_ADS_IMPERSONATE_EMAIL` and grant domain-wide delegation for the
`https://www.googleapis.com/auth/adwords` scope instead.

### Verifying the connection

```bash
# Raw API check, independent of the app
node scripts/google-ads-connectivity-test.mjs 2026-08-01 2026-08-10

# The dashboard's own code path, with an expected total
npm run smoke:google-ads -- 2026-08-01 2026-08-10 2930.08
```

The smoke test also asserts that the overlay leaves Meta spend, COGS and
Shopify revenue untouched and that the profit ladder still reconciles.

### How it works

`src/lib/google-ads/client.ts` signs a service account JWT for the `adwords`
scope and exchanges it for an access token, which `google-auth-library` caches
and refreshes. Queries go to `googleAds:search` with the `developer-token` and
`login-customer-id` headers, following `nextPageToken` so a wide range is never
truncated.

The overlay in `src/lib/data/live-google-ads.ts` replaces `googleAdSpend` and
then **recomputes** `adSpend` and `marketingSpend`. Both ad overlays read the
other platform's figure off the day, so they compose in either order and
neither clobbers the other.

### Monetary aggregation

Costs arrive as `cost_micros`. Rounding each day to cents and then adding those
up loses money — ten days each a fraction of a cent short put a verified
10-day total three cents below the Google Ads UI.

So the range total is summed from the raw micros in BigInt and converted to
minor units exactly once. The per-day amounts are then derived from the
*running* micro total, which makes them sum back to that figure exactly while
each stays within a cent of its own value.

That property matters beyond the totals row: `summarize()` adds up the per-day
`googleAdSpend` values, so it is what keeps the dashboard's own Google Ads
total equal to the raw micro total rather than a few cents below it. Daily rows
stay honest for display, and no total is ever the naive sum of rounded parts.

`npm test` covers this, including a fixture that reproduces the original
four-cent loss so the regression cannot come back.

### Security

- `server-only` on the client, insights and overlay modules — importing any of
  them from a client component is a build error.
- The developer token and the service account key are read from the server
  environment. Nothing is prefixed `NEXT_PUBLIC_`, so nothing reaches the
  browser bundle.
- The service account JSON is parsed and handed straight to the JWT signer. Its
  contents are never stringified into a log or an error message; a failure
  names the *path*, never the file's contents.
- Error messages carry Google's own error code and message, which describe the
  failure without echoing credentials.

### Known limitations

- **Currency must match.** If the Google Ads account bills in a different
  currency than the dashboard reports in, spend falls back to mock with an
  explanation, rather than being subtracted from revenue in another currency.
- **Three time zones.** Google Ads buckets days in the ad account time zone
  (America/New_York here), Meta in its own ad account zone, and Shopify in the
  store zone. Where these differ, a day boundary can disagree by a few hours.
  Each zone is disclosed in the UI.
- **Zero days are omitted.** Google returns no row for a day with no activity;
  the overlay treats a missing day as zero spend, never as an error.
- **Marketing page.** Google Ads is live there; Meta and Klaviyo rows are still
  mock and labelled as such.
- **Attribution is not revenue.** Conversions and conversion value are shown for
  context only. Shopify remains the sole source of revenue.

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
