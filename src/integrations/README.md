# `src/integrations` — external systems

Adapters for everything outside ICEBOX OS. Nothing is implemented yet.

Planned: `shopify/`, `meta-ads/`, `google-ads/`, Israeli invoicing/accounting
providers, and payment processors.

**Rules**

- Each integration owns: its client, its auth, its raw response types, and a
  mapper from the provider's shape into our own types.
- Fetch and store raw payloads first, map second. The raw record is the audit
  trail — it is what a figure is ultimately traced back to.
- Server-side only. Credentials come from `@/lib/config/env`, never from
  `NEXT_PUBLIC_*`.
- No business rules here. Currency conversion, VAT treatment and cost
  allocation belong in `src/core`.
- Imports must be idempotent and re-runnable, keyed by the provider's own IDs.
