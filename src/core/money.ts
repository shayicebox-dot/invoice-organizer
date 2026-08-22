/**
 * Money primitives.
 *
 * Money is an integer count of minor units (agorot for ILS) plus a currency.
 * There is no floating-point arithmetic anywhere in this file, and no implicit
 * currency conversion: adding two different currencies is a bug, not a feature.
 */

export type CurrencyCode = 'ILS' | 'USD' | 'EUR';

export type Money = {
  /** Integer minor units. 1 ILS = 100 agorot. */
  readonly minorUnits: number;
  readonly currency: CurrencyCode;
};

export function money(minorUnits: number, currency: CurrencyCode): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new Error(`Money must be an integer number of minor units, received ${minorUnits}.`);
  }
  return { minorUnits, currency };
}

export function zeroMoney(currency: CurrencyCode): Money {
  return { minorUnits: 0, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Cannot combine ${a.currency} with ${b.currency}. Convert explicitly first.`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits + b.minorUnits, a.currency);
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.minorUnits - b.minorUnits, a.currency);
}

export function sumMoney(currency: CurrencyCode, amounts: readonly Money[]): Money {
  return amounts.reduce<Money>((total, amount) => addMoney(total, amount), zeroMoney(currency));
}

export function negateMoney(amount: Money): Money {
  return money(-amount.minorUnits, amount.currency);
}

export function isZeroMoney(amount: Money): boolean {
  return amount.minorUnits === 0;
}

/**
 * Divide an amount across a whole number of units.
 * Rounds half away from zero, at this single point, and returns `null` when the
 * divisor is zero rather than producing Infinity.
 */
export function divideMoney(amount: Money, divisor: number): Money | null {
  if (divisor === 0) return null;
  const quotient = amount.minorUnits / divisor;
  const rounded = quotient < 0 ? -Math.round(-quotient) : Math.round(quotient);
  return money(rounded, amount.currency);
}

/**
 * Ratio between two amounts of the same currency (e.g. ROAS, margin).
 * Returns `null` when the denominator is zero — a ratio against nothing is not
 * zero, it is undefined, and must be rendered as such.
 */
export function moneyRatio(numerator: Money, denominator: Money): number | null {
  assertSameCurrency(numerator, denominator);
  if (denominator.minorUnits === 0) return null;
  return numerator.minorUnits / denominator.minorUnits;
}

/** Apply a rate expressed in basis points (1 bp = 0.01%). Integer-safe. */
export function applyBasisPoints(amount: Money, basisPoints: number): Money {
  const product = (amount.minorUnits * basisPoints) / 10_000;
  const rounded = product < 0 ? -Math.round(-product) : Math.round(product);
  return money(rounded, amount.currency);
}
