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
 * Multiply an amount by a whole number.
 *
 * Used where a rate is quoted per a block of units rather than per one — CPM is
 * a cost per *thousand* impressions, so the spend is scaled by 1000 before it is
 * divided. Doing it in this order keeps the intermediate an exact integer;
 * dividing first would round to whole agorot per impression and destroy the
 * figure.
 */
export function scaleMoney(amount: Money, factor: number): Money {
  if (!Number.isInteger(factor)) {
    throw new Error(`Money can only be scaled by a whole number, received ${factor}.`);
  }

  const scaled = amount.minorUnits * factor;

  if (!Number.isSafeInteger(scaled)) {
    throw new Error(`Scaling ${amount.minorUnits} by ${factor} leaves the safe integer range.`);
  }

  return money(scaled, amount.currency);
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

/**
 * Strip VAT out of a VAT-inclusive amount.
 *
 * `ex = incl / (1 + rate)`, done as integer arithmetic: multiplying before
 * dividing keeps the intermediate exact, where dividing first would lose
 * agorot on every call.
 *
 * Rounding is half away from zero, applied here and only here. Callers should
 * total VAT-inclusive amounts first and strip VAT once from the total, rather
 * than stripping it per line and summing — the second rounds many times and
 * drifts from what an accountant would compute.
 */
export function excludeVat(amount: Money, rateBasisPoints: number): Money {
  if (rateBasisPoints < 0) {
    throw new Error(`A VAT rate cannot be negative, received ${rateBasisPoints}.`);
  }

  const denominator = 10_000 + rateBasisPoints;
  const product = amount.minorUnits * 10_000;

  if (!Number.isSafeInteger(product)) {
    throw new Error(`Removing VAT from ${amount.minorUnits} leaves the safe integer range.`);
  }

  const quotient = product / denominator;
  const rounded = quotient < 0 ? -Math.round(-quotient) : Math.round(quotient);

  return money(rounded, amount.currency);
}

/** The VAT contained in a VAT-inclusive amount: the part that is not revenue. */
export function vatPortion(amount: Money, rateBasisPoints: number): Money {
  return subtractMoney(amount, excludeVat(amount, rateBasisPoints));
}

/** Apply a rate expressed in basis points (1 bp = 0.01%). Integer-safe. */
export function applyBasisPoints(amount: Money, basisPoints: number): Money {
  const product = (amount.minorUnits * basisPoints) / 10_000;
  const rounded = product < 0 ? -Math.round(-product) : Math.round(product);
  return money(rounded, amount.currency);
}

/**
 * Parse a decimal money string (as returned by external APIs, e.g. Shopify's
 * `MoneyV2.amount` — `"123.45"`) into integer minor units.
 *
 * Deliberately string-based: `parseFloat('0.29') * 100` is `28.999...`, and
 * that class of error is exactly what this system must never introduce.
 *
 * Rounding rule: values carrying more precision than the currency's minor unit
 * are rounded half away from zero. All currencies in `CurrencyCode` use two
 * decimal places; adding a zero-decimal currency (e.g. JPY) means revisiting
 * `MINOR_UNIT_DIGITS` below.
 *
 * Throws on anything that is not a plain decimal number — a malformed amount
 * must fail loudly rather than silently become zero.
 */
const MINOR_UNIT_DIGITS = 2;
const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d+))?$/;

export function moneyFromDecimalString(value: string, currency: CurrencyCode): Money {
  const match = DECIMAL_PATTERN.exec(value.trim());

  if (match === null) {
    throw new Error(`Not a decimal money amount: "${value}".`);
  }

  const [, sign, whole = '0', fraction = ''] = match;
  const padded = fraction.padEnd(MINOR_UNIT_DIGITS, '0');
  const kept = padded.slice(0, MINOR_UNIT_DIGITS);
  const dropped = padded.slice(MINOR_UNIT_DIGITS);

  let minorUnits = Number(whole) * 10 ** MINOR_UNIT_DIGITS + Number(kept);

  // Round half away from zero on the first dropped digit.
  const firstDropped = dropped.charAt(0);
  if (firstDropped !== '' && Number(firstDropped) >= 5) {
    minorUnits += 1;
  }

  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(`Money amount out of safe integer range: "${value}".`);
  }

  return money(sign === '-' ? -minorUnits : minorUnits, currency);
}

const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = ['ILS', 'USD', 'EUR'];

/**
 * Narrow an arbitrary currency code from an external system.
 * Returns `null` for currencies this system does not model yet — the caller
 * decides whether that is an error, rather than a wrong currency being assumed.
 */
export function parseCurrencyCode(value: string): CurrencyCode | null {
  return SUPPORTED_CURRENCIES.find((code) => code === value) ?? null;
}
