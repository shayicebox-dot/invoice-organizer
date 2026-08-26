# `src/integrations/morning` — Morning (Green Invoice)

Israeli invoicing and accounting. **Connection test only.** Nothing here feeds a
figure on any screen: revenue comes from Shopify and ad spend from Meta, and
connecting Morning changes neither.

## What it does today

Proves that ICEBOX OS can authenticate. `testMorningConnection()` mints a token
from the API key pair and makes one read-only call to `GET /users/me`, the
smallest request that shows the credentials are accepted. It reads no documents,
no revenue and no client records, and it writes nothing.

## Files

| File            | Responsibility                                              |
| --------------- | ----------------------------------------------------------- |
| `config.ts`     | Resolves and validates credentials; picks a fixed API host  |
| `token.ts`      | Exchanges the key pair for a JWT, caches it, refreshes it   |
| `client.ts`     | Authenticated **GET only**, typed errors, one 401 retry     |
| `connection.ts` | The connection test and its result type                     |
| `errors.ts`     | `MorningError`, failure reasons, UI-safe guidance           |

## Rules this code follows

- Every file imports `server-only`. The API key id, its secret and the minted
  JWT never reach the browser; the Settings card receives a narrow view model
  (`MorningConnectionView`) with no field able to carry one.
- The token travels in `Authorization: Bearer`, never in a query string, because
  URLs reach server logs, proxies and error reports.
- No error, message or guidance string ever contains a credential, a request URL
  or a raw response body.
- Both API hosts are fixed constants. `MORNING_ENVIRONMENT` selects between
  `production` and `sandbox`; no configured value can choose an arbitrary host.
- Read-only: the client exposes no method other than GET, so no code path here
  can create, alter or cancel a document in the owner's accounting system.

## Things worth knowing

- **The host did not follow the rebrand.** "חשבונית ירוקה" became "Morning", but
  the API is still `api.greeninvoice.co.il`. There is no `api.morning.co.il`.
- **API access requires the Best plan.** Below it the dashboard shows no "API
  Keys" menu at all. A 403 is reported as a plan problem first, because that is
  what it usually is.
- **Rate limit** is roughly three requests a second; 429 is a soft error.
- **Token expiry unit is undocumented.** `expires` is parsed as epoch seconds or
  milliseconds, and anything unrecognised falls back to a five-minute lifetime
  rather than being trusted.
- Credentials are created in the Morning dashboard under
  אזור אישי → כלים למפתחים → מפתחות API.

## If revenue is imported later

It would be a second source of truth for the same sales Shopify already reports,
so it cannot simply be added to anything. Decide first what a Morning document
is evidence of that a Shopify order is not — VAT documents issued, allocation
numbers, cash actually received — and model that, rather than summing two
overlapping views of one sale.
