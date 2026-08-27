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

export type MorningPaymentRecord = {
  /** The payment date exactly as Morning states it. */
  readonly date: string | null;
  /** The amount as text, converted to `Money` a layer up so parsing can fail loudly. */
  readonly amount: string | null;
  readonly currency: string | null;
  /** Morning's payment-type code. Not translated into a payment brand here. */
  readonly type: number | null;
  readonly subType: number | null;
  readonly appType: number | null;
  readonly cardType: number | null;
  readonly dealType: number | null;
  readonly paymentId: string | null;
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
  readonly payments: readonly MorningPaymentRecord[];
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
      if (isRecord(item)) collected.push(parsePayment(item));
    }

    const lastPage =
      pagesReported === null ? found.items.length < PAGE_SIZE : page >= pagesReported;

    // A page that came back empty ends the sweep whatever the count said: a
    // stated page total that never runs out would otherwise loop to the ceiling.
    if (lastPage || found.items.length === 0) {
      return { payments: collected, truncated: false, pagesRead, pagesReported, shape };
    }
  }

  return { payments: collected, truncated: true, pagesRead, pagesReported, shape };
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

function parsePayment(item: Record<string, unknown>): MorningPaymentRecord {
  const recognised = new Set<string>();

  const text = (...keys: readonly string[]): string | null => {
    for (const key of keys) {
      recognised.add(key);
      const value = readField(item, key);
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return null;
  };

  const integer = (...keys: readonly string[]): number | null => {
    for (const key of keys) {
      recognised.add(key);
      const value = readField(item, key);
      if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
  };

  const record: MorningPaymentRecord = {
    date: text('date', 'paymentDate'),
    amount: text('price', 'amount', 'sum'),
    currency: text('currency'),
    type: integer('type', 'paymentType'),
    subType: integer('subType'),
    appType: integer('appType'),
    cardType: integer('cardType'),
    dealType: integer('dealType'),
    paymentId: text('id', 'paymentId'),
    documentId: text('documentId', 'docId'),
    documentNumber: text('documentNumber', 'number', 'docNumber'),
    documentType: integer('documentType', 'docType'),
    urlFields: [],
    extras: [],
  };

  const urlFields: string[] = [];
  const extras: ObservedField[] = [];

  for (const [key, value] of Object.entries(item)) {
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

function truncate(value: string): string {
  return value.length <= MAX_EXTRA_LENGTH ? value : `${value.slice(0, MAX_EXTRA_LENGTH)}…`;
}
