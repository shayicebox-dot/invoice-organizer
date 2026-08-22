# Meta Ads integration

Reads the ICEBOX ad account through the **Meta Marketing API** (Graph API).
Server-side only.

## Authentication

A long-lived **System User access token** from Meta Business Manager
(Business settings → Users → System users), carrying the `ads_read` permission
and assigned to the ad account.

There is no OAuth dance and no token refresh here on purpose: a system user
token belongs to the business rather than to a person, so it does not expire
when someone leaves or changes their password. That makes it a credential worth
protecting — it can read the whole ad account's spend and performance.

The token is sent in an `Authorization: Bearer` header, never as an
`access_token` query parameter. Query strings end up in server logs, proxy logs
and error reports; headers do not.

## Files

| File            | Responsibility                                                   |
| --------------- | ---------------------------------------------------------------- |
| `config.ts`     | Resolves and validates credentials; pins the Graph API version    |
| `client.ts`     | HTTP transport: auth header, timeout, Graph error mapping         |
| `connection.ts` | Connectivity + account identity check shown in Settings           |
| `insights.ts`   | Maps the Insights endpoint into ICEBOX types                      |
| `errors.ts`     | Typed failures and the guidance shown for each                    |

## Rules specific to this integration

- **Credentials come only from the environment.** `META_AD_ACCOUNT_ID` and
  `META_ACCESS_TOKEN` are read in `src/lib/config/env.ts` and nowhere else.
  Every module here starts with `import 'server-only'`.
- **The token never leaves the server.** It is not returned by any action, not
  logged, and not included in an error message.
- **Money is never a float.** Meta returns decimal strings; they are parsed to
  integer minor units by `moneyFromDecimalString`. An ad account currency this
  system does not model raises an error rather than being coerced.
- **Currency is requested with the metrics.** Meta returns bare amounts, so
  `account_currency` is part of the field list — otherwise an amount would
  arrive with no currency attached and have to be assumed.
- **Rates become fractions.** Meta reports CTR as a percentage (`"1.23"` meaning
  1.23%); `insights.ts` divides by 100 so the rest of the system speaks one
  language.
- **This layer computes nothing.** ROAS, CPA and blended marketing spend combine
  Meta figures with Shopify figures; that is a financial decision, and it
  belongs in `src/core`.

## Checking the connection

**Settings → Meta Ads → Test connection** — a server action, so no token is
needed in the browser. It reads the account's name, id, currency, timezone and
status. It fetches no spend and returns no credential.

Rate limited to 5 tests a minute per server instance, as a courtesy to the API
budget.

## Not wired up yet

Nothing here feeds a screen. `insights.ts` exists and is tested, but Marketing
Spend, CPA and ROAS on the dashboard still report "Not connected", and the
Marketing page is still a placeholder. Connecting them is a separate,
deliberate step — taken once the connection itself is verified against the live
account.

## Known constraints

- **Attribution is Meta's, not ours.** Purchases and purchase value come from
  Meta's own attribution window and will not match Shopify's order count. They
  are reported as Meta's figures, side by side with Shopify's — never merged.
  `omni_purchase` is preferred as the deduplicated cross-channel purchase, with
  the pixel-specific action types as fallbacks.
- **Timezones differ.** Meta interprets `time_range` in the ad account's own
  timezone, which need not be the business timezone Shopify figures are bucketed
  by. That difference is real and belongs in a caveat on screen, not in a silent
  adjustment.
- **Currency must match to combine.** If the ad account does not report in the
  business's reporting currency, spend and revenue cannot be added or divided
  until a conversion rate with a date is modelled. The connection card says so.
- **Insights omit the currency when there is no spend.** `fetchAccountCurrency()`
  resolves it from the account in that case.
- **The API version is pinned.** Meta deprecates versions on a schedule; the
  pinned version lives in `config.ts` and is overridable with
  `META_API_VERSION`.
