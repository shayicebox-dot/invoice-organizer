# `src/core` — business logic

Pure TypeScript. The financial brain of ICEBOX OS.

**Rules**

- No React, no JSX, no Next.js imports, no `process.env`, no Supabase.
- No I/O. Functions take explicit inputs and return explicit outputs, so every
  result is reproducible from its arguments alone.
- Every rate, threshold and assumption (VAT rate, tax rate, fee percentages)
  arrives as an argument or is read from configuration — never inlined in a
  formula and never read from a UI component.
- Money is handled in integer minor units (agorot) with an explicit currency.
  Never use floating-point arithmetic for money.
- Every calculated figure must carry enough information to explain itself:
  inputs used, rates applied, and the source records it came from.

**What is here**

- `money.ts` — `Money` as integer minor units + currency; add/subtract/divide,
  ratios, basis-point rates. No floats, no implicit conversion.
- `period.ts` — reporting ranges over `YYYY-MM-DD`, computed in UTC from a
  "today" the caller supplies, so the maths stays pure.
- `metrics/` — dashboard figures. `types.ts` defines `PeriodInputs` (where
  `null` means "no source yet") and `Metric` (value plus formula plus the inputs
  it consumed); `dashboard.ts` computes revenue, AOV, ROAS, CPA, gross profit,
  net profit and net margin.

Planned later: `vat/`, `tax/`, `inventory/`, `cash-flow/`.
