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
      matchedCount: summary.totalCount,
      unexpectedTypeCount: summary.unexpectedTypeCount,
      rows: page.payments.slice(0, MAX_ROWS_SHOWN).map(toRow),
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
  return {
    date: payment.date,
    amount: priceRow(payment),
    rawAmount: payment.amount,
    currency: payment.currency,
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
