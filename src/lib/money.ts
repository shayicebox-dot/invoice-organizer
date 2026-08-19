/**
 * Money primitives.
 *
 * All monetary values are stored and manipulated as **integer minor currency
 * units** (cents for USD/EUR, agorot for ILS, yen for JPY). Floating point is
 * never used to hold a monetary amount, so `0.1 + 0.2` style drift cannot
 * enter the P&L.
 *
 * The `Money` type is branded, which means a raw `number` cannot be passed
 * where money is expected and money cannot be added with `+`. Every arithmetic
 * operation goes through a helper in this module, and every helper is
 * responsible for keeping the result an integer.
 */

declare const MONEY_BRAND: unique symbol;

/** An integer amount of minor currency units. */
export type Money = number & { readonly [MONEY_BRAND]: "minor" };

/** ISO-4217 currency code. */
export type CurrencyCode = "USD" | "EUR" | "GBP" | "ILS";

/** Number of minor units in one major unit, per supported currency. */
const MINOR_UNITS_PER_MAJOR: Record<CurrencyCode, number> = {
  USD: 100,
  EUR: 100,
  GBP: 100,
  ILS: 100,
};

/** Decimal places used when rendering a currency. */
const FRACTION_DIGITS: Record<CurrencyCode, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  ILS: 2,
};

export const ZERO = 0 as Money;

/** Round half away from zero, so -0.5 -> -1 and 0.5 -> 1. */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Build a `Money` from a count of minor units. Throws on non-integers. */
export function fromMinor(units: number): Money {
  if (!Number.isFinite(units) || !Number.isInteger(units)) {
    throw new TypeError(`Money must be an integer number of minor units, received: ${units}`);
  }
  return units as Money;
}

/**
 * Build a `Money` from a major-unit amount (e.g. dollars). Intended for
 * boundaries only — configuration, seed data and parsed user input.
 */
export function fromMajor(amount: number, currency: CurrencyCode = "USD"): Money {
  const factor = MINOR_UNITS_PER_MAJOR[currency];
  return fromMinor(roundHalfAwayFromZero(amount * factor));
}

/**
 * Parse a decimal amount that arrived as a string (Shopify and most finance
 * APIs return `"18420.55"`) into integer minor units.
 *
 * The digits are read out of the string rather than multiplied through a
 * float, so no amount can drift: `parseFloat("18420.55") * 100` is
 * 1842054.9999999998, which rounds correctly here but not everywhere. Extra
 * fractional digits beyond the currency's precision are rounded half away
 * from zero.
 */
export function parseDecimalToMinor(value: string, currency: CurrencyCode = "USD"): Money {
  const trimmed = value.trim();
  const match = /^(-)?(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match || (match[2] === "" && (match[3] ?? "") === "")) {
    throw new TypeError(`Not a decimal amount: ${JSON.stringify(value)}`);
  }

  const [, sign, whole = "", fraction = ""] = match;
  const precision = FRACTION_DIGITS[currency];

  const kept = fraction.slice(0, precision).padEnd(precision, "0");
  const units = Number(`${whole || "0"}${kept}`);

  // Round based on the first discarded digit.
  const nextDigit = fraction.charCodeAt(precision) - 48;
  const rounded = nextDigit >= 5 && nextDigit <= 9 ? units + 1 : units;

  return fromMinor(sign === "-" ? -rounded : rounded);
}

/** Convert back to major units. For display and charting only. */
export function toMajor(money: Money, currency: CurrencyCode = "USD"): number {
  return money / MINOR_UNITS_PER_MAJOR[currency];
}

/** Raw minor units, for serialization. */
export function toMinor(money: Money): number {
  return money;
}

export function add(a: Money, b: Money): Money {
  return (a + b) as Money;
}

export function subtract(a: Money, b: Money): Money {
  return (a - b) as Money;
}

export function negate(a: Money): Money {
  return -a as Money;
}

export function abs(a: Money): Money {
  return Math.abs(a) as Money;
}

export function sum(values: readonly Money[]): Money {
  let total = 0;
  for (const value of values) total += value;
  return total as Money;
}

/** Multiply by a whole number of units (e.g. line quantity). */
export function multiply(money: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) {
    throw new TypeError(`multiply() expects an integer quantity, received: ${quantity}`);
  }
  return (money * quantity) as Money;
}

/**
 * Apply a decimal rate (e.g. 0.029 for a 2.9% processing fee) and round to the
 * nearest minor unit.
 */
export function scale(money: Money, rate: number): Money {
  return roundHalfAwayFromZero(money * rate) as Money;
}

/**
 * Divide an amount into `parts` shares that sum back to exactly the original
 * amount. Remainder minor units are distributed one at a time from the front,
 * so no cent is created or lost when allocating fixed costs across days.
 */
export function allocate(money: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new RangeError(`allocate() expects a positive integer part count, received: ${parts}`);
  }
  const base = Math.trunc(money / parts);
  let remainder = money - base * parts;
  const step = remainder < 0 ? -1 : 1;
  const shares: Money[] = [];
  for (let i = 0; i < parts; i += 1) {
    let share = base;
    if (remainder !== 0) {
      share += step;
      remainder -= step;
    }
    shares.push(share as Money);
  }
  return shares;
}

export function isNegative(money: Money): boolean {
  return money < 0;
}

export function isZero(money: Money): boolean {
  return money === 0;
}

/**
 * Ratio of two amounts as a plain number (e.g. margin). Returns `null` when the
 * denominator is zero, which callers render as "—" rather than 0% or NaN.
 */
export function ratio(numerator: Money, denominator: Money): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export interface FormatMoneyOptions {
  /** Force a leading + on positive amounts. */
  signed?: boolean;
  /** Drop the decimal part (used in dense tables and chart axes). */
  whole?: boolean;
  /** Render as $18.4k / $1.2M. */
  compact?: boolean;
}

export function formatMoney(
  money: Money,
  currency: CurrencyCode = "USD",
  options: FormatMoneyOptions = {},
): string {
  const { signed = false, whole = false, compact = false } = options;
  const digits = compact || whole ? 0 : FRACTION_DIGITS[currency];
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: compact ? 1 : digits,
    notation: compact ? "compact" : "standard",
  });
  const formatted = formatter.format(toMajor(money, currency));
  if (signed && money > 0) return `+${formatted}`;
  return formatted;
}

/** Format a decimal ratio as a percentage, e.g. 0.2137 -> "21.4%". */
export function formatPercent(value: number | null, fractionDigits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

/** Multiplier such as ROAS, e.g. 3.42 -> "3.42x". */
export function formatMultiple(value: number | null, fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(fractionDigits)}x`;
}
