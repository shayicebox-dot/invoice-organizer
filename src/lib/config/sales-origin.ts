/**
 * How ICEBOX tells an off-Shopify sale from a Shopify one in Morning.
 *
 * The business writes its Morning documents to a consistent rule, and that rule
 * — not a payment type — is what identifies where a sale came from. A document
 * raised from a Shopify order names the order; a document raised by hand for a
 * direct sale does not.
 *
 * These are business facts, so they live in configuration rather than in a
 * component or a parser. Changing how the business words its documents changes
 * this file and nothing else.
 *
 * Matched against a document's own description and its line-item descriptions.
 * Nothing is inferred from a payment type, a client name or an amount.
 */

export type SalesOrigin = 'external' | 'shopify' | 'unclassified';

/**
 * A Shopify order reference: "order" followed by a number.
 *
 * Deliberately looser than the phrase this started as. Real documents write the
 * reference several ways — `הזמנה 2242`, `הזמנה מספר 2242`, `הזמנה #2242` — and
 * requiring the word "מספר" missed most of them, which is how Shopify sales
 * were being counted as direct ones. The word "מספר", any punctuation and any
 * spacing are therefore optional; the digits are not, so the word "order" on
 * its own never marks a document.
 *
 * A capture group holds the order number, so the marker can be shown as it was
 * written rather than described.
 */
export const SHOPIFY_ORDER_MARKER = /הזמנה(?:\s*מספר)?\s*[#№:.–-]?\s*(\d+)/u;

/**
 * "storage boxes" — what a direct sale is called when it is written by hand.
 *
 * Only consulted once no order reference has been found anywhere, because a
 * Shopify document names the product too: `קופסאות אחסון לנעליים` appears on
 * documents raised from orders as readily as on direct sales, so this phrase
 * alone proves nothing about origin.
 */
export const EXTERNAL_SALE_PHRASE = 'קופסאות אחסון';
