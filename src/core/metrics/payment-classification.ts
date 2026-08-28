import {
  addMoney,
  moneyFromDecimalString,
  parseCurrencyCode,
  type CurrencyCode,
  type Money,
} from '@/core/money';
import {
  EXTERNAL_SALE_PHRASE,
  SHOPIFY_ORDER_MARKER,
  type SalesOrigin,
} from '@/lib/config/sales-origin';

/**
 * Classifying an accounting system's payments by where the sale came from.
 *
 * Pure, and inspection-only: nothing here is revenue. It answers one question —
 * of the payments Morning recorded, which belong to sales the store never saw?
 * — so that question can be checked against reality before any of it is
 * allowed near a figure.
 *
 * Two rules govern the arithmetic, and both exist to stop a total being
 * overstated:
 *
 * - **A sale is counted once.** A document carrying a Shopify order reference
 *   describes a sale Shopify already reports. It is classified, listed and
 *   counted, and it is never part of external revenue. The order reference is
 *   checked first and settles the question on its own, because a Shopify
 *   document names the product too — matching the product phrase first counted
 *   Shopify sales as direct ones.
 * - **Money that went back reduces the total.** A credit note is a reversal, so
 *   its payments count negatively against the class they belong to. A refund of
 *   a direct sale therefore lowers external revenue rather than adding to it.
 */

/** Morning's document-type code for a credit note. */
export const CREDIT_NOTE_DOCUMENT_TYPE = 330;

/** Morning's document status for a cancelled document. */
export const CANCELLED_DOCUMENT_STATUS = 4;

/** Morning's payment-type code for "not paid". */
export const UNPAID_PAYMENT_TYPE = -1;

/**
 * Whether a payment represents money that actually moved.
 *
 * `unpaid` and `cancelled` are excluded from every total: an unpaid line is a
 * plan, and a cancelled document is a record that was withdrawn. Both are still
 * listed and counted, because a total that silently drops rows is not evidence.
 */
export type SettlementState = 'settled' | 'unpaid' | 'cancelled';

export type ClassifiedPayment = {
  readonly origin: SalesOrigin;
  readonly settlement: SettlementState;
  /** The amount as the provider stated it, still text. */
  readonly amount: string | null;
  readonly currency: string | null;
  /** True when the parent document reverses another — a credit note. */
  readonly isReversal: boolean;
};

export type OriginSummary = {
  readonly origin: SalesOrigin;
  /** Every payment of this origin, settled or not. */
  readonly count: number;
  /** Payments that actually moved money, and so reach the totals. */
  readonly settledCount: number;
  /** Signed totals, one per currency. Reversals subtract. */
  readonly totals: readonly Money[];
  /** Settled payments left out of the totals — unreadable amount or currency. */
  readonly unpriced: number;
  readonly unsupportedCurrencies: readonly string[];
  /** How many of the settled payments were reversals. */
  readonly reversals: number;
};

export type ClassificationSummary = {
  readonly byOrigin: readonly OriginSummary[];
  readonly totalCount: number;
  readonly unpaidCount: number;
  readonly cancelledCount: number;
};

const ORIGINS: readonly SalesOrigin[] = ['external', 'shopify', 'unclassified'];

/**
 * Decide a sale's origin from the descriptions attached to it.
 *
 * Order matters, and it is the whole rule:
 *
 * 1. A Shopify order reference anywhere makes the sale Shopify-originated.
 * 2. Only when there is none does the product phrase make it a direct sale.
 * 3. Otherwise it is unclassified.
 *
 * The first step is not a tie-break, it is precedence. Real Shopify-raised
 * documents name the product as well — `קופסאות אחסון לנעליים` sits on them
 * beside `הזמנה 2242` — so a rule that looked for the product first classified
 * Shopify sales as direct ones, which would have counted revenue Shopify
 * already reports a second time.
 */
export function classifyOrigin(descriptions: readonly string[]): {
  readonly origin: SalesOrigin;
  /**
   * The description that decided it, verbatim. `null` when nothing matched, so
   * a classification always carries the text it was made from and can be
   * checked rather than trusted.
   */
  readonly matched: string | null;
  /** The order reference exactly as written, when one was found. */
  readonly orderMarker: string | null;
} {
  // Matched per description rather than over a joined string, so a marker
  // cannot be formed across two descriptions that each hold part of it — and so
  // the one that decided the answer can be named.
  for (const text of descriptions) {
    const marker = SHOPIFY_ORDER_MARKER.exec(text);
    if (marker !== null) {
      return { origin: 'shopify', matched: text, orderMarker: marker[0] };
    }
  }

  const external = descriptions.find((text) => text.includes(EXTERNAL_SALE_PHRASE));

  if (external !== undefined) {
    return { origin: 'external', matched: external, orderMarker: null };
  }

  return { origin: 'unclassified', matched: null, orderMarker: null };
}

export function summariseByOrigin(payments: readonly ClassifiedPayment[]): ClassificationSummary {
  return {
    byOrigin: ORIGINS.map((origin) =>
      summariseOne(
        payments.filter((payment) => payment.origin === origin),
        origin,
      ),
    ),
    totalCount: payments.length,
    unpaidCount: payments.filter((payment) => payment.settlement === 'unpaid').length,
    cancelledCount: payments.filter((payment) => payment.settlement === 'cancelled').length,
  };
}

function summariseOne(
  payments: readonly ClassifiedPayment[],
  origin: SalesOrigin,
): OriginSummary {
  const settled = payments.filter((payment) => payment.settlement === 'settled');
  const totals = new Map<CurrencyCode, Money>();
  const unsupportedCurrencies = new Set<string>();
  let unpriced = 0;

  for (const payment of settled) {
    const amount = signedPaymentAmount(payment);

    if (amount === null) {
      unpriced += 1;
      if (payment.currency !== null && parseCurrencyCode(payment.currency) === null) {
        unsupportedCurrencies.add(payment.currency);
      }
      continue;
    }

    const running = totals.get(amount.currency);
    totals.set(amount.currency, running === undefined ? amount : addMoney(running, amount));
  }

  return {
    origin,
    count: payments.length,
    settledCount: settled.length,
    totals: [...totals.values()],
    unpriced,
    unsupportedCurrencies: [...unsupportedCurrencies],
    reversals: settled.filter((payment) => payment.isReversal).length,
  };
}

/**
 * The payment's amount, negative when it reverses a sale.
 *
 * An amount Morning already states as negative is left alone: negating it again
 * would turn a refund back into income. `null` when the amount or its currency
 * cannot be read — such a row is counted as unpriced rather than contributing a
 * silent zero.
 */
export function signedPaymentAmount(payment: ClassifiedPayment): Money | null {
  if (payment.amount === null || payment.currency === null) return null;

  const currency = parseCurrencyCode(payment.currency);
  if (currency === null) return null;

  let parsed: Money;

  try {
    parsed = moneyFromDecimalString(payment.amount, currency);
  } catch {
    return null;
  }

  if (!payment.isReversal || parsed.minorUnits <= 0) return parsed;

  return { minorUnits: -parsed.minorUnits, currency };
}
