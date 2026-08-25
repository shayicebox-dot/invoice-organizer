/**
 * Reporting periods.
 *
 * Pure date arithmetic over `YYYY-MM-DD` strings, done in UTC so results never
 * depend on the server's local timezone. The caller decides what "today" is in
 * the business timezone (see `BUSINESS_CONFIG.timeZone`) and passes it in.
 */

export type PeriodPreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'mtd' | 'ytd';

export type DateRange = {
  /** Inclusive start, `YYYY-MM-DD`. */
  readonly start: string;
  /** Inclusive end, `YYYY-MM-DD`. */
  readonly end: string;
};

export type PeriodPresetOption = {
  readonly id: PeriodPreset;
  readonly label: string;
  /** Abbreviated label for narrow screens. */
  readonly shortLabel: string;
};

export const PERIOD_PRESETS: readonly PeriodPresetOption[] = [
  { id: 'today', label: 'Today', shortLabel: 'Today' },
  { id: 'yesterday', label: 'Yesterday', shortLabel: 'Yest' },
  { id: 'last7', label: 'Last 7 days', shortLabel: '7D' },
  { id: 'last30', label: 'Last 30 days', shortLabel: '30D' },
  { id: 'mtd', label: 'Month to date', shortLabel: 'MTD' },
  { id: 'ytd', label: 'Year to date', shortLabel: 'YTD' },
];

/** The preset used when a request names no period at all. */
export const DEFAULT_PERIOD_PRESET: PeriodPreset = 'last30';

/**
 * Longest range that may be requested, in days.
 *
 * A guard on hand-edited URLs, not a product limit: a decade-long range would
 * be refused by Meta anyway and would meanwhile hold a page open on a request
 * that cannot succeed. Two years comfortably exceeds any reporting period the
 * business uses.
 */
export const MAX_RANGE_DAYS = 731;

/** Earliest date accepted — anything before this is a typo, not a period. */
const EARLIEST_SUPPORTED_DATE = '2000-01-01';

/**
 * Which weekday a calendar week starts on. Sunday in Israel, so the calendar
 * matches how the business actually reads a week. `0` is Sunday.
 */
export const WEEK_STARTS_ON = 0;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toUtcMillis(isoDate: string): number {
  if (!isIsoDate(isoDate)) {
    throw new Error(`Expected a YYYY-MM-DD date, received "${isoDate}".`);
  }
  return Date.parse(`${isoDate}T00:00:00Z`);
}

function toIsoDate(utcMillis: number): string {
  return new Date(utcMillis).toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(toUtcMillis(isoDate) + days * MS_PER_DAY);
}

export function daysBetween(range: DateRange): number {
  return Math.round((toUtcMillis(range.end) - toUtcMillis(range.start)) / MS_PER_DAY) + 1;
}

/** Every date in the range, inclusive, ascending. */
export function eachDay(range: DateRange): readonly string[] {
  const count = daysBetween(range);
  return Array.from({ length: Math.max(count, 0) }, (_, index) => addDays(range.start, index));
}

/**
 * Resolve a preset against the given "today" (business timezone, `YYYY-MM-DD`).
 *
 * A preset is nothing more than a shortcut that produces a start and an end
 * date. There is no separate "preset mode" anywhere in the system: whatever a
 * preset resolves to is exactly what a person could have picked by hand, and it
 * travels through the rest of the application as an ordinary `DateRange`.
 *
 * `last7` and `last30` cover **complete days only and exclude today**, which is
 * how Meta Ads Manager defines them. A part-day at the end would otherwise drag
 * every rate down — a day that is three hours old contributes its spend but not
 * the sales that spend has yet to produce. `today` and `yesterday` name single
 * days, and the "to date" presets deliberately run up to and including today.
 */
export function resolvePreset(preset: PeriodPreset, today: string): DateRange {
  const yesterday = addDays(today, -1);

  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday':
      return { start: yesterday, end: yesterday };
    case 'last7':
      return { start: addDays(today, -7), end: yesterday };
    case 'last30':
      return { start: addDays(today, -30), end: yesterday };
    case 'mtd':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'ytd':
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
}

/**
 * The preset a range corresponds to, or `null` when it is a custom range.
 *
 * Derived by comparison rather than stored, so there is one source of truth. A
 * range typed by hand that happens to equal "last 7 days" is that preset, and
 * highlights as such — the two cannot drift apart because they are the same
 * thing.
 */
export function matchPreset(range: DateRange, today: string): PeriodPreset | null {
  const match = PERIOD_PRESETS.find((preset) => {
    const resolved = resolvePreset(preset.id, today);
    return resolved.start === range.start && resolved.end === range.end;
  });

  return match?.id ?? null;
}

/** Why a requested range could not be used as asked. */
export type PeriodAdjustment =
  | { readonly kind: 'none' }
  /** The end date was in the future and was pulled back to today. */
  | { readonly kind: 'end-clamped'; readonly requestedEnd: string }
  /** The dates were unusable, so the default period was substituted. */
  | { readonly kind: 'rejected'; readonly reason: string };

export type ResolvedPeriod = {
  readonly range: DateRange;
  /** The preset these dates match, or `null` for a custom range. */
  readonly preset: PeriodPreset | null;
  /** What had to be changed about the request, for the screen to disclose. */
  readonly adjustment: PeriodAdjustment;
};

export type PeriodRequest = {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  /** Legacy `?period=` parameter, still honoured so old links keep working. */
  readonly period?: string | undefined;
};

/**
 * The single entry point every screen uses to decide which dates it is showing.
 *
 * `from`/`to` are the canonical representation: presets resolve to them, custom
 * ranges are them, and the URL always carries them. Sharing or refreshing a
 * page therefore reproduces exactly the same figures, and every data source on
 * that page is handed the identical `DateRange`.
 *
 * A range that cannot be honoured is never silently replaced. The substitution
 * is reported in `adjustment` so the screen can say what happened rather than
 * showing a period the reader did not ask for.
 */
export function resolveRequestedPeriod(request: PeriodRequest, today: string): ResolvedPeriod {
  const fallback = (adjustment: PeriodAdjustment): ResolvedPeriod => ({
    range: resolvePreset(DEFAULT_PERIOD_PRESET, today),
    preset: DEFAULT_PERIOD_PRESET,
    adjustment,
  });

  const { from, to } = request;

  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined) {
      return fallback({ kind: 'rejected', reason: 'A date range needs both a start and an end date.' });
    }
    if (!isIsoDate(from) || !isIsoDate(to)) {
      return fallback({ kind: 'rejected', reason: 'Dates must be written as YYYY-MM-DD.' });
    }

    // A reversed pair has only one possible meaning: these two dates bound the
    // period. Normalising it is not a guess about intent.
    const [start, requestedEnd] = from <= to ? [from, to] : [to, from];

    if (start < EARLIEST_SUPPORTED_DATE) {
      return fallback({ kind: 'rejected', reason: `Dates before ${EARLIEST_SUPPORTED_DATE} are not supported.` });
    }
    if (start > today) {
      return fallback({ kind: 'rejected', reason: 'That period is entirely in the future, so there is nothing to report.' });
    }

    // The future holds no data. Pulling the end back to today reports the part
    // of the period that exists, and says so.
    const end = requestedEnd > today ? today : requestedEnd;
    const range: DateRange = { start, end };

    if (daysBetween(range) > MAX_RANGE_DAYS) {
      return fallback({ kind: 'rejected', reason: `A range cannot be longer than ${MAX_RANGE_DAYS} days.` });
    }

    return {
      range,
      preset: matchPreset(range, today),
      adjustment: end === requestedEnd ? { kind: 'none' } : { kind: 'end-clamped', requestedEnd },
    };
  }

  const preset = PERIOD_PRESETS.find((option) => option.id === request.period)?.id;

  if (request.period !== undefined && preset === undefined) {
    return fallback({ kind: 'none' });
  }

  const chosen = preset ?? DEFAULT_PERIOD_PRESET;
  return { range: resolvePreset(chosen, today), preset: chosen, adjustment: { kind: 'none' } };
}

/** First day of the month a date falls in. */
export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

/** Same day-of-month `months` later, clamped to the target month's length. */
export function addMonths(isoDate: string, months: number): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7)) - 1 + months;
  const day = Number(isoDate.slice(8, 10));

  const targetYear = year + Math.floor(month / 12);
  const targetMonth = ((month % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();

  return toIsoDate(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay)));
}

/**
 * One month laid out as calendar weeks.
 *
 * Leading and trailing cells are `null` rather than dates from the neighbouring
 * months, so a click can never land on a day the grid is not claiming to show.
 */
export function monthGrid(monthStart: string): readonly (readonly (string | null)[])[] {
  const first = startOfMonth(monthStart);
  const firstWeekday = new Date(`${first}T00:00:00Z`).getUTCDay();
  const lead = (firstWeekday - WEEK_STARTS_ON + 7) % 7;
  const dayCount = new Date(
    Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0),
  ).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => addDays(first, index)),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/** True when `date` falls inside the range, inclusive. */
export function isWithinRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/**
 * The calendar day an instant belongs to, in the given timezone.
 *
 * Which day an order counts towards is a business decision, not a UTC fact: an
 * order placed at 00:30 in Jerusalem belongs to that day locally but to the
 * previous day in UTC. `en-CA` formats as `YYYY-MM-DD`.
 */
export function instantToDateInTimeZone(instant: string, timeZone: string): string {
  const parsed = new Date(instant);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Expected an ISO timestamp, received "${instant}".`);
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

/**
 * A timezone's offset from UTC, in minutes, at a given instant.
 *
 * Derived by formatting the instant in that zone and reading the wall clock
 * back — which is what makes it correct across daylight saving changes, where a
 * fixed offset would be wrong for half the year.
 */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string): number => Number(parts.find((part) => part.type === type)?.value ?? '0');

  const wallClock = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  );

  return (wallClock - instant.getTime()) / 60_000;
}

/**
 * How many hours ahead of `behind` the zone `ahead` is, at a given instant.
 *
 * Used to state, rather than hide, the gap between two systems that each bucket
 * a day in their own timezone. A positive result means a calendar day starts
 * that many hours earlier in `ahead` than it does in `behind`.
 */
export function hoursAheadOf(ahead: string, behind: string, instant: Date): number {
  return (offsetMinutes(instant, ahead) - offsetMinutes(instant, behind)) / 60;
}

export type ClampedRange = {
  readonly range: DateRange;
  /** True when the requested range started before the available history. */
  readonly truncated: boolean;
  /** The requested start, kept so the UI can say what was asked for. */
  readonly requestedStart: string;
};

/**
 * Trim a range to the history a source actually provides.
 *
 * Returning the trimmed range plus a flag — rather than quietly shortening it —
 * lets the screen say which period is really being shown. A figure labelled
 * "year to date" that silently covers 60 days is a wrong number.
 */
export function clampRangeToAvailable(range: DateRange, earliest: string | null): ClampedRange {
  if (earliest === null || range.start >= earliest) {
    return { range, truncated: false, requestedStart: range.start };
  }

  return {
    range: { start: earliest, end: range.end },
    truncated: true,
    requestedStart: range.start,
  };
}
