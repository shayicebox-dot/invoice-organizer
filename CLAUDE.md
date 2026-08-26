@AGENTS.md

# ICEBOX OS

Internal financial operating system for **ICEBOX**, an Israeli e-commerce business.

This is **not** an analytics dashboard. It is being built to become the financial
source of truth for the business: the numbers it reports must be correct,
explainable and defensible to an accountant and to the Israeli Tax Authority.

Everything below is binding for anyone — human or agent — working in this repo.

---

## 1. Current state

MVP dashboard over an empty data source. What exists:

- Next.js App Router + TypeScript (strict) + Tailwind CSS v4
- Supabase client factories (browser / server / service-role) — installed, not used yet
- Dashboard layout: sidebar, top bar, responsive desktop and mobile chrome
- Dashboard: net profit hero, a plain-language status line, break-even gauges
  for CPA and ROAS, the profitability waterfall, daily chart, demoted detail
  metrics, marketing performance, recent orders, data-source panel
- Comparison against the previous period of the same length on the headline
  figures, with colour following whether the change is good news rather than
  its direction
- Date range picker: quick presets plus a manual start/end calendar, carried in
  the URL as `?from=&to=` and applied identically on every screen
- Money primitives and pure metric calculations in `src/core`
- Business and cost configuration in `src/lib/config/business.ts`
- Shopify is the live source for orders, revenue, discounts and refunds
- Sales and Products read real Shopify orders; Marketing reads real Meta Ads
  performance; Expenses reports the full cost breakdown
- Profitability engine: VAT, per-box COGS and shipping, a variable rate, and
  monthly fixed costs allocated across the selected days, down to net profit
- Settings: Shopify, Meta Ads and Morning connection status, each with a
  server-side "Test connection" check
- Single-owner login: password in `ICEBOX_ADMIN_PASSWORD`, signed HTTP-only
  session cookie, middleware protecting every page and action, sign-out button
- Shopify Admin GraphQL integration in `src/integrations/shopify` — client
  credentials auth, connection test and order reads
- Meta Ads Marketing API integration in `src/integrations/meta` — system user
  token auth, connection test and Insights reads
- Meta is the live source for ad spend, and feeds Marketing spend, ROAS and CPA
  on the dashboard plus the whole Marketing screen
- Morning (Green Invoice) integration in `src/integrations/morning` — API key
  pair exchanged for a short-lived JWT, and a read-only connection test. It
  proves authentication works and nothing more: no figure on any screen depends
  on it

What does **not** exist yet, and must not be invented ad hoc:

- The financial database schema (no Supabase tables, no queries)
- Income tax and corporate tax; inventory and cash-flow modelling
- Deductible input VAT on expenses — output VAT is separated, input VAT is not
- Payment processing measured separately, rather than inside the 5% rate
- Google Ads and payment integrations
- Any use of Morning beyond proving the connection — no documents are read, and
  revenue still comes from Shopify alone
- Storage of imported Shopify orders (each page load reads Shopify live)
- Any real or sample financial data

Shopify orders are read live on each page load and aggregated in `src/core`;
nothing is stored yet. Without the `read_all_orders` scope Shopify serves only
the last 60 days, so a longer period is trimmed and the screen says so.

The repo also contains an unrelated legacy Python script (`invoices.py`) that
downloads invoice attachments from Gmail. It is not part of ICEBOX OS. Leave it
alone unless explicitly asked.

---

## 2. Stack

| Concern    | Choice                                        |
| ---------- | --------------------------------------------- |
| Framework  | Next.js (App Router, React Server Components) |
| Language   | TypeScript, `strict` plus extra safety flags  |
| Styling    | Tailwind CSS v4, design tokens in CSS vars    |
| Database   | Supabase / PostgreSQL                         |
| Auth       | Supabase Auth                                 |
| Icons      | lucide-react                                  |
| Deployment | Vercel                                        |

---

## 3. Commands

```bash
npm run dev        # local dev server
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run check      # typecheck + lint — run before every commit
```

---

## 4. Architecture

Four layers. Dependencies point **downwards only**. A layer never imports from a
layer above it.

```
  UI            src/app, src/components      React, layout, formatting
   │
   ▼
  Business      src/core                     pure financial logic, no I/O
   │
   ▼
  Data          src/data                     Supabase reads/writes, repositories
   │
   ▼
  Integrations  src/integrations             external APIs, raw payload capture
```

`src/lib` is shared plumbing (env, config, Supabase clients, small utils) and may
be used by any layer, subject to the server/client rules in §7.

### Directory map

```
src/
├── app/
│   ├── layout.tsx              root layout, fonts, theme bootstrap
│   ├── login/                  the only page reachable without a session
│   ├── page.tsx                redirects to /dashboard
│   ├── globals.css             design tokens + Tailwind entry
│   └── (app)/                  authenticated application shell
│       ├── layout.tsx          renders <AppShell>
│       ├── dashboard/          KPIs, sections, chart, orders table
│       ├── sales/  marketing/  products/  expenses/
│       └── settings/
├── components/
│   ├── dashboard/              KPI tile, metric row, sections, chart
│   ├── layout/                 AppShell, sidebar, topbar, theme, placeholders
│   └── ui/                     Card, Badge, PageHeader, EmptyState
├── core/                       business logic — pure, no I/O
│   ├── money.ts                integer minor units, decimal parsing, no floats
│   ├── period.ts               reporting ranges, presets, calendar arithmetic
│   └── metrics/                dashboard, sales, advertising, boxes, P&L,
│                                break-even, period comparison, status summary
├── data/
│   ├── shopify-orders.ts       Shopify payloads → SalesOrder (the mapping)
│   ├── dashboard-source.ts     dashboard totals, daily series, recent orders
│   ├── sales-source.ts         order-level and product-level reads
│   ├── marketing-source.ts     Meta spend and campaign performance
│   ├── profitability-source.ts assembles the P&L from Shopify, Meta and config
│   └── box-mapping-store.ts    variant → box mapping, stored in the database
├── integrations/               external systems — server only
│   ├── shopify/                Admin GraphQL client, connection test, orders
│   ├── meta/                   Marketing API client, connection test, insights
│   └── morning/                Green Invoice auth and connection test only
├── lib/
│   ├── auth/session.ts         signed session token (Edge + Node safe)
│   ├── auth/actions.ts         sign in and sign out (server actions)
│   ├── auth/current-session.ts is this request signed in?
│   ├── config/business.ts      business facts, cost model, VAT schedule
│   ├── config/products.ts      seed variant → box mapping, preset choices
│   ├── config/env.ts           the only place that reads process.env
│   ├── config/navigation.ts    single source of truth for navigation
│   ├── supabase/client.ts      browser client (anon key, RLS)
│   ├── supabase/server.ts      server client (user session, RLS)
│   ├── supabase/admin.ts       service-role client — server only
│   ├── utils/cn.ts             Tailwind class merge
│   ├── utils/format.ts         currency, date and percentage formatting
│   ├── utils/today.ts          today in the business timezone
│   └── utils/reporting-period.ts  the one place a screen resolves its dates
└── types/                      shared types, generated DB types
```

Each of `core/`, `data/`, `integrations/` has a `README.md` restating its rules.
Read it before adding files there.

---

## 5. Rules for financial correctness

These are the rules that make this system trustworthy. They are not negotiable.

**No financial assumptions in UI components.**
A rate, threshold, fee percentage or classification rule must never appear in a
component, a page, or a Tailwind class. VAT rates, tax rates, processing fee
percentages and shipping rules live in configuration or in the database, and are
passed into `src/core` functions as explicit inputs. If you find yourself typing
`0.18` in a `.tsx` file, stop.

**Every figure must be auditable and traceable.**
Any displayed monetary value must be reconstructible from stored source records:
which orders, invoices, expenses or ad-spend rows produced it, which rates were
applied, and over which period. Design calculations so they can return their
inputs alongside their result. Never display a number the system cannot explain.

**Money is integer minor units.**
Store and compute money as integers in agorot (1 ILS = 100 agorot) together with
an explicit currency code. Never use JavaScript floats for money. Round only at
the last step, in one place, with the rounding rule stated.

**Source records are immutable.**
Imported data (Shopify orders, ad spend, invoices) is stored as received and
never edited in place. Corrections are additional rows with their own reason and
timestamp, so history stays reconstructible.

**Multi-currency is explicit.**
Amounts carry their currency. Conversions record the rate and its date. Never
mix currencies in a sum.

**No sample, mock or estimated data in the UI.**
An empty state is correct; a plausible-looking fake number is a defect. Real
figures appear only once they come from a real source through a real calculation.

**One date system, resolved in one place.**
Every screen gets its range from `reportingPeriod()`, which reads `?from=&to=`
from the URL, and hands that one `DateRange` to every source it reads. A quick
preset is not a second mode — it is a shortcut that produces the same two dates
a person could type, so presets and custom ranges cannot drift apart. Sharing
or refreshing a link therefore reproduces the same figures. `last7` and
`last30` cover complete days and exclude today, matching Meta Ads Manager; a
part-day at the end would drag every rate down. A range that cannot be honoured
is reported, never silently swapped — see `PeriodAdjustment`.

**A box count comes only from an explicit variant mapping.**
Nothing is ever read out of a product title. "Asics Gel NYC Barely rose - 40"
is a shoe in size 40, and parsing it would charge ₪480 of product cost against
a pair of trainers. The mapping is keyed by Shopify variant ID — the only
identifier that survives a rename — stored in the database and edited in
Settings → Product mapping, never in source code. A variant with no decision
recorded counts as zero boxes, so an ordinary product is never costed as
packaging; that silence is reported everywhere the figures are, because a real
box pack left unset also costs nothing and would overstate profit.

**Cost is per physical box, never per pack.**
Customers combine packs freely — 30 boxes is a 20 and a 10, 60 boxes is any
combination totalling 60 — so nothing may be costed from an order's size or a
pack's name. `src/core/metrics/boxes.ts` resolves each line to a box count from
its Shopify variant ID, and every cost is that count times a per-box rate. A
line it cannot resolve reports `null`, which makes the period's COGS incomplete
and says so on screen; it never contributes a silent zero. A count inferred from
a product title is marked as inferred everywhere it appears, because a rename
would otherwise change a cost without anyone noticing.

**VAT is separated once, at the total.**
Customer prices and supplier costs are both VAT inclusive. VAT is stripped from
each period total in one place — `excludeVat` — rather than per order or per
box, because rounding many small amounts drifts from what a VAT return says.
Everything below the VAT line in the P&L is ex VAT, and the VAT-inclusive
figures Shopify reports are kept alongside rather than replaced.

**Sales definitions match Shopify Analytics, line for line.**
Gross sales are built from **line items** — `originalTotalSet`, the price when
the order was created — never from `Order.subtotalPriceSet`. Shopify documents
that subtotal as being after discounts *and returns*, so it shrinks when goods
come back; reconstructing gross from it and then subtracting the period's
returns deducts the same return twice. Discounts come from each line's
`discountAllocations`, which unlike `totalDiscountSet` include order-level and
code-based discounts.
Net revenue is gross − discounts − **sales reversals**, which is Shopify's Net
sales. Two traps decide whether the two systems agree, and both are handled in
`src/data/shopify-orders.ts`: a return is dated by **the refund**, not by the
order it was against, so returns processed this period against earlier orders
are counted; and the amount is the **product subtotal**, not the cash returned,
because cash also carries shipping and tax that were never in gross sales. The
Sales screen shows all four lines in Shopify's own vocabulary so any
disagreement is attributable rather than a single total to argue with.

**Say what a figure does not include.**
Where the store prices tax-inclusively, Shopify's amounts carry VAT, and the
screen says so rather than presenting a VAT-inclusive total as revenue. The same
applies to a period trimmed to available history, and to totals read from an
incomplete page sweep.

**"Not a source" is not "missing".**
Total marketing spend is summed over `BUSINESS_CONFIG.adPlatforms` — the
platforms the business actually advertises on. A platform ICEBOX does not use
contributes nothing rather than blocking the total forever; a platform it does
use but has not connected makes the total unavailable. A source that failed to
answer is likewise distinct from one that answered with zero: see
`sourceAnswered`.

**Missing is not zero.**
A metric with no source reports "Not connected" (KPI tiles) or a dash (breakdown
rows), never `0`. A metric whose inputs exist but whose value is undefined — an
average over no orders — shows a dash instead, distinguished by
`unavailableKind`. Within a window a source fully covers, a day with no orders
is a measured zero and is charted as one. `PeriodInputs` uses `null` for "no source yet", and any metric
depending on a null input is unavailable rather than computed. A chart with no
data draws an empty frame, not a line along the floor.

**Two sources are never blended across mismatched periods or currencies.**
ROAS and CPA divide Meta spend by Shopify figures. Both sides must cover the
same range — the dashboard reads Meta over the range Shopify was actually able
to serve, not the range that was requested — and both must be in the reporting
currency. When either condition fails the figure is withheld with a stated
reason rather than computed. Ad spend also carries the platform's day
boundaries: Meta buckets a day in the ad account's timezone, Shopify in the
business timezone, and the gap is measured and shown, never silently corrected.

**A platform's attribution is its own claim, not the store's record.**
Meta's purchases and purchase value come from Meta's attribution window and
will not match Shopify's orders. They are shown as Meta's figures, labelled as
such, beside the store's — never merged into one number.

**One hero figure, and the reader's first question answered first.**
The dashboard leads with net profit and nothing else at that size — a screen
with two things competing for first place has no first place. Profit or loss is
carried by the label, the sign and a restrained tint together, never by colour
alone. Break-even is drawn as a marker part-way along a track so "past the
line" and "short of the line" are told apart before any figure is read, and the
gap it shows is exact: `net profit = orders × (break-even CPA − actual CPA)`.
Cost detail is demoted below the fold rather than removed.

**Israeli context is a first-class concern.**
VAT (including rate changes over time), VAT reporting periods, zero-rated
exports, Osek/Chevra distinctions and the ILS reporting currency are modelled
deliberately — never hardcoded to today's values.

---

## 6. TypeScript rules

`strict` is on, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride` and
`verbatimModuleSyntax`.

- `any` is banned (ESLint error). Use `unknown` and narrow.
- No non-null assertions (`!`) on data that crosses a boundary — validate.
- Type imports use `import type`.
- Prefer `readonly` on props and module-level constants.
- Domain types are explicit; do not lean on inference across layer boundaries.
- Validate anything entering the system from outside (API payloads, form input,
  env vars) rather than casting it.

---

## 7. Security rules

- **Never expose secrets to the browser.** `SUPABASE_SERVICE_ROLE_KEY` and every
  future API credential are server-only, and must never be prefixed
  `NEXT_PUBLIC_`.
- `src/lib/supabase/admin.ts` bypasses Row Level Security. It imports
  `server-only`, so importing it from client code is a build error. Use it only
  for trusted background work (sync jobs, webhooks, scheduled imports).
- Default to `src/lib/supabase/server.ts`, which runs as the signed-in user under
  RLS.
- Every table gets RLS enabled with explicit policies when the schema is built.
- `process.env` is read only in `src/lib/config/env.ts`.
- Financial data is never sent to third parties, logged in plaintext, or included
  in client-side error reporting.
- **Integration credentials are server-only.** Every file in
  `src/integrations` imports `server-only`. An external host that receives a
  credential is validated before the request is made — see
  `normaliseShopDomain`, which refuses to send Shopify credentials anywhere but
  `<store>.myshopify.com`.
- **Prefer short-lived credentials.** Shopify authenticates through the client
  credentials grant: a 24-hour token minted from the client secret, cached in
  memory and refreshed before expiry. No long-lived API token is stored.
- **Credentials travel in headers, never in URLs.** Meta accepts its access
  token as a query parameter; ICEBOX sends it as `Authorization: Bearer`
  instead, because query strings reach server logs, proxies and error reports.
- **A read-only integration exposes no way to write.** The Morning client has
  a `GET` and nothing else, so no code path in ICEBOX OS can create, alter or
  cancel a document in the accounting system. Where a host is chosen rather
  than configured — Morning's production and sandbox URLs are fixed constants —
  a wrong environment variable cannot redirect credentials somewhere else.
- **One owner, one password.** `ICEBOX_ADMIN_PASSWORD` is the login credential
  and the key that signs session cookies, so rotating it signs every device out.
  `src/proxy.ts` requires a valid session for every route except the login
  screen; unset means nothing is reachable, never everything.
- **Sessions are signed, not stored.** The cookie is HTTP-only, `SameSite=Lax`,
  `Secure` in production, and holds only a signed expiry — no password, no
  derived key. Actions touching real data re-check the session themselves rather
  than trusting the proxy matcher.
- **Diagnostic endpoints fail closed.** `/api/integrations/*/test` requires
  `ICEBOX_INTEGRATION_TEST_SECRET`; unset means disabled, never public.
- **Server actions return explicit view models.** An action feeding the browser
  maps its result onto a narrow type (see `ShopifyConnectionView`) rather than
  passing an internal object through, so a field added upstream cannot reach the
  client unnoticed.
- `.env.local` is git-ignored. `.env.example` documents variable names only —
  never values.

---

## 8. UI conventions

Design direction: premium financial SaaS — Stripe Dashboard, Linear, modern CFO
software. Clean, minimal, dense but calm. No decorative gradients, no shadows
beyond a hairline, no marketing flourish. This is an internal tool used daily.

- Colours come from the tokens in `globals.css` (`--surface`, `--foreground`,
  `--border`, `--accent`, `--positive`, `--negative`). Never use raw Tailwind
  palette colours (`bg-blue-500`) in components.
- Both light and dark themes must work. The `dark` class on `<html>` is the
  source of truth.
- Columns of numbers use the `.numeric` class (tabular figures) so they align.
  Standalone display values (KPI tiles) use proportional figures — tabular digits
  look loose at large sizes.
- Charts: hairline solid gridlines, 2px lines, ~10% area washes, axis ticks on
  round numbers, and labels only at the extremes — never on every point.
- Server Components by default. `'use client'` only where interactivity or
  browser APIs are genuinely required, and as far down the tree as possible.
- Layout is responsive: sidebar collapses to a drawer below `lg`.
- Every interactive element is reachable by keyboard and has an accessible name.
- Formatting (currency, dates, percentages) belongs in shared formatters, not
  inline in components — and formatting is never a substitute for calculation.

---

## 9. Adding a module

1. Add it to `NAV_SECTIONS` in `src/lib/config/navigation.ts`.
2. Create `src/app/(app)/<module>/page.tsx`.
3. Business logic → `src/core/<domain>/`. Queries → `src/data/`. External API
   calls → `src/integrations/<provider>/`.
4. The page composes; it does not calculate.

Current modules: Dashboard, Sales, Marketing, Products, Expenses, Settings.

Planned for later, once there is real data behind them: Inventory, VAT, Taxes,
Cash Flow. Their placeholder routes were removed from the MVP rather than left
unreachable in the sidebar.

---

## 10. Working agreements

- Run `npm run check` before committing. Both must pass.
- Do not add dependencies without a clear reason; prefer the platform.
- Do not build the financial schema, VAT/tax logic or integrations until they
  are explicitly requested — an approximate implementation is worse than none in
  this system.
- New figures go through `src/core` and carry their formula and inputs. A page
  composes metrics; it never computes one.
- When a financial requirement is ambiguous (rounding, VAT treatment, cost
  allocation, refund handling), ask. Do not guess and do not silently pick a
  convention.
- Keep this file current when architecture or rules change.
