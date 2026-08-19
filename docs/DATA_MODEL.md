# Data model

The schema that runs is `docs/schema.sql`. This document explains *why* it is
shaped that way, and how the mock data layer maps onto it.

## Principles

**Shopify is the source of truth for revenue.** Orders and refunds define what
was earned. Meta, Google and the email platforms write to
`marketing_spend_daily` and nowhere else — their reported conversions and
revenue are stored, but only ever displayed as attribution context. They are
never summed into revenue.

**Money is integers.** Every amount is a `BIGINT` count of minor currency units,
with the `_minor` suffix on the column name so the unit cannot be misread. The
application mirrors this exactly (`src/lib/money.ts`), so no conversion happens
at the boundary and no float ever holds money.

**Every financial row is tenant- and time-scoped.** `organization_id`,
`store_id`, `date` and `currency` appear on every table that carries an amount.
That quartet is what row-level security is written against and what every query
filters on.

**Raw records are immutable history; the roll-up is derived.** `orders`,
`refunds`, `marketing_spend_daily` and `expenses` are written by ingestion.
`daily_financials` is rebuilt from them and is the only table the dashboard
reads. Recomputing it can never corrupt the underlying history.

## Tables

| Table | Grain | Purpose |
|---|---|---|
| `users` | one per person | Profile fields alongside Supabase `auth.users`. |
| `organizations` | one per tenant | The billing and reporting boundary. |
| `organization_members` | user × org | Role-based access (`owner`/`admin`/`analyst`/`viewer`). |
| `stores` | one per storefront | Multi-store is a first-class dimension, not an afterthought. |
| `connections` | store × provider | Link to an external provider. Holds a `credential_ref`, never a token. |
| `sync_runs` | one per ingestion run | Makes a gap in the data explainable. |
| `products` | one per SKU per store | Catalog. |
| `product_costs` | product × validity window | Historical unit cost, so past orders keep the cost that applied then. |
| `orders` | one per order | Gross sales, discounts, shipping charged and paid, processing fees. |
| `order_items` | one per line | Quantity, unit price, and a snapshot of unit cost. |
| `refunds` | one per refund | Dated on the day issued, with COGS recovered on restock. |
| `marketing_spend_daily` | store × channel × day | Spend, impressions, clicks, and platform-claimed attribution. |
| `expenses` | one per expense | Fixed (recurring) and variable (dated) costs. |
| `daily_financials` | store × day | Materialized roll-up. What the dashboard reads. |

## The profit ladder

Defined once in `src/lib/finance.ts` and once as the `daily_financials_computed`
view, so the application and the database agree by construction.

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

**Operating Profit is what the dashboard calls Net Profit.** It is the one
number the product exists to get right.

### What is deliberately excluded from revenue

- **Sales tax / VAT.** Collected on behalf of an authority and remitted. It is
  stored on `orders.taxes_minor` for reconciliation, and never counted as
  revenue.
- **Platform-attributed revenue.** Meta and Google each claim the same order.
  Adding them would double- or triple-count. Stored, displayed on the Marketing
  page, never summed into the P&L.

## Allocation rules

**Fixed expenses across days.** A monthly expense is divided by the number of
days in its month. Leftover minor units are handed out one per day from the
start of the month, so the daily shares add back to the exact monthly amount
(`allocate()` in `src/lib/money.ts`).

**Shared overhead across stores.** An expense with `store_id IS NULL` is
organization-wide. Each day it is split across stores in proportion to that
day's net sales, with the remainder given to the largest share. A store that
sold nothing that day absorbs none of the warehouse lease.

**Store-scoped expenses** are charged to that store in full.

## Currency

Each store reports in its own currency. A roll-up across stores assumes they
share one. Before supporting mixed-currency organizations, add:

```sql
create table fx_rates (
  date          date    not null,
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate          numeric(18, 8) not null,
  primary key (date, base_currency, quote_currency)
);
```

and convert to `organizations.base_currency` when writing `daily_financials`, so
the roll-up is fixed at the rate that applied on the day rather than moving with
today's rate.

## Ingestion, once providers are connected

```
provider API ──▶ raw sync ──▶ orders / refunds / marketing_spend_daily
                                        │
                                        ▼
                            rebuild daily_financials (per store, per day)
                                        │
                                        ▼
                                    dashboard
```

Each connector writes only its own tables. `daily_financials` is rebuilt for any
date touched by a sync — an upsert on `(store_id, date)`, so re-running a sync
is idempotent.

Late-arriving data is normal: refunds land days after the order, ad platforms
restate spend for up to 72 hours. The rebuild always recomputes a trailing
window rather than only the current day.

## How the mock layer maps on

`src/lib/data/generate.ts` produces the same shapes this schema defines —
`Order`, `OrderItem`, `Refund`, `MarketingSpendDaily`, `Expense` — and rolls them
into `DailyFinancials` using the same allocation rules described above.
`src/lib/data/index.ts` is the only module the UI imports from, so replacing the
generator with Supabase queries is a change inside that one directory.
