import 'server-only';

import { morningSearch } from '@/integrations/morning/client';
import { getMorningConfig } from '@/integrations/morning/config';
import { isRecord, readField } from '@/integrations/shopify/json';
import type { DateRange } from '@/core/period';

/**
 * Read-only diagnostic reads of Morning's recorded payments.
 *
 * This exists to answer one question the system cannot yet answer: what do
 * ICEBOX's real collections actually look like in Morning? Nothing here feeds a
 * figure. No revenue, cost or profit anywhere in the app depends on it.
 *
 * The search returns **documents**, not payments: each entry in `items` is the
 * document that contains the matching payment(s), and the payments themselves
 * are in its nested `payment` array. Reading an item as though it were a
 * payment is how the first version of this reported one row of type 320 — the
 * document type for a tax invoice-receipt — for ₪0. Every figure here therefore
 * comes from a nested payment entry, and the document supplies only context:
 * its id, its number and its type.
 *
 * The parsing is deliberately shape-tolerant. The documented payment object
 * covers `type`, `subType`, `appType`, `cardType`, `dealType` and friends, but
 * which of them Morning actually populates for this account is exactly what is
 * being inspected — so recognised fields are named, and everything else that
 * comes back is carried through as observed extras rather than dropped. A field
 * that would identify a customer, or that looks like a credential, is dropped
 * rather than carried.
 */

const SEARCH_PATH = 'documents/payments/search';

/** Morning's own payment-type codes. Passed as filters, not interpreted. */
export const PAYMENT_TYPE_CREDIT_CARD = 3;
export const PAYMENT_TYPE_PAYMENT_APP = 10;

/**
 * Morning's documented search page size. Larger values are rejected outright —
 * asking for 100 returns 400 `גודל תוצאות חיפוש לא תקין` ("invalid search
 * result size"), which is how this was found. How many rows a screen shows is a
 * separate question from how many rows a request may ask for.
 */
const PAGE_SIZE = 25;

/** Morning numbers search pages from 1, not 0. */
const FIRST_PAGE = 1;

/**
 * A ceiling, not an expectation. Reached only by a period with more than
 * 5,000 matching payments — and when it is reached the caller says so, because
 * a total quietly computed over part of the answer is worse than no total.
 */
const MAX_PAGES = 200;

/** Keys never carried out of the payload, matched case-insensitively. */
const SENSITIVE_KEY = /email|phone|mobile|address|street|city|zip|country|taxid|holder|client|customer|recipient|contact|cardnum|chequenum|bankaccount|bankbranch|token|secret|password|auth|jwt|apikey|signature/i;

/** Keys whose value is a link rather than a fact about the payment. */
const URL_KEY = /url|link|href/i;

const MAX_EXTRA_LENGTH = 120;

export type ObservedField = {
  readonly key: string;
  readonly value: string;
};

/**
 * One nested payment, with its parent document for context.
 *
 * Everything above `documentId` comes from the payment entry. Everything from
 * `documentId` down comes from the document that contains it, and is never
 * read as a property of the payment — the document's own `type` is a document
 * type, not a payment type.
 */
export type MorningPaymentRecord = {
  /** The payment's own date, from the payment entry. */
  readonly date: string | null;
  /** The amount as text, converted to `Money` a layer up so parsing can fail loudly. */
  readonly amount: string | null;
  readonly currency: string | null;
  /**
   * True when the payment stated no currency and the document's was used.
   * Flagged because currency decides which total a row joins, and a borrowed
   * one is an inference rather than something Morning said about this payment.
   */
  readonly currencyFromDocument: boolean;
  /** Morning's payment-type code. Not translated into a payment brand here. */
  readonly type: number | null;
  readonly subType: number | null;
  readonly appType: number | null;
  readonly cardType: number | null;
  readonly dealType: number | null;
  readonly paymentId: string | null;
  /** Parent document context. Never a payment's own property. */
  readonly documentId: string | null;
  readonly documentNumber: string | null;
  readonly documentType: number | null;
  /**
   * Names of fields carrying a URL. The names are reported and the URLs are
   * not: a hosted-payment link is a way to take money, and the question here is
   * only whether such a relationship exists.
   */
  readonly urlFields: readonly string[];
  /** Everything else Morning returned, for identifying what distinguishes what. */
  readonly extras: readonly ObservedField[];
};

export type MorningPaymentsPage = {
  /** One entry per nested payment, not per document. */
  readonly payments: readonly MorningPaymentRecord[];
  /** Documents the search matched. Always at most the number of payments. */
  readonly documentCount: number;
  /**
   * Documents carrying no readable payment array. Reported rather than ignored:
   * it would be the first sign that the nested key is not what it looks like.
   */
  readonly documentsWithoutPayments: number;
  /** Which nested key the payments were found under, for the diagnostic to state. */
  readonly paymentKey: string | null;
  /** True when the sweep stopped at `MAX_PAGES` with more still to read. */
  readonly truncated: boolean;
  readonly pagesRead: number;
  /** Total pages Morning reported, when it said. `null` when it did not. */
  readonly pagesReported: number | null;
  /** The envelope key the items were found under, for the diagnostic to report. */
  readonly shape: string;
};

/**
 * Every payment of the given types in the range, following pagination to the
 * end rather than assuming one page holds everything.
 *
 * Morning states how many pages the search has, so the sweep follows that count
 * rather than inferring the end from a short page. When it does not say, a page
 * holding fewer rows than were asked for is taken as the last one.
 */
export async function fetchPaymentsInRange(
  range: DateRange,
  paymentTypes: readonly number[],
): Promise<MorningPaymentsPage> {
  const config = getMorningConfig();
  const collected: MorningPaymentRecord[] = [];
  let shape = 'unknown';
  let pagesRead = 0;
  let pagesReported: number | null = null;
  let documentCount = 0;
  let documentsWithoutPayments = 0;
  let paymentKey: string | null = null;

  for (let page = FIRST_PAGE; page < FIRST_PAGE + MAX_PAGES; page += 1) {
    const payload = await morningSearch({
      path: SEARCH_PATH,
      config,
      body: {
        page,
        pageSize: PAGE_SIZE,
        paymentTypes: [...paymentTypes],
        fromDate: range.start,
        toDate: range.end,
        sort: 'date:desc',
      },
    });

    const found = readItems(payload);
    pagesRead += 1;
    shape = found.shape;
    pagesReported = readPageCount(payload) ?? pagesReported;

    for (const item of found.items) {
      if (!isRecord(item)) continue;

      documentCount += 1;
      const nested = readNestedPayments(item);

      if (nested.entries.length === 0) documentsWithoutPayments += 1;
      else paymentKey = nested.key ?? paymentKey;

      const context = readDocumentContext(item);

      for (const entry of nested.entries) {
        collected.push(parsePayment(entry, context));
      }
    }

    const lastPage =
      pagesReported === null ? found.items.length < PAGE_SIZE : page >= pagesReported;

    // A page that came back empty ends the sweep whatever the count said: a
    // stated page total that never runs out would otherwise loop to the ceiling.
    if (lastPage || found.items.length === 0) {
      return {
        payments: collected,
        documentCount,
        documentsWithoutPayments,
        paymentKey,
        truncated: false,
        pagesRead,
        pagesReported,
        shape,
      };
    }
  }

  return {
    payments: collected,
    documentCount,
    documentsWithoutPayments,
    paymentKey,
    truncated: true,
    pagesRead,
    pagesReported,
    shape,
  };
}

/** How many pages Morning says the search has. `null` when it does not say. */
function readPageCount(payload: unknown): number | null {
  if (!isRecord(payload)) return null;

  for (const key of ['pages', 'totalPages', 'pageCount']) {
    const value = readField(payload, key);
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  }

  return null;
}

/**
 * Find the array of results without insisting on one envelope.
 *
 * Morning's search endpoints answer with an object holding the page, but which
 * key carries the rows is not documented for this one. The key that was used is
 * reported alongside the rows, so the diagnostic can state what it read rather
 * than leaving a wrong guess invisible.
 */
function readItems(payload: unknown): { items: readonly unknown[]; shape: string } {
  if (Array.isArray(payload)) return { items: payload, shape: 'array' };

  if (isRecord(payload)) {
    for (const key of ['items', 'data', 'payments', 'results', 'rows']) {
      const value = readField(payload, key);
      if (Array.isArray(value)) return { items: value, shape: key };
    }
  }

  return { items: [], shape: 'unrecognised' };
}

/** Document context: the parent's own identifiers, never a payment's. */
type DocumentContext = {
  readonly documentId: string | null;
  readonly documentNumber: string | null;
  readonly documentType: number | null;
  readonly currency: string | null;
};

/**
 * The payments nested inside one document.
 *
 * Morning documents the key as `payment`; `payments` is accepted as well and
 * the key actually used is reported, so a rename upstream shows up as a stated
 * fact rather than as an empty table nobody can explain.
 */
function readNestedPayments(document: Record<string, unknown>): {
  entries: readonly Record<string, unknown>[];
  key: string | null;
} {
  for (const key of ['payment', 'payments']) {
    const value = readField(document, key);
    if (!Array.isArray(value)) continue;

    const entries = value.filter(isRecord);
    if (entries.length > 0 || value.length === 0) return { entries, key };
  }

  return { entries: [], key: null };
}

function readDocumentContext(document: Record<string, unknown>): DocumentContext {
  return {
    documentId: readText(document, ['id', 'documentId']),
    documentNumber: readText(document, ['number', 'documentNumber']),
    documentType: readInteger(document, ['type', 'documentType']),
    currency: readText(document, ['currency']),
  };
}

/**
 * One nested payment entry, read on its own terms.
 *
 * Every figure comes from the payment. The document contributes identifiers,
 * and its currency only when the payment states none — flagged when it does,
 * because currency decides which total the row joins.
 */
function parsePayment(
  entry: Record<string, unknown>,
  context: DocumentContext,
): MorningPaymentRecord {
  const recognised = new Set<string>();

  const text = (...keys: readonly string[]): string | null => {
    keys.forEach((key) => recognised.add(key));
    return readText(entry, keys);
  };

  const integer = (...keys: readonly string[]): number | null => {
    keys.forEach((key) => recognised.add(key));
    return readInteger(entry, keys);
  };

  const ownCurrency = text('currency');

  const record = {
    date: text('date', 'paymentDate'),
    amount: text('price', 'amount', 'sum'),
    currency: ownCurrency ?? context.currency,
    currencyFromDocument: ownCurrency === null && context.currency !== null,
    type: integer('type', 'paymentType'),
    subType: integer('subType'),
    appType: integer('appType'),
    cardType: integer('cardType'),
    dealType: integer('dealType'),
    paymentId: text('id', 'paymentId'),
    documentId: context.documentId,
    documentNumber: context.documentNumber,
    documentType: context.documentType,
  } as const;

  const urlFields: string[] = [];
  const extras: ObservedField[] = [];

  for (const [key, value] of Object.entries(entry)) {
    if (recognised.has(key)) continue;
    if (SENSITIVE_KEY.test(key)) continue;

    if (URL_KEY.test(key) || (typeof value === 'string' && /^https?:\/\//i.test(value))) {
      urlFields.push(key);
      continue;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) continue;
      extras.push({ key, value: truncate(trimmed) });
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      extras.push({ key, value: String(value) });
    }
    // Nested objects and arrays are not walked: a diagnostic that flattens
    // unknown structures is how customer data leaks into a screen.
  }

  return { ...record, urlFields, extras };
}

function readText(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = readField(source, key);
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readInteger(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = readField(source, key);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function truncate(value: string): string {
  return value.length <= MAX_EXTRA_LENGTH ? value : `${value.slice(0, MAX_EXTRA_LENGTH)}…`;
}
