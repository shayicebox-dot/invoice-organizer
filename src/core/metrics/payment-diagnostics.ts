import {
  moneyFromDecimalString,
  parseCurrencyCode,
  sumMoney,
  type CurrencyCode,
  type Money,
} from '@/core/money';

/**
 * Totals over payments recorded by an external system, for inspection only.
 *
 * This is a counting exercise, not a financial calculation: it says what a
 * provider reports, in the provider's own terms. No figure here is revenue, and
 * nothing downstream may treat it as such — a payment collected in a period is
 * not the same event as a sale made in one, and reconciling the two is a
 * separate question that has not been answered yet.
 *
 * Amounts are summed per currency and never across them. A row whose amount or
 * currency cannot be read is counted as unpriced and left out of every total,
 * rather than contributing a silent zero.
 */

export type DiagnosticPayment = {
  /** The provider's own payment-type code. */
  readonly typeCode: number | null;
  /** The amount as the provider stated it, still text. */
  readonly amount: string | null;
  readonly currency: string | null;
};

export type PaymentTypeSummary = {
  readonly typeCode: number;
  readonly count: number;
  /** One total per currency seen. Empty when nothing could be priced. */
  readonly totals: readonly Money[];
  /** Rows left out of the totals, and why. */
  readonly unpriced: number;
  readonly unsupportedCurrencies: readonly string[];
};

export type PaymentDiagnosticsSummary = {
  readonly byType: readonly PaymentTypeSummary[];
  /** Every payment returned, including any whose type was not one asked for. */
  readonly totalCount: number;
  /** Payments whose type code was not among those requested. */
  readonly unexpectedTypeCount: number;
};

export function summarisePayments(
  payments: readonly DiagnosticPayment[],
  typeCodes: readonly number[],
): PaymentDiagnosticsSummary {
  const byType = typeCodes.map((typeCode) =>
    summariseOneType(
      payments.filter((payment) => payment.typeCode === typeCode),
      typeCode,
    ),
  );

  const unexpectedTypeCount = payments.filter(
    (payment) => payment.typeCode === null || !typeCodes.includes(payment.typeCode),
  ).length;

  return { byType, totalCount: payments.length, unexpectedTypeCount };
}

function summariseOneType(
  payments: readonly DiagnosticPayment[],
  typeCode: number,
): PaymentTypeSummary {
  const amountsByCurrency = new Map<CurrencyCode, Money[]>();
  const unsupportedCurrencies = new Set<string>();
  let unpriced = 0;

  for (const payment of payments) {
    const priced = priceOne(payment);

    if (priced === null) {
      unpriced += 1;
      if (payment.currency !== null && parseCurrencyCode(payment.currency) === null) {
        unsupportedCurrencies.add(payment.currency);
      }
      continue;
    }

    const existing = amountsByCurrency.get(priced.currency);
    if (existing === undefined) amountsByCurrency.set(priced.currency, [priced]);
    else existing.push(priced);
  }

  const totals = [...amountsByCurrency.entries()].map(([currency, amounts]) =>
    sumMoney(currency, amounts),
  );

  return {
    typeCode,
    count: payments.length,
    totals,
    unpriced,
    unsupportedCurrencies: [...unsupportedCurrencies],
  };
}

/** `null` when the row cannot be priced — a missing, malformed or unmodelled amount. */
function priceOne(payment: DiagnosticPayment): Money | null {
  if (payment.amount === null || payment.currency === null) return null;

  const currency = parseCurrencyCode(payment.currency);
  if (currency === null) return null;

  try {
    return moneyFromDecimalString(payment.amount, currency);
  } catch {
    return null;
  }
}
