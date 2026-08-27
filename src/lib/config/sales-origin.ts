/**
 * How ICEBOX tells an off-Shopify sale from a Shopify one in Morning.
 *
 * The business writes its Morning documents to a consistent rule, and that rule
 * — not a payment type — is what identifies where a sale came from. A document
 * raised by hand for a direct sale names the product; a document raised from a
 * Shopify order names the order.
 *
 * These are business facts, so they live in configuration rather than in a
 * component or a parser. Changing how the business words its documents changes
 * this file and nothing else.
 *
 * Both phrases are matched as substrings of a document's own description and of
 * its line-item descriptions. Nothing is inferred from a payment type, a client
 * name or an amount.
 */

export type SalesOrigin = 'external' | 'shopify' | 'unclassified';

export const SALES_ORIGIN_PHRASES = {
  /** "storage boxes" — a direct sale, raised by hand, that the store never saw. */
  external: 'קופסאות אחסון',
  /** "order number" — raised from a Shopify order, which Shopify already reports. */
  shopify: 'הזמנה מספר',
} as const;
