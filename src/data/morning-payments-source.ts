import 'server-only';

import {
  fetchPaymentsInRange,
  PAYMENT_TYPE_CREDIT_CARD,
  PAYMENT_TYPE_PAYMENT_APP,
  type MorningPaymentRecord,
} from '@/integrations/morning/payments';
import { MorningConfigError } from '@/integrations/morning/config';
import {
  MORNING_FAILURE_GUIDANCE,
  MorningError,
  type MorningFailureReason,
} from '@/integrations/morning/errors';
import { summarisePayments } from '@/core/metrics/payment-diagnostics';
import {
  CANCELLED_DOCUMENT_STATUS,
  CREDIT_NOTE_DOCUMENT_TYPE,
  UNPAID_PAYMENT_TYPE,
  classifyOrigin,
  signedPaymentAmount,
  summariseByOrigin,
  type ClassifiedPayment,
  type SettlementState,
} from '@/core/metrics/payment-classification';
import { moneyFromDecimalString, parseCurrencyCode } from '@/core/money';
import type { DateRange } from '@/core/period';
import { isMorningConfigured } from '@/lib/config/env';
import type {
  MorningPaymentsView,
  PaymentRowView,
} from '@/components/settings/morning-payments-status';

/**
 * Morning payment diagnostics: what the accounting system says was collected
 * in a period, in its own vocabulary.
 *
 * One row per payment, not per document. Morning's search matches documents and
 * returns each with its payments nested inside, so a single invoice-receipt can
 * carry several payments and every figure here counts the nested entries.
 *
 * Each payment is also classified by where its sale came from, read from the
 * document's own descriptions. That classification is the point of this step:
 * it separates direct sales the store never saw from documents raised against
 * Shopify orders, which Shopify already reports and which must never be counted
 * a second time. It is still evidence only — no figure on any screen reads it.
 *
 * Read-only, and deliberately isolated. Nothing here is imported by the
 * dashboard, by any metric, or by the profitability engine — a payment recorded
 * in a period is not a sale made in one, and until that difference is modelled
 * these figures are evidence to look at, not revenue.
 */

/** The two types asked about: Morning's credit-card and payment-app codes. */
export const DIAGNOSTIC_PAYMENT_TYPES: readonly number[] = [
  PAYMENT_TYPE_CREDIT_CARD,
  PAYMENT_TYPE_PAYMENT_APP,
];

/**
 * The table shows this many rows at most. The totals above it are computed over
 * everything read, so a truncated table never becomes a truncated figure — and
 * the screen says which happened.
 */
const MAX_ROWS_SHOWN = 200;

export async function getMorningPaymentDiagnostics(
  range: DateRange,
  checkedAt: string,
): Promise<MorningPaymentsView> {
  if (!isMorningConfigured()) {
    return failure('not-configured', 'Morning credentials are not set on this deployment.', checkedAt);
  }

  try {
    const page = await fetchPaymentsInRange(range, DIAGNOSTIC_PAYMENT_TYPES);
    const rows = page.payments.map(toRow);
    const origins = summariseByOrigin(
      rows.map((row) => ({
        origin: row.origin,
        settlement: row.settlement,
        amount: row.rawAmount,
        currency: row.currency,
        isReversal: row.isReversal,
      })),
    );
    const summary = summarisePayments(
      page.payments.map((payment) => ({
        typeCode: payment.type,
        amount: payment.amount,
        currency: payment.currency,
      })),
      DIAGNOSTIC_PAYMENT_TYPES,
    );

    return {
      status: 'read',
      range: { start: range.start, end: range.end },
      totals: summary.byType,
      byOrigin: origins.byOrigin,
      unpaidCount: origins.unpaidCount,
      cancelledCount: origins.cancelledCount,
      documentsFetched: page.documentsFetched,
      documentsFailed: page.documentsFailed,
      documentsWithoutDescriptions: page.documentsWithoutDescriptions,
      enrichmentTruncated: page.enrichmentTruncated,
      matchedCount: summary.totalCount,
      documentCount: page.documentCount,
      documentsWithoutPayments: page.documentsWithoutPayments,
      paymentKey: page.paymentKey,
      unexpectedTypeCount: summary.unexpectedTypeCount,
      rows: rows.slice(0, MAX_ROWS_SHOWN),
      rowsTruncated: page.payments.length > MAX_ROWS_SHOWN,
      sweepTruncated: page.truncated,
      pagesRead: page.pagesRead,
      pagesReported: page.pagesReported,
      shape: page.shape,
      checkedAt,
    };
  } catch (error) {
    if (error instanceof MorningConfigError) {
      return failure('invalid-configuration', error.message, checkedAt);
    }
    if (error instanceof MorningError) {
      return failure(error.reason, error.message, checkedAt, error.status);
    }
    return failure('network-error', 'The payment search failed.', checkedAt);
  }
}

/**
 * One payment as the screen shows it.
 *
 * The amount is parsed here rather than in the integration so a malformed value
 * stays visible: `amount` is null and `rawAmount` still carries exactly what
 * Morning said, instead of the row silently reading as zero.
 */
function toRow(payment: MorningPaymentRecord): PaymentRowView {
  const origin = classifyOrigin(payment.descriptions);
  const settlement = settlementOf(payment);
  const isReversal = payment.documentType === CREDIT_NOTE_DOCUMENT_TYPE;

  const classified: ClassifiedPayment = {
    origin: origin.origin,
    settlement,
    amount: payment.amount,
    currency: payment.currency,
    isReversal,
  };

  return {
    origin: origin.origin,
    matchedDescription: origin.matched,
    matchedOrderMarker: origin.orderMarker,
    settlement,
    isReversal,
    descriptions: payment.descriptions,
    // The same function the totals use, so a row can never disagree with the
    // figure it is part of.
    settledAmount: settlement === 'settled' ? signedPaymentAmount(classified) : null,
    date: payment.date,
    amount: priceRow(payment),
    rawAmount: payment.amount,
    currency: payment.currency,
    currencyFromDocument: payment.currencyFromDocument,
    typeCode: payment.type,
    subType: payment.subType,
    appType: payment.appType,
    cardType: payment.cardType,
    dealType: payment.dealType,
    paymentId: payment.paymentId,
    documentId: payment.documentId,
    documentNumber: payment.documentNumber,
    documentType: payment.documentType,
    urlFields: payment.urlFields,
    extras: payment.extras,
  };
}

/**
 * Whether this payment moved money.
 *
 * A cancelled document is a record that was withdrawn, and Morning's `-1`
 * payment type means the line is not paid at all. Both are excluded from every
 * total and still listed, so the panel shows what exists rather than only what
 * counts.
 */
function settlementOf(payment: MorningPaymentRecord): SettlementState {
  if (payment.documentStatus === CANCELLED_DOCUMENT_STATUS) return 'cancelled';
  if (payment.type === UNPAID_PAYMENT_TYPE) return 'unpaid';
  return 'settled';
}

function priceRow(payment: MorningPaymentRecord): PaymentRowView['amount'] {
  if (payment.amount === null || payment.currency === null) return null;

  const currency = parseCurrencyCode(payment.currency);
  if (currency === null) return null;

  try {
    return moneyFromDecimalString(payment.amount, currency);
  } catch {
    return null;
  }
}

function failure(
  reason: MorningFailureReason,
  message: string,
  checkedAt: string,
  httpStatus: number | null = null,
): MorningPaymentsView {
  return {
    status: reason === 'not-configured' ? 'not-connected' : 'error',
    message,
    guidance: MORNING_FAILURE_GUIDANCE[reason],
    httpStatus,
    checkedAt,
  };
}
