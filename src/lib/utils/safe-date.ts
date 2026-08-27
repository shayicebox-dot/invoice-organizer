/**
 * Date handling for values that came from outside this system.
 *
 * Every other date in ICEBOX OS is a `YYYY-MM-DD` string this codebase
 * produced, so the formatters in `format.ts` are right to assume one. A date
 * read from a provider is different: it can be absent, empty, in a shape nobody
 * documented, or simply wrong. `new Date('')` is an Invalid Date, and handing
 * that to `Intl.DateTimeFormat` throws `RangeError: Invalid time value` — which
 * in a client component takes down the whole page, not just the value.
 *
 * So a provider's date is parsed defensively and reported as unavailable when
 * it cannot be read. Never substituted: showing today, or the document's date,
 * in place of a payment's own would be a plausible-looking wrong answer, and
 * the point of a diagnostic is to show what the provider actually said.
 *
 * Deliberately free of imports, so it can be unit-tested on its own.
 */

/** `YYYY-MM-DD` — a calendar date with no time, which is read as UTC midnight. */
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A `Date` when the value can be read as one, `null` otherwise.
 *
 * Accepts a plain calendar date and anything `Date` itself parses (an ISO
 * timestamp, with or without a zone). Everything else — a non-string, an empty
 * or blank string, a shape `Date` rejects, a date that overflows the range
 * `Date` can represent — is `null`.
 */
export function parseExternalDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = CALENDAR_DATE.test(trimmed)
    ? new Date(`${trimmed}T00:00:00Z`)
    : new Date(trimmed);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** True when the value can be formatted as a date without throwing. */
export function isReadableDate(value: unknown): boolean {
  return parseExternalDate(value) !== null;
}

/**
 * Format a provider's date, or `null` when it cannot be read.
 *
 * `null` rather than a placeholder: what to show instead is the caller's
 * decision, and this file must not decide that a missing date looks like a dash
 * in one place and an empty cell in another.
 *
 * A calendar date is formatted in UTC — it names a day, not a moment, and
 * rendering it in a local timezone would shift it. A value carrying a real time
 * is formatted in the given timezone so the day shown is the day it fell on
 * there.
 */
export function formatExternalDate(
  value: unknown,
  options: {
    readonly locale: string;
    readonly timeZone: string;
    readonly format?: Intl.DateTimeFormatOptions;
  },
): string | null {
  const parsed = parseExternalDate(value);
  if (parsed === null) return null;

  const isCalendarDate = typeof value === 'string' && CALENDAR_DATE.test(value.trim());

  try {
    return new Intl.DateTimeFormat(options.locale, {
      day: 'numeric',
      month: 'short',
      ...options.format,
      timeZone: isCalendarDate ? 'UTC' : options.timeZone,
    }).format(parsed);
  } catch {
    // A locale or timezone the runtime rejects must not take a page down
    // either. Unavailable is a worse answer than a formatted date, and a far
    // better one than a crash.
    return null;
  }
}
