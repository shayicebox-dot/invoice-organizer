'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { CalendarDays, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import {
  PERIOD_PRESETS,
  WEEK_STARTS_ON,
  addMonths,
  isIsoDate,
  isWithinRange,
  monthGrid,
  resolvePreset,
  startOfMonth,
  type DateRange,
  type PeriodPreset,
} from '@/core/period';
import {
  formatFullDate,
  formatMonthLabel,
  formatRangeLabel,
  formatDateRange,
  weekdayInitials,
} from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

type DateRangePickerProps = {
  /** The range currently being reported, already resolved on the server. */
  readonly range: DateRange;
  /** The preset it matches, or `null` when it is a custom range. */
  readonly preset: PeriodPreset | null;
  /**
   * Today in the business timezone, computed on the server.
   *
   * Deliberately not `new Date()` in the browser: a laptop in another timezone
   * would otherwise offer a different "today" than the one every figure on the
   * page is bucketed by.
   */
  readonly today: string;
  /** The page these dates apply to. */
  readonly basePath: Route;
};

/**
 * Reporting period picker: quick presets and a manual date range.
 *
 * Presets are not a separate mode. Choosing one fills in the very same start
 * and end dates a person could pick by hand, and Apply writes those dates to
 * the URL as `?from=&to=`. Every screen reads that one pair, so the dashboard,
 * Sales, Products and Marketing are always reporting the identical period —
 * and refreshing or sharing the link reproduces exactly the same figures.
 */
export function DateRangePicker({ range, preset, today, basePath }: DateRangePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ start: range.start, end: range.end });
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(range.start));
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  // Reopening always starts from what is actually on screen, never from a
  // half-finished selection abandoned last time.
  function openPicker(): void {
    setDraft({ start: range.start, end: range.end });
    setViewMonth(startOfMonth(range.start));
    setOpen(true);
  }

  function closePicker(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target) === false) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const draftRange = draftToRange(draft);

  function apply(): void {
    if (draftRange === null) return;
    setOpen(false);
    router.push(`${basePath}?from=${draftRange.start}&to=${draftRange.end}` as Route);
  }

  /**
   * Range selection: the first click sets a new start and clears the end, the
   * second completes the range. Clicking before the pending start restarts
   * rather than producing a backwards range.
   */
  function pickDay(date: string): void {
    if (date > today) return;

    setDraft((current) => {
      if (current.end === null || current.start === null) {
        return current.start !== null && date >= current.start
          ? { start: current.start, end: date }
          : { start: date, end: null };
      }
      return { start: date, end: null };
    });
  }

  function choosePreset(id: PeriodPreset): void {
    const resolved = resolvePreset(id, today);
    setDraft({ start: resolved.start, end: resolved.end });
    setViewMonth(startOfMonth(resolved.end));
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        className="inline-flex w-full items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:w-auto"
      >
        <CalendarDays className="size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <span className="flex-1 text-left">
          <span className="sr-only">Reporting period: </span>
          {formatRangeLabel(range)}
        </span>
        {preset === null ? (
          <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-foreground-subtle">
            Custom
          </span>
        ) : null}
        <ChevronDown
          className={cn('size-3.5 shrink-0 text-foreground-subtle transition-transform', open && 'rotate-180')}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-label="Choose a reporting period"
          className={cn(
            'z-50 rounded-xl border border-border-subtle bg-surface shadow-lg',
            // Full width beneath the trigger on phones; an anchored popover from
            // sm up, right-aligned so it never runs off the edge of the page.
            'fixed inset-x-3 top-20 max-h-[80vh] overflow-y-auto',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-none sm:w-auto sm:overflow-visible',
          )}
        >
          <div className="flex flex-col sm:flex-row">
            <ul className="flex shrink-0 flex-col gap-0.5 border-b border-border-subtle p-2 sm:w-52 sm:border-b-0 sm:border-r">
              {PERIOD_PRESETS.map((option) => {
                const resolved = resolvePreset(option.id, today);
                const isActive =
                  draft.start === resolved.start && draft.end === resolved.end;

                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => choosePreset(option.id)}
                      aria-pressed={isActive}
                      className={cn(
                        'flex w-full flex-col rounded-md px-2.5 py-1.5 text-left transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        isActive
                          ? 'bg-accent-muted text-accent'
                          : 'text-foreground-muted hover:bg-surface-muted hover:text-foreground',
                      )}
                    >
                      <span className="text-xs font-medium">{option.label}</span>
                      {/* The dates each shortcut resolves to, so "Last 7 days"
                          is never ambiguous about whether today is included. */}
                      <span className="numeric text-[10px] text-foreground-subtle">
                        {formatDateRange(resolved)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <DateField
                  label="Start date"
                  value={draft.start ?? ''}
                  max={draft.end ?? today}
                  onChange={(value) =>
                    setDraft((current) => ({ start: value, end: current.end }))
                  }
                  onCommit={(value) => setViewMonth(startOfMonth(value))}
                />
                <DateField
                  label="End date"
                  value={draft.end ?? ''}
                  max={today}
                  {...(draft.start === null ? {} : { min: draft.start })}
                  onChange={(value) =>
                    setDraft((current) => ({ start: current.start, end: value }))
                  }
                  onCommit={(value) => setViewMonth(startOfMonth(addMonths(value, -1)))}
                />
              </div>

              <div className="mt-3 flex items-start gap-4">
                <MonthCalendar
                  month={viewMonth}
                  draft={draft}
                  today={today}
                  onPick={pickDay}
                  onPrev={() => setViewMonth(addMonths(viewMonth, -1))}
                  showPrev
                />
                {/* The second month is where a cross-month range gets selected
                    without paging back and forth. It is hidden on phones, where
                    there is no room for it. */}
                <div className="hidden md:block">
                  <MonthCalendar
                    month={addMonths(viewMonth, 1)}
                    draft={draft}
                    today={today}
                    onPick={pickDay}
                    onNext={() => setViewMonth(addMonths(viewMonth, 1))}
                    showNext
                  />
                </div>
                <div className="md:hidden">
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    aria-label="Next month"
                    className="rounded-md p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Sticky so Apply and Cancel stay reachable on a phone, where the
                  panel scrolls and the footer would otherwise sit below the
                  fold behind the calendar. */}
              <div className="sticky bottom-0 mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-surface pt-3 pb-1 sm:static sm:pb-0">
                <p className="numeric text-xs text-foreground-muted" aria-live="polite">
                  {draftRange === null
                    ? 'Choose an end date'
                    : formatRangeLabel(draftRange)}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closePicker}
                    className="rounded-md border border-border-subtle px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={apply}
                    disabled={draftRange === null}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A half-finished selection: `end` is null between the two clicks. */
type Draft = { readonly start: string | null; readonly end: string | null };

function draftToRange(draft: Draft): DateRange | null {
  const { start, end } = draft;
  if (start === null || end === null) return null;
  if (!isIsoDate(start) || !isIsoDate(end)) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

type DateFieldProps = {
  readonly label: string;
  readonly value: string;
  readonly min?: string;
  readonly max?: string;
  readonly onChange: (value: string) => void;
  /** Called with a complete date, to move the calendar into view. */
  readonly onCommit: (value: string) => void;
};

/**
 * A typed date, alongside the calendar rather than instead of it.
 *
 * `type="date"` brings the platform's own picker — which on a phone is a far
 * better control than anything drawn here — and lets a date be typed outright
 * instead of paged to, which matters for a range months back.
 */
function DateField({ label, value, min, max, onChange, onCommit }: DateFieldProps) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
        {label}
      </span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          if (isIsoDate(next)) onCommit(next);
        }}
        className="numeric rounded-md border border-border-subtle bg-surface px-2 py-1.5 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
    </label>
  );
}

type MonthCalendarProps = {
  readonly month: string;
  readonly draft: Draft;
  readonly today: string;
  readonly onPick: (date: string) => void;
  readonly onPrev?: () => void;
  readonly onNext?: () => void;
  readonly showPrev?: boolean;
  readonly showNext?: boolean;
};

function MonthCalendar({
  month,
  draft,
  today,
  onPick,
  onPrev,
  onNext,
  showPrev = false,
  showNext = false,
}: MonthCalendarProps) {
  const weeks = useMemo(() => monthGrid(month), [month]);
  const headings = useMemo(() => weekdayInitials(WEEK_STARTS_ON), []);
  const selection = draftToRange(draft);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-2">
        {showPrev ? (
          <button
            type="button"
            onClick={onPrev}
            aria-label="Previous month"
            className="rounded-md p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-6" aria-hidden="true" />
        )}

        <p className="text-xs font-medium text-foreground">{formatMonthLabel(month)}</p>

        {showNext ? (
          <button
            type="button"
            onClick={onNext}
            aria-label="Next month"
            className="rounded-md p-1 text-foreground-subtle hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <span className="size-6" aria-hidden="true" />
        )}
      </div>

      <table className="border-collapse">
        <thead>
          <tr>
            {headings.map((heading) => (
              <th
                key={heading}
                scope="col"
                className="pb-1 text-[10px] font-medium text-foreground-subtle"
              >
                <span aria-hidden="true">{heading.slice(0, 2)}</span>
                <span className="sr-only">{heading}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={String(week[0] ?? week.find((day) => day !== null))}>
              {week.map((day, index) => {
                if (day === null) {
                  return <td key={index} className="size-8" aria-hidden="true" />;
                }

                const isFuture = day > today;
                const isStart = day === selection?.start;
                const isEnd = day === selection?.end;
                const inRange = selection !== null && isWithinRange(day, selection);
                const isPendingStart = selection === null && day === draft.start;

                return (
                  <td key={day} className="p-0">
                    <button
                      type="button"
                      onClick={() => onPick(day)}
                      disabled={isFuture}
                      aria-label={formatFullDate(day)}
                      aria-pressed={inRange || isPendingStart}
                      className={cn(
                        'numeric size-8 text-xs transition-colors',
                        'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                        isFuture && 'cursor-not-allowed text-foreground-subtle/40',
                        !isFuture && !inRange && !isPendingStart && 'text-foreground-muted hover:bg-surface-muted',
                        inRange && !isStart && !isEnd && 'bg-accent-muted text-accent',
                        (isStart || isEnd || isPendingStart) && 'bg-accent font-medium text-accent-foreground',
                        isStart && !isEnd && 'rounded-l-md',
                        isEnd && !isStart && 'rounded-r-md',
                        ((isStart && isEnd) || isPendingStart) && 'rounded-md',
                      )}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="sr-only">
        {selection === null
          ? 'No complete range selected yet.'
          : `Selected ${formatFullDate(selection.start)} to ${formatFullDate(selection.end)}.`}
      </p>
    </div>
  );
}
