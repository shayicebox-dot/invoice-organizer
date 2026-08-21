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

Shopify revenue · returns · Meta Ads spend · Google Ads spend · email/SMS
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
| Gross sales, discounts, sales reversals, taxes, orders, units sold | **Live Shopify** (Overview, P&L, Marketing, Orders) |
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

Create a custom app on the store, enable the scopes below, and put its
credentials in `.env.local`:

| Scope | Needed for |
|---|---|
| `read_orders` | Revenue, returns, order edits, orders, units |
| `read_products` | Order line items and their variants |
| `read_inventory` | Shopify's cost per item, used for COGS |

`read_orders` alone runs the revenue integration. Without the other two, COGS
reports as missing rather than failing.

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

### Revenue matches Shopify Analytics exactly

`src/lib/shopify/sales.ts` reproduces Shopify's own Sales report rather than
approximating it:

```
Net Sales = Gross Sales − Discounts − Sales Reversals
```

Shopify's Sales report is not a view over an order's current totals. It is a
ledger of sale records, each stamped with the instant it happened, exposed on
`Order.agreements.sales`. Reading that ledger is what makes the dates right:

- an item added by an **order edit** is a sale on the day of the edit, even when
  the order was placed months earlier;
- a **return** is a reversal on the day the refund was issued, not on the day of
  the order;
- a return reverses the **value of the goods**, not the cash paid out, so
  refunded tax never touches revenue;
- **taxes** are reported separately and are never revenue.

Reading that ledger for every order would blow the Admin API's per-query cost
budget, and is unnecessary: an order that was never edited, returned, refunded
or cancelled has exactly one agreement, written at checkout, and its order-level
totals *are* that agreement. So the reader makes two passes — cheap order-level
totals for everything, the full ledger only for orders that can disagree with
them. The window is queried on `updated_at`, because an order edited inside the
window may have been placed long before it.

Verify it against the merchant's own report:

```bash
npm run verify:revenue -- 2026-08-01 2026-08-20
```

It prints the daily and period figures alongside the ShopifyQL query that
produces the same report inside Shopify. Expected values can be asserted, and
the command exits non-zero on any mismatch:

```bash
npm run verify:revenue -- 2026-08-01 2026-08-20 \
  --gross=49325.00 --discounts=699.50 --reversals=470.00 \
  --net=48155.50 --taxes=430.11 --orders=189
```

Nothing is baked in — every expected value comes from the command line, so the
same command verifies any range.

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

### The pack cost model

One rate, stated once: **$45 per ten boxes**, covering product, shipping,
storage and pick & pack together. Every bundle is built from tens, so every
bundle prices from the same rate:

| Bundle | Sells for | Operational cost | |
|---|---|---|---|
| 10 boxes | $115 | **$45** | |
| 20 boxes | $180 | **$90** | |
| 30 boxes | $295 | **$135** | 20 + 10 |
| 50 boxes | $390 | **$225** | |
| 70 boxes | $570 | **$315** | 50 + 20 |

Only the rate is configured. A 40 costs $180 and a 60 costs $270 without a code
change, and a bundle size introduced tomorrow prices itself. `rules` in the
settings file holds *exceptions* — a size whose cost genuinely diverges over
some window — and is normally empty.

The rate is quoted per ten but applies **per box**, so it prices any whole box
count: an assigned 25 costs $112.50, exactly 2.5 × $45. The arithmetic stays in
integer minor units, so that is $112.50 and not $112.49.

There is no separate COGS and fulfillment split, and nothing is read from
Shopify's cost per item or from inventory valuation — the business knows what a
box costs.

Plus **5% of Shopify net revenue** for other variable costs — payment
processing, Shopify fees and apps, and small variable operating expenses. It is
charged in addition to the pack costs, and excludes Meta and Google spend, which
come from the ad platforms directly. Because processing lives inside this 5%,
there is no separate payment-fee line.

### Historical product mapping

An order line is a *snapshot*. It records the SKU, product title and variant
title as they were on the day it was placed, and those drift: a variant is
renamed, a product is deleted, an item is typed straight into an order edit with
no product behind it at all. Anything that resolves a pack size by looking up
the catalog as it stands today quietly stops costing old orders — which is how a
June P&L ends up with a profit figure and no COGS.

So `src/lib/business-costs/pack-mapping.ts` resolves against a durable table
instead, in this order:

1. a **manual assignment** made on the Historical Product Mapping page, keyed on
   whichever identifier the line actually carries — its SKU where it has one;
2. a **built-in alias** for an identifier the business has used historically;
3. the **line's own text**, but only when it states a pack size unambiguously.

Step 3 refuses more than it accepts. A number only reads as a box count when
the text says so — next to a pack or box word (`30-pack`, `pack of 70`,
`20 boxes`), or as a whole segment of a SKU against a size the business is known
to sell (`KB-30-BLUE`). `Summer 2050 Collection` is not a 2050-pack and
`WHITE-US1` is not a 1-pack.

Two rules then disqualify a line from text matching entirely and send it to the
merchant instead:

- a **partial-quantity word** — `half of 50-pack` is not a 50-pack, and costing
  it as one overstates cost by $112.50 a unit;
- a **box count that is not a whole multiple of ten** — bundles are sold in
  tens, so a round ten read out of a title is almost certainly a real bundle
  and `25 pack` is almost certainly not.

#### Inferring a count is not the same as assigning one

These two restrictions govern what may be **inferred from text**, and nothing
else. A merchant reading the actual order may assign **any whole box count** on
the mapping page, and the rate prices it the same way.

That distinction is what makes the two July 2026 custom lines
(`half of 50-pack`, orders #3050 and #3051) work: they are genuine sales of 25
boxes, a count no regular expression should ever have guessed, assigned
explicitly and costed at $112.50 each. Two of them cost $225 — the same as the
one 50-pack they were split from, which is the arithmetic working.

#### Shopify's 60-day order window

An app without the `read_all_orders` scope can only read orders from the last
**60 days**. Older orders are not an error and not an empty page — they are
simply absent, which is the dangerous shape: revenue and cost both read as zero
for the invisible days, the period reconciles against itself, and the statement
reports a confident profit for a month it never loaded.

So the window is computed explicitly from the granted scopes
(`src/lib/shopify/history-window.ts`) and any range crossing it marks the P&L
incomplete, naming the cutoff and the number of days that could not be loaded.
Scopes Shopify declines to report count as restricted, not as permission.

`read_all_orders` is granted by Shopify on request for apps that genuinely need
order history; it cannot simply be added to an app's manifest.

#### Nothing partial is ever shown as profit

While any order line in a period is unmapped, `/` and `/profit-and-loss` report
**P&L INCOMPLETE**: gross profit, contribution profit, net profit and every
margin are withheld, and the responsible lines are named with their SKU, first
and last sale date, line-item count and quantity. Revenue and the costs that
*are* known still display. A cost total that silently omits a line makes profit
look better than it is, which is the failure this whole layer exists to prevent.

`/historical-mapping` lists every product identity ever seen on an order —
title, variant, SKU, first seen, last seen, quantity sold, detected pack size,
status — and assigns each one to 10, 20, 50, or **Exclude from costing**.

Reconcile several past periods at once:

```bash
npm run verify:history                                    # June, July, August 2026
npm run verify:history -- 2026-06-01:2026-06-30           # explicit periods
```

For each period it prints Shopify net sales, orders, the 10/20/50 pack
quantities, unmapped quantity, operational cost, Meta spend, Google spend, the
5% variable cost — and Net Profit **only** when the period is fully mapped. It
exits non-zero and names what is missing otherwise.

    Net Profit = Shopify net revenue
               − product COGS
               − shipping & fulfillment
               − 5% other variable costs
               − Meta Ads spend
               − Google Ads spend

**Mapping.** Every Shopify line item is mapped to a 10, 20 or 50 pack by reading
its SKU, then its variant or product title, and multiplied by the quantity
ordered. Mapping is deliberately strict: it needs a pack word beside the number
or the number as a whole SKU segment, so `100` never reads as `10` and a title
naming two sizes is ambiguous rather than resolved by picking one. An explicit
override on the Business Costs page beats anything read from text.

**Anything unmapped costs nothing and is named** as *Missing Cost Mapping*, and
the P&L is marked incomplete. List what needs mapping:

```bash
npm run verify:packs -- 2026-08-01 2026-08-10
```

It prints every product mapped to each pack size with its pack quantities and
cost, then everything that could not be mapped, and exits non-zero when anything
is outstanding.

Quantities throughout are **line-item pack quantities**, not individual boxes: a
quantity of 3 on a 20-pack line is three packs.

Verify the whole ladder end to end:

```bash
npm run verify:pl -- 2026-07-21 2026-08-19
```

It prints each source's provenance, then Shopify net revenue down through COGS,
fulfillment, the 5%, Meta and Google to Net Profit, and asserts the ladder
reconciles. Exit 2 while anything is still incomplete.

Both the Overview and Profit & Loss read this same path, so the pages and the
command cannot disagree.

**Klaviyo** contributes $0 and is labelled *Not configured* until a real
subscription cost is entered — never a mock figure.

### Cost of goods sold from Shopify (alternative source)

COGS can instead be read from **Shopify's own cost per item**. It is never
estimated from revenue.

For each order line in the range: the variant is identified, its inventory
item's unit cost is read, and COGS is that cost multiplied by the quantity.
Line costs roll into day totals and day totals into the range total, with
integer minor units throughout.

**Returns.** A unit returned to sellable inventory is not a cost, so its cost is
reversed — Shopify reports this per refund line as `restockType`. A return that
was *not* restocked (damaged, written off) keeps its cost, because the goods are
gone. The reversal is attributed to the order's date, matching how the refunded
amount is attributed, so revenue and its cost reverse on the same day.

**A variant with no cost recorded** contributes nothing and its SKU is listed as
missing. The dashboard marks the P&L incomplete and names the SKUs; it never
substitutes an average or a percentage.

Verify line by line against Shopify's own reports:

```bash
npm run verify:cogs -- 2026-08-01 2026-08-10
```

It prints order, SKU, quantity sold, quantity returned, cost per item, line COGS
and the range total, checks that line, day and range totals agree, and exits
non-zero if any SKU is missing a cost.

### Known limitations

- **Operational cost reverses on the order's date.** Revenue reversals are dated
  to the refund, but the pack cost model still reverses a returned pack's cost on
  the order's date. Within a range containing both dates the totals agree; a range
  that splits them shows the reversal on one side and its cost on the other.
- **60-day history.** Shopify restricts apps to the last 60 days of orders
  unless `read_all_orders` is granted. Days outside the accessible window report
  zero revenue rather than mock revenue.
- **One shop, three mock stores.** The mock dataset has three stores; the live
  integration has one. Live revenue overlays whichever store scope is selected,
  while the mock cost lines stay scoped to that store.
- **Page cap.** A window is read in at most 80 pages of 50 orders, and the sales
  ledger in at most 400 batches. Beyond either, the banner warns that the period
  is incomplete rather than reporting a short total as if it were whole.
- **Order-level pages still mock.** The Orders page's tiles are live; the order
  list below them is still sample detail.

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

## Business Costs

Everything that is not a provider API is configured on the **Business Costs**
page — no code edits. Each section reports its own provenance:

| Label | Meaning |
|---|---|
| `LIVE` | Read from a provider API |
| `MANUAL` | Configured on the Business Costs page |
| `MOCK` | Nothing configured — still generated demo data |
| `MISSING DATA` | Configured, but an input is absent, so the total understates |

### What can be configured

- **Product COGS** — either Shopify's own cost per item, or a per-SKU cost
  table. Costs carry effective dates, so a price change in March does not
  rewrite February. COGS is units actually sold in Shopify multiplied by the
  cost in force on that day.
- **Shipping & fulfillment** — per-order and per-unit rates, optional per-SKU
  overrides, and fixed 3PL fees.
- **Payment fees** — percentage plus flat fee per transaction, per processor,
  with a share-of-orders split when a store uses more than one.
- **Klaviyo** — the real subscription cost, prorated across the range.
- **Other expenses** — monthly, weekly, yearly or one-time, each with a
  category, start date and optional end date.

### Proration

Monthly amounts are divided across the days of their month, weekly across
seven days, yearly across the days of the year. The daily shares add back to
exactly the billed amount, so no cent is invented or lost, and a range that
covers part of a month is charged only for the days it contains.

Expense categories decide which side of the contribution line a cost sits on:
rent, payroll, software and professional services are overhead; everything else
moves with volume. That keeps Contribution Profit meaningful.

### Nothing is silently substituted

An unconfigured section keeps its mock figure and stays labelled `MOCK`. A
configured section missing an input — a SKU that sold with no cost recorded —
is labelled `MISSING DATA`, the affected SKUs are named, and the banner says
the P&L is overstated. The app never invents a plausible rate.

### Storage

Settings live in `data/business-costs.json`, written by Server Actions and
gitignored. This keeps the settings editable without a database, at the cost of
needing a writable filesystem — most serverless hosts do not have one. The
store is behind the same seam as the rest of the data layer, so moving it to
Supabase is a change inside `src/lib/business-costs/store.ts`.

### Per-SKU COGS needs two extra Shopify scopes

Costing units per SKU reads order line items, which needs `read_products` and
`read_inventory` on top of `read_orders`. The revenue integration is untouched
and still works on `read_orders` alone; without the extra scopes COGS simply
reports as missing.

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
npm run test       # node --test
npm run check      # lint + typecheck + test + build, in that order

npm run verify:revenue   # Shopify revenue against Shopify Analytics
npm run verify:year      # a full year: pagination, mapping and month/year reconciliation
npm run verify:history   # historical P&L across several past periods
npm run verify:packs     # pack mapping against the real catalog
npm run verify:cogs      # per-SKU cost of goods sold
npm run verify:pl        # the full live profit ladder
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
| `/orders` | Real Shopify orders, each costed with the pack model |
| `/products` | Units, revenue, COGS and gross margin per SKU |
| `/year` | A whole year: totals plus a month-by-month breakdown |
| `/expenses` | Variable and fixed expenses, and how allocation works |
| `/business-costs` | Pack cost rules, processing, Klaviyo and other configured costs |
| `/historical-mapping` | Every product identity seen on an order, and the pack size it costs at |
| `/connections` | Provider cards by category — Commerce, Advertising, Email & SMS, Fulfillment, Payments |
| `/stores` | Every store, its own P&L, and its connection count |
| `/settings` | Organization, profit definitions, money model, allocation method |

Every route accepts `?store=<id|all>` and
`?range=today|yesterday|7d|30d|this-month|ytd|12m|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`.
`/year` also accepts `?year=YYYY`.

### Long historical ranges

Every reader pages until the provider says there is nothing left. The bounds in
`src/lib/shopify/limits.ts` are runaway-loop backstops set far above any real
volume, not data caps — and when one binds, the reader sets `truncated` and the
P&L reports INCOMPLETE rather than handing back a short answer.

That last part is the whole point. A wide window does not fail loudly; it comes
back **short**, and a short range reads exactly like a quiet trading period.
Google Ads was the clearest case: its cursor loop stopped at a page bound and
returned whatever it had, with no signal at all. It now reports truncation, and
truncation withholds profit.

Windows that have already closed are cached for ten minutes rather than one,
since only a late edit or refund can still move them. A range including today
keeps the short cache.

### Orders come from Shopify, or not at all

Every other page degrades to generated data when a provider is unreachable,
which is defensible for a total labelled `mock`. An order row is different: it
is a claim about a specific transaction with a specific customer, so a
plausible invented one is not a degraded answer, it is a false one.

`/orders` therefore has no fallback. When Shopify cannot be read it shows
**Unavailable** and no table. The store name is the connected shop's own; the
order number, date, totals and status are the order's own; and a customer with
no name from Shopify is a **Guest customer**, never a generated one.

Customer names are protected data — Shopify releases them only to apps holding
`read_customers` *and* approved for protected customer data. The reader asks for
the field only when the scope is present and silently retries without it if
Shopify declines, so the page works either way and says which case it is in.

One number is deliberately absent: there is no per-order shipping or payment
fee. Under the pack model shipping sits inside the pack's operational cost and
processing sits inside the percentage of net revenue, so splitting either across
orders would be inventing a division the business never made.

#### The requested range is the spine

`getLiveDailyFinancials` builds one record per calendar day **from the range it
was asked for**, before consulting any source. A source with nothing to say
about a day leaves a zero; it cannot remove the day.

That ordering is not stylistic. The series used to be built from the generated
demo data — a fixed 120-day trailing window — and have live data merged onto it.
Every overlay is a `map` over the series it is given, so a requested day the
generator had never produced had no row for live data to land in. Shopify, Meta
and Google were all read successfully and **discarded**, and roughly seven
months of real trading reported as zero.

Nothing looked wrong. Every total agreed with every other total, because they
were all computed from the same short array. Reconciling a sum against its own
parts proves nothing when both share a truncated input.

So `assessDayCoverage` compares what came back against what was asked for —
day count, missing dates, duplicates, dates outside the range — and any gap
withholds profit like every other. The generated series is now one overlay
among several, supplying only the cost lines that have no real source
configured, and it never decides which days exist.

#### Four inputs, one gate

`assessCompleteness` (`src/lib/data/completeness.ts`) is the single place that
decides whether a profit figure may be shown. All four must hold:

| Input | Fails when |
|---|---|
| Range coverage | a requested day produced no record, appeared twice, or fell outside the range |
| Shopify range | disconnected, paging truncated, or part of the range beyond `read_all_orders` reach |
| Pack mapping | any order line has no box quantity |
| Meta Ads | not connected, or a short range |
| Google Ads | not connected, or a short range |

An **unconfigured** ad platform counts as a failure, not a zero. Either way its
spend is missing, marketing cost is understated, and profit comes out too high —
which is the kind of wrong that gets believed.

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
