# `src/data` — database access

The only layer allowed to talk to Supabase/PostgreSQL for application data.

**Rules**

- Repository functions in, typed domain objects out. No raw Supabase query
  builders leak past this boundary.
- Server-side only. Files here are marked `import 'server-only'`.
- No financial calculation happens here — read and write records, then hand
  them to `src/core`. Aggregation pushed into SQL for performance must still be
  reproducible by the equivalent `src/core` function.
- Reads run as the signed-in user through `@/lib/supabase/server` (RLS
  enforced). The service-role client is only for trusted sync jobs.
- Never mutate imported source records in place. Corrections are new rows, so
  history stays auditable.

The financial schema has not been designed yet — this directory is
intentionally empty.
