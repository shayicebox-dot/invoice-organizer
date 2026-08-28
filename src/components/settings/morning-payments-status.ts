import type { Money } from '@/core/money';
import type { SettlementState } from '@/core/metrics/payment-classification';
import type { SalesOrigin } from '@/lib/config/sales-origin';

/**
 * View model for the Morning payment diagnostics shown in Settings.
 *
 * Types only, shared by the server action and the client component.
 * Deliberately narrow: no credential, token or customer identity has a
 * representation here, so none can reach the browser by accident.
 */

export type ObservedFieldView = {
  readonly key: string;
  readonly value: string;
};

export type PaymentRowView = {
  /** The payment's own date, not the document's. */
  readonly date: string | null;
  /** `null` when the amount or its currency could not be read. */
  readonly amount: Money | null;
  /**
   * The amount as it reaches a total: negative for a reversal, and `null` when
   * the payment is not settled or could not be priced. Shown rather than the
   * stated amount so the arithmetic above the table can be followed.
   */
  readonly settledAmount: Money | null;
  /** What Morning actually said, kept alongside so a failed parse is visible. */
  readonly rawAmount: string | null;
  readonly currency: string | null;
  /** True when the currency was taken from the parent document, not the payment. */
  readonly currencyFromDocument: boolean;
  /** Morning's payment-type code, from the payment. Never the document's type. */
  readonly typeCode: number | null;
  readonly subType: number | null;
  readonly appType: number | null;
  readonly cardType: number | null;
  readonly dealType: number | null;
  readonly paymentId: string | null;
  readonly documentId: string | null;
  readonly documentNumber: string | null;
  readonly documentType: number | null;
  /** Where the sale came from, decided from the document's descriptions. */
  readonly origin: SalesOrigin;
  /** The description that decided the classification, verbatim. */
  readonly matchedDescription: string | null;
  /**
   * The Shopify order reference exactly as written, when one was found. Its
   * presence is what made the row Shopify-originated.
   */
  readonly matchedOrderMarker: string | null;
  /** Whether the payment actually moved money. */
  readonly settlement: SettlementState;
  /** True when the parent document is a credit note, so the amount subtracts. */
  readonly isReversal: boolean;
  /** The descriptions the classification read, shown so it can be checked. */
  readonly descriptions: readonly string[];
  /** Names of URL-carrying fields. The URLs themselves are never sent here. */
  readonly urlFields: readonly string[];
  readonly extras: readonly ObservedFieldView[];
};

export type OriginTotalView = {
  readonly origin: SalesOrigin;
  readonly count: number;
  readonly settledCount: number;
  readonly totals: readonly Money[];
  readonly unpriced: number;
  readonly unsupportedCurrencies: readonly string[];
  readonly reversals: number;
};

export type PaymentTypeTotalView = {
  readonly typeCode: number;
  readonly count: number;
  readonly totals: readonly Money[];
  readonly unpriced: number;
  readonly unsupportedCurrencies: readonly string[];
};

export type MorningPaymentsView =
  | {
      readonly status: 'read';
      readonly range: { readonly start: string; readonly end: string };
      readonly totals: readonly PaymentTypeTotalView[];
      /** Totals by where the sale came from — the headline of this panel. */
      readonly byOrigin: readonly OriginTotalView[];
      /** Payments left out of every total because nothing was actually paid. */
      readonly unpaidCount: number;
      /** Payments left out of every total because the document was cancelled. */
      readonly cancelledCount: number;
      /** Unique parent documents read in full, one request each. */
      readonly documentsFetched: number;
      /** Documents whose full read failed; their payments stay unclassified. */
      readonly documentsFailed: number;
      /** Documents read in full that carried no description text at all. */
      readonly documentsWithoutDescriptions: number;
      /** True when the enrichment ceiling was reached, leaving some unclassified. */
      readonly enrichmentTruncated: boolean;
      /** Nested payments found, not documents returned. */
      readonly matchedCount: number;
      /** Documents the search matched, each of which may hold several payments. */
      readonly documentCount: number;
      /** Documents that carried no readable payment array. */
      readonly documentsWithoutPayments: number;
      /** The nested key the payments were read from. `null` when none was found. */
      readonly paymentKey: string | null;
      readonly unexpectedTypeCount: number;
      readonly rows: readonly PaymentRowView[];
      /** True when rows were dropped from the table, though never from the totals. */
      readonly rowsTruncated: boolean;
      /** True when the page sweep stopped early, which makes the totals partial. */
      readonly sweepTruncated: boolean;
      readonly pagesRead: number;
      /** Pages Morning said the search has. `null` when it did not say. */
      readonly pagesReported: number | null;
      /** Which envelope key the results were found under. */
      readonly shape: string;
      readonly checkedAt: string;
    }
  | {
      readonly status: 'error' | 'not-connected';
      readonly message: string;
      readonly guidance: string;
      readonly httpStatus: number | null;
      readonly checkedAt: string;
    };
