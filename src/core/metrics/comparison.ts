import { moneyRatio, subtractMoney, type Money } from '@/core/money';

/**
 * Change against the previous period.
 *
 * Pure comparison of two already-computed figures — the same calculation engine
 * run over two ranges, never a second definition of a metric.
 *
 * `betterWhen` matters as much as the number: a rising CPA and a rising revenue
 * are both "up", and only one of them is good news. Colour follows the
 * judgement, not the arrow.
 */

export type Direction = 'up' | 'down' | 'flat';
export type Judgement = 'good' | 'bad' | 'neutral';

export type Delta = {
  readonly direction: Direction;
  /** Change as a fraction of the previous value, e.g. 0.12 for +12%. */
  readonly changeFraction: number | null;
  readonly judgement: Judgement;
};

/** Whether an increase in this metric is good news, bad news, or neither. */
export type BetterWhen = 'higher' | 'lower';

function judge(direction: Direction, betterWhen: BetterWhen): Judgement {
  if (direction === 'flat') return 'neutral';
  const isUp = direction === 'up';
  return (isUp && betterWhen === 'higher') || (!isUp && betterWhen === 'lower') ? 'good' : 'bad';
}

function toDelta(
  changeFraction: number | null,
  rose: boolean,
  fell: boolean,
  betterWhen: BetterWhen,
): Delta {
  const direction: Direction = rose ? 'up' : fell ? 'down' : 'flat';
  return { direction, changeFraction, judgement: judge(direction, betterWhen) };
}

/**
 * Compare two amounts.
 *
 * A change from zero has a direction but no percentage: every increase from
 * nothing is infinite, and printing "+∞%" or a made-up figure would be worse
 * than saying nothing. The direction still shows.
 */
export function compareAmounts(
  current: Money | null,
  previous: Money | null,
  betterWhen: BetterWhen,
): Delta | null {
  if (current === null || previous === null) return null;

  const difference = subtractMoney(current, previous);
  const changeFraction = previous.minorUnits === 0 ? null : moneyRatio(difference, previous);

  return toDelta(
    changeFraction,
    difference.minorUnits > 0,
    difference.minorUnits < 0,
    betterWhen,
  );
}

/** Compare two plain numbers — an order count, a ratio, a margin. */
export function compareNumbers(
  current: number | null,
  previous: number | null,
  betterWhen: BetterWhen,
): Delta | null {
  if (current === null || previous === null) return null;

  const difference = current - previous;
  const changeFraction = previous === 0 ? null : difference / Math.abs(previous);

  return toDelta(changeFraction, difference > 0, difference < 0, betterWhen);
}
