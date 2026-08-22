# Shopify integration

Reads the ICEBOX store through the **Admin GraphQL API**. Server-side only.

## Authentication

This is a Dev Dashboard app, so there is no permanent `shpat_` token. It uses
the **client credentials grant**: the app POSTs its client ID and secret to
`https://<store>.myshopify.com/admin/oauth/access_token` and receives an access
token valid for 24 hours.

`token.ts` owns that exchange. It caches the token in server memory, refreshes
it five minutes before expiry, and collapses concurrent refreshes into a single
request. If Shopify rejects a token that has not yet expired — revoked
credentials, a reinstalled app — the client drops it and retries once with a
fresh one.

The cache is per server instance, so on Vercel each warm instance holds its own
token and a cold start fetches a new one. That is correct, just not maximally
frugal; a shared cache is a job for the database, once there is one.

Scopes are chosen on the app's version in the Dev Dashboard and approved on the
store — not requested at token time. The token response reports back what was
granted, which is what the connection test displays.

## Files

| File            | Responsibility                                                        |
| --------------- | --------------------------------------------------------------------- |
| `config.ts`     | Resolves and validates credentials; pins the API version               |
| `token.ts`      | Client credentials exchange, token cache and refresh                   |
| `client.ts`     | GraphQL transport: auth header, timeout, retries, throttle reporting   |
| `queries.ts`    | GraphQL documents, validated against the live Admin schema             |
| `connection.ts` | Connectivity + scope check used by the test endpoint                   |
| `orders.ts`     | Fetches orders and maps them into ICEBOX types                         |
| `json.ts`       | Narrowing helpers for untrusted JSON                                   |
| `errors.ts`     | Typed failures and the guidance shown for each                         |

## Rules specific to this integration

- **Credentials come only from the environment.** `SHOPIFY_STORE_DOMAIN`,
  `SHOPIFY_CLIENT_ID` and `SHOPIFY_CLIENT_SECRET` are read in
  `src/lib/config/env.ts` and nowhere else. Nothing here is importable from a
  client component: every module starts with `import 'server-only'`.
- **The store domain is validated before use.** The client secret is posted to
  whatever host the domain resolves to, so only `<store>.myshopify.com` is
  accepted.
- **Neither the secret nor a token is ever returned or logged.** The connection
  test reports the token's expiry, never its value.
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
- **Same-organization requirement.** The client credentials grant only works
  when the app and the store belong to the same Shopify organization. Otherwise
  Shopify returns `shop_not_permitted`, which the token layer reports as such.
