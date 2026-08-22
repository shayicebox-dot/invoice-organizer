# Shopify integration

Reads the ICEBOX store through the **Admin GraphQL API**. Server-side only.

## Files

| File            | Responsibility                                                        |
| --------------- | --------------------------------------------------------------------- |
| `config.ts`     | Resolves and validates credentials; pins the API version               |
| `client.ts`     | GraphQL transport: auth header, timeout, retries, throttle reporting   |
| `queries.ts`    | GraphQL documents, validated against the live Admin schema             |
| `connection.ts` | Connectivity + scope check used by the test endpoint                   |
| `orders.ts`     | Fetches orders and maps them into ICEBOX types                         |
| `json.ts`       | Narrowing helpers for untrusted JSON                                   |
| `errors.ts`     | Typed failures and the guidance shown for each                         |

## Rules specific to this integration

- **Credentials come only from the environment.** `SHOPIFY_STORE_DOMAIN` and
  `SHOPIFY_ADMIN_ACCESS_TOKEN` are read in `src/lib/config/env.ts` and nowhere
  else. Nothing here is importable from a client component: every module starts
  with `import 'server-only'`.
- **The store domain is validated before use.** The token is sent to whatever
  host the domain resolves to, so only `<store>.myshopify.com` is accepted.
- **Money is never a float.** Shopify returns decimal strings; they are parsed
  to integer minor units by `moneyFromDecimalString`. An unmodelled currency
  raises an error rather than being coerced.
- **`shopMoney`, not `presentmentMoney`.** Figures are reported in the store's
  currency so amounts across orders are comparable.
- **Test orders are excluded by default.** They are not real money.
- **This layer computes nothing.** It maps payloads and stops. Revenue
  definitions, refund attribution and discount treatment belong in `src/core`.

## Not wired up yet

`src/data/dashboard-source.ts` still returns empties, so the dashboard shows
"Not connected" regardless of whether credentials are set. Connecting it is a
separate, deliberate step — the point at which the definition of each figure
gets decided.

## Known constraints

- **60-day order history.** Without the `read_all_orders` scope, Shopify's
  `orders` connection only returns the last 60 days.
- **Line items are paginated too.** Orders with more than 100 line items report
  `hasMoreLineItems: true`; the remainder needs a follow-up query.
- **Lifetime order count is a snapshot.** `Customer.numberOfOrders` is the count
  at query time, so a point-in-time new/returning split for a historical period
  needs stored order history, not this field alone.
- **Cost-based rate limiting.** Every response reports the remaining query
  budget; `client.ts` retries throttled requests with backoff.
