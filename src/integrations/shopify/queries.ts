/**
 * GraphQL documents for the Shopify Admin API.
 *
 * Every document here was validated against the live Admin schema. Keep them
 * in this file rather than inline at call sites, so a version upgrade has one
 * place to review.
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
 * One page of orders in a period.
 *
 * Money is requested as `shopMoney` throughout: figures are reported in the
 * store's own currency, never the customer's presentment currency, so amounts
 * across orders are directly comparable.
 */
export const ORDERS_QUERY = `
  query IceboxOrders($first: Int!, $after: String, $query: String!, $lineItems: Int!) {
    orders(first: $first, after: $after, query: $query, sortKey: PROCESSED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        processedAt
        cancelledAt
        test
        displayFinancialStatus
        currencyCode
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        totalPriceSet { shopMoney { amount currencyCode } }
        netPaymentSet { shopMoney { amount currencyCode } }
        customer { id numberOfOrders }
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
            product { id title }
            variant { id sku }
          }
        }
      }
    }
  }
`;
