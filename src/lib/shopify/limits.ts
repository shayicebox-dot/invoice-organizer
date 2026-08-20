/**
 * Runaway-loop backstops for the Shopify readers.
 *
 * Not data caps. A reader pages until Shopify says there is nothing left; these
 * bounds exist only so a pagination bug, or a `hasNextPage` that never goes
 * false, cannot loop forever. They sit far above any plausible order volume for
 * a range a person would actually select.
 *
 * When one is hit the reader sets `truncated`, which forces the P&L to report
 * INCOMPLETE. A silent stop is the failure mode being avoided: an order the
 * reader never fetched looks exactly like an order that never happened.
 */

/** Orders one reader will scan before declaring something has gone wrong. */
export const MAX_ORDERS_SCANNED = 200_000;

/** Pages that allows, given a page size. */
export function maxPagesFor(pageSize: number): number {
  return Math.ceil(MAX_ORDERS_SCANNED / Math.max(1, pageSize));
}
