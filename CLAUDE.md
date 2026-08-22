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
- Dashboard: 10 KPI tiles, revenue overview, marketing performance, profit
  breakdown, daily performance chart, recent orders table, data-source panel
- Period switcher (today / 7d / 30d / MTD / YTD) via `?period=`
- Money primitives and pure metric calculations in `src/core`
- Business and cost configuration in `src/lib/config/business.ts`
- A single data seam, `src/data/dashboard-source.ts`, returning empties
- Placeholder pages for Sales, Marketing, Products, Expenses, Settings

What does **not** exist yet, and must not be invented ad hoc:

- The financial database schema (no Supabase tables, no queries)
- VAT, tax, inventory and cash-flow modelling
- Any integration (Shopify, Meta Ads, Google Ads, invoicing systems, payments)
- Authentication flows and route protection
- Any real or sample financial data

Connecting real data means changing `src/data/dashboard-source.ts` to read from
repositories. The calculations and the UI above it should not need to change.

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
│   ├── money.ts                integer minor units, no floats
│   ├── period.ts               reporting ranges over YYYY-MM-DD
│   └── metrics/                dashboard calculations + types
├── data/
│   └── dashboard-source.ts     the seam where real data arrives (empty today)
├── integrations/               external systems — server only         (empty)
├── lib/
│   ├── config/business.ts      business facts and cost assumptions
│   ├── config/env.ts           the only place that reads process.env
│   ├── config/navigation.ts    single source of truth for navigation
│   ├── supabase/client.ts      browser client (anon key, RLS)
│   ├── supabase/server.ts      server client (user session, RLS)
│   ├── supabase/admin.ts       service-role client — server only
│   ├── utils/cn.ts             Tailwind class merge
│   ├── utils/format.ts         currency, date and percentage formatting
│   └── utils/today.ts          today in the business timezone
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

**Missing is not zero.**
A metric with no source reports "Not connected" (KPI tiles) or a dash (breakdown
rows), never `0`. `PeriodInputs` uses `null` for "no source yet", and any metric
depending on a null input is unavailable rather than computed. A chart with no
data draws an empty frame, not a line along the floor.

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
