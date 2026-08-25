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
export const ORDERS_SUMMARY_QUERY = `
  query IceboxOrdersSummary($first: Int!, $after: String, $query: String!) {
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
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        customer { id displayName }
      }
    }
  }
`;

/** Orders with their line items — for the Sales and Products screens. */
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
        subtotalPriceSet { shopMoney { amount currencyCode } }
        totalDiscountsSet { shopMoney { amount currencyCode } }
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
            discountedTotalSet { shopMoney { amount currencyCode } }
            product { id }
            variant { id title }
          }
        }
      }
    }
  }
`;
