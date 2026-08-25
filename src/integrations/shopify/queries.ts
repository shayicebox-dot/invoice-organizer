/**
 * GraphQL documents for the Shopify Admin API.
 *
 * Every document here was validated against the live Admin schema. Keep them
 * in this file rather than inline at call sites, so a version upgrade has one
 * place to review.
 *
 * Money is always requested as `shopMoney`: figures are reported in the store's
 * own currency, never the customer's presentment currency, so amounts across
 * orders are directly comparable.
 */

/** Store identity and settings — the cheapest possible connectivity check. */
export const SHOP_QUERY = `
  query IceboxConnectionTest {
    shop {
      id
      name
      myshopifyDomain
      currencyCode
      ianaTimezone
      plan { publicDisplayName }
    }
  }
`;

/** Scopes actually granted to this access token. */
export const ACCESS_SCOPES_QUERY = `
  query IceboxAccessScopes {
    currentAppInstallation {
      accessScopes { handle }
    }
  }
`;

/**
 * Orders without line items — everything the dashboard totals need.
 *
 * Deliberately separate from the detailed query: line items multiply the
 * query's cost against Shopify's rate limit, and the KPI row does not use them.
 */
/**
 * Refunds, for reconciling to Shopify's "sales reversals".
 *
 * Queried over orders **updated** since the window opened rather than orders
 * placed in it, because a return is very often processed against an order
 * placed weeks earlier. `refundLineItems.subtotalSet` is the product value
 * returned, excluding tax and shipping — which is what Shopify Analytics counts
 * as a sales reversal, and is not the same as the order's `totalRefundedSet`.
 */
export const ORDER_REFUNDS_QUERY = `
  query IceboxOrderRefunds($first: Int!, $after: String, $query: String!, $refunds: Int!, $refundLines: Int!) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        test
        refunds(first: $refunds) {
          id
          createdAt
          totalRefundedSet { shopMoney { amount currencyCode } }
          refundLineItems(first: $refundLines) {
            pageInfo { hasNextPage }
            nodes {
              quantity
              subtotalSet { shopMoney { amount currencyCode } }
              totalTaxSet { shopMoney { amount currencyCode } }
              lineItem { id variant { id } }
            }
          }
        }
      }
    }
  }
`;

/**
 * Orders with their line items.
 *
 * Line items are always requested, because gross sales can only be built from
 * them. `Order.subtotalPriceSet` cannot be used: Shopify documents it as the
 * total "after discounts and returns", so it shrinks when an item is returned.
 * Reconstructing gross from it and then subtracting the period's returns
 * deducts the same return twice.
 *
 * `originalTotalSet` is "the total price of the line item **when the order was
 * created**", and `quantity` "includes refunded and removed units" — neither
 * moves when goods come back, which is exactly what a gross sales figure needs.
 *
 * `discountAllocations` carries every discount attached to the line, including
 * order-level and code-based ones. `discountedTotalSet` deliberately excludes
 * both, so deriving discounts from it would understate them.
 */
export const ORDERS_DETAILED_QUERY = `
  query IceboxOrdersDetailed($first: Int!, $after: String, $query: String!, $lineItems: Int!) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        processedAt
        cancelledAt
        test
        taxesIncluded
        displayFinancialStatus
        totalRefundedSet { shopMoney { amount currencyCode } }
        customer { id displayName }
        lineItems(first: $lineItems) {
          pageInfo { hasNextPage }
          nodes {
            id
            name
            sku
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            originalTotalSet { shopMoney { amount currencyCode } }
            discountedTotalSet { shopMoney { amount currencyCode } }
            discountAllocations {
              allocatedAmountSet { shopMoney { amount currencyCode } }
            }
            product { id }
            variant { id title }
          }
        }
      }
    }
  }
`;
