/**
 * Spreading recurring costs across days.
 *
 * A monthly bill is not a cost that lands on the first of the month — for a
 * daily P&L it has to be spread across the days it covers, or every month
 * would open with a loss and drift into profit.
 *
 * The split uses `allocate()` from the money module, so the daily shares of a
 * whole period add back to exactly the billed amount: no cent is invented and
 * none is lost. Over a partial range you get exactly the days that fall inside
 * it, which is what "prorated" has to mean.
 */

import { type Money, ZERO, allocate, sum } from "../money";
import { daysInMonth, parseISODate } from "../date-range";
import type { ISODate } from "../types";
import type { EffectiveWindow, RecurringCost } from "./types";

const DAYS_IN_WEEK = 7;

/** Whether a date falls inside a record's effective window. */
export function isEffectiveOn(window: EffectiveWindow, date: ISODate): boolean {
  if (date < window.effectiveFrom) return false;
  if (window.effectiveTo !== null && date >= window.effectiveTo) return false;
  return true;
}

/**
 * Pick the record in force on a date. When windows overlap — which a merchant
 * can create by mistake — the one that started most recently wins, since that
 * is the correction they meant to make.
 */
export function effectiveRecord<T extends EffectiveWindow>(
  records: readonly T[],
  date: ISODate,
): T | null {
  let best: T | null = null;
  for (const record of records) {
    if (!isEffectiveOn(record, date)) continue;
    if (!best || record.effectiveFrom > best.effectiveFrom) best = record;
  }
  return best;
}

/** Every record in force on a date, newest window first. */
export function effectiveRecords<T extends EffectiveWindow>(
  records: readonly T[],
  date: ISODate,
): T[] {
  return records
    .filter((record) => isEffectiveOn(record, date))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1));
}

function daysInYear(date: ISODate): number {
  const year = parseISODate(date).getUTCFullYear();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return isLeap ? 366 : 365;
}

function dayOfYear(date: ISODate): number {
  const parsed = parseISODate(date);
  const start = Date.UTC(parsed.getUTCFullYear(), 0, 1);
  return Math.floor((parsed.getTime() - start) / 86_400_000);
}

/**
 * The share of a recurring cost that belongs to one day.
 *
 * Returns zero outside the cost's start/end window, so a subscription that
 * ended in June contributes nothing to July.
 */
export function dailyShare(cost: RecurringCost, date: ISODate): Money {
  if (date < cost.startDate) return ZERO;
  if (cost.endDate !== null && date > cost.endDate) return ZERO;

  switch (cost.recurrence) {
    case "one_time":
      // Lands wholly on its date. Spreading it would misstate both days.
      return date === cost.startDate ? cost.amount : ZERO;

    case "weekly": {
      // Indexed by weekday, so any seven consecutive days sum to the amount.
      const weekday = parseISODate(date).getUTCDay();
      return allocate(cost.amount, DAYS_IN_WEEK)[weekday];
    }

    case "monthly": {
      const length = daysInMonth(date);
      const dayIndex = parseISODate(date).getUTCDate() - 1;
      return allocate(cost.amount, length)[dayIndex];
    }

    case "yearly": {
      const length = daysInYear(date);
      return allocate(cost.amount, length)[dayOfYear(date)];
    }

    default:
      return ZERO;
  }
}

/** Total share of one recurring cost across an inclusive range of dates. */
export function shareOverDates(cost: RecurringCost, dates: readonly ISODate[]): Money {
  return sum(dates.map((date) => dailyShare(cost, date)));
}

/** Combined daily share of a set of recurring costs. */
export function dailyShareOfAll(costs: readonly RecurringCost[], date: ISODate): Money {
  return sum(costs.map((cost) => dailyShare(cost, date)));
}
