# `src/integrations/morning` — Morning (Green Invoice)

Israeli invoicing and accounting. **Connection test only.** Nothing here feeds a
figure on any screen: revenue comes from Shopify and ad spend from Meta, and
connecting Morning changes neither.

## What it does today

Two read-only things, neither of which feeds a figure.

**Proves that ICEBOX OS can authenticate.** `testMorningConnection()` mints a token
from the API key pair and makes one read-only call to
`GET /documents/info?type=320`, which reports the document settings for one
document type. Nothing in the answer is read as a figure: it is used purely as
an authenticated GET that fails without a valid token. No document, no revenue
and no client record is read, and nothing is written.

`type=320` is Morning's code for חשבונית מס/קבלה. It selects which settings the
probe asks about and nothing else — it classifies no revenue and applies no VAT
treatment.

**Reads recorded payments, for inspection.** `fetchPaymentsInRange` searches
`POST /documents/payments/search` for the credit-card (3) and payment-app (10)
payment types over a date range, 25 rows a page — Morning's documented size —
following the page count it returns to the end.

The search returns **documents**, not payments: each entry in `items` is the
document containing the matching payment(s), with the payments in its nested
`payment` array. Every figure comes from a nested entry; the document supplies
only its id, number and type. Reading an item as though it were a payment is
how the first version reported one row of type 320 — a document type — for ₪0. It exists to
answer what ICEBOX's real collections look like in Morning before any of them
are allowed near a financial figure. Nothing downstream reads it: no dashboard
figure, no metric, no P&L line.

The parsing is deliberately shape-tolerant and asserts no meanings. `subType`,
`appType`, `cardType` and `dealType` are carried through as codes, unrecognised
scalar fields are carried through as observed extras, and a field holding a URL
is reported by name only. Which of them distinguishes Bit from a hosted card
link from a manually recorded payment is the open question — the panel shows the
evidence rather than guessing at the answer.

## Files

| File            | Responsibility                                              |
| --------------- | ----------------------------------------------------------- |
| `config.ts`     | Resolves and validates credentials; picks a fixed API host  |
| `token.ts`      | Exchanges the key pair for a JWT, caches it, refreshes it   |
| `client.ts`     | Authenticated GET, allow-listed search POST, typed errors   |
| `payments.ts`   | Paginated payment reads, sensitive fields dropped           |
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
- Read-only. The client exposes a GET, and a POST that refuses any path outside
  `SEARCH_PATHS` — Morning expresses a search as POST, and that is not a reason
  to put a general-purpose write into the codebase. No code path here can
  create, alter or cancel a document in the owner's accounting system; widening
  that list is the deliberate act of changing it.
- Payment reads drop anything that identifies a customer (name, email, phone,
  address, tax id, card or cheque number, bank details) or looks like a
  credential, before the data leaves this layer. Nested objects and arrays are
  not walked: flattening unknown structures is how customer data reaches a
  screen by accident.

## Things worth knowing

- **The host did not follow the rebrand.** "חשבונית ירוקה" became "Morning", but
  the API is still `api.greeninvoice.co.il`. There is no `api.morning.co.il`.
- **API access requires the Best plan.** Below it the dashboard shows no "API
  Keys" menu at all. A 403 is reported as a plan problem first, because that is
  what it usually is.
- **Rate limit** is roughly three requests a second; 429 is a soft error.
- **The search page size is validated, and 25 is the documented one.** Asking
  for more is refused with 400 `גודל תוצאות חיפוש לא תקין` ("invalid search
  result size"). How many rows a screen shows is a separate question from how
  many rows one request may ask for.
- **A payment's date can be absent, empty or malformed**, and real ones are.
  Formatting one without checking throws `RangeError: Invalid time value`,
  which in a client component unmounts the page. Provider dates go through
  `formatProviderDate`, and the diagnostic shows the raw value when it cannot
  be read.
- **`items` holds documents, not payments.** A document can carry several
  payments, and can carry payments of types the search did not ask for, because
  the filter matches the document. Both are counted and reported.
- **Search pages are numbered from 1**, and the answer states how many pages
  there are. Asking for page 0 is a validation error.
- **`GET /users/me` does not exist.** It appears in older write-ups of this API
  and answers 404. The connection test used it once and had to be corrected.
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
