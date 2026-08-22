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

Planned sub-modules (none implemented yet): `money/`, `vat/`, `revenue/`,
`cogs/`, `profit/`, `tax/`, `cash-flow/`.
