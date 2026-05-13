import type { StoreConfig } from "./env";

const API_VERSION = "2024-10";

type GqlResponse<T> = { data?: T; errors?: { message: string }[] };

async function gql<T>(
  store: StoreConfig,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const url = `https://${store.domain}/admin/api/${API_VERSION}/graphql.json`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": store.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Shopify ${store.slug} ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as GqlResponse<T>;
  if (j.errors?.length) throw new Error(`Shopify GraphQL: ${j.errors.map((e) => e.message).join("; ")}`);
  if (!j.data) throw new Error("Shopify: empty response");
  return j.data;
}

// ─── Orders ─────────────────────────────────────────────────────────────────
const ORDERS_QUERY = /* GraphQL */ `
  query Orders($cursor: String, $query: String) {
    orders(first: 100, after: $cursor, query: $query, sortKey: PROCESSED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        processedAt
        displayFinancialStatus
        displayFulfillmentStatus
        sourceName
        customerJourneySummary { firstVisit { landingPageHtml referrerUrl utmParameters { source medium campaign content } } }
        customer { id email firstName lastName numberOfOrders amountSpent { amount } }
        currentSubtotalPriceSet { shopMoney { amount currencyCode } }
        totalShippingPriceSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        currentTotalDiscountsSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        transactions { gateway fees { amount { amount currencyCode } } }
        lineItems(first: 50) {
          nodes {
            id
            sku
            quantity
            title
            originalUnitPriceSet { shopMoney { amount } }
            discountedUnitPriceSet { shopMoney { amount } }
            variant { id sku product { id title } }
          }
        }
      }
    }
  }
`;

export type ShopifyOrder = {
  id: string;
  name: string;
  processedAt: string;
  displayFinancialStatus: string;
  displayFulfillmentStatus: string;
  sourceName?: string;
  customerJourneySummary?: {
    firstVisit?: {
      landingPageHtml?: string;
      referrerUrl?: string;
      utmParameters?: { source?: string; medium?: string; campaign?: string; content?: string };
    };
  };
  customer?: {
    id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    numberOfOrders?: number;
    amountSpent?: { amount: string };
  };
  currentSubtotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalShippingPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalTaxSet: { shopMoney: { amount: string; currencyCode: string } };
  currentTotalDiscountsSet: { shopMoney: { amount: string; currencyCode: string } };
  currentTotalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  totalRefundedSet: { shopMoney: { amount: string; currencyCode: string } };
  transactions: { gateway: string; fees: { amount: { amount: string; currencyCode: string } }[] }[];
  lineItems: { nodes: ShopifyLine[] };
};

export type ShopifyLine = {
  id: string;
  sku?: string;
  quantity: number;
  title: string;
  originalUnitPriceSet: { shopMoney: { amount: string } };
  discountedUnitPriceSet: { shopMoney: { amount: string } };
  variant?: { id: string; sku?: string; product?: { id: string; title: string } };
};

export async function* iterOrders(store: StoreConfig, sinceISO: string) {
  let cursor: string | null = null;
  const queryStr = `processed_at:>=${sinceISO}`;
  while (true) {
    const data: { orders: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ShopifyOrder[] } } =
      await gql(store, ORDERS_QUERY, { cursor, query: queryStr });
    for (const o of data.orders.nodes) yield o;
    if (!data.orders.pageInfo.hasNextPage) break;
    cursor = data.orders.pageInfo.endCursor;
  }
}

// ─── Products ───────────────────────────────────────────────────────────────
const PRODUCTS_QUERY = /* GraphQL */ `
  query Products($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        productType
        vendor
        status
        tags
        featuredImage { url }
        variants(first: 50) {
          nodes {
            id
            sku
            title
            price
            compareAtPrice
            inventoryQuantity
            weight
          }
        }
      }
    }
  }
`;

export type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  productType?: string;
  vendor?: string;
  status: string;
  tags: string[];
  featuredImage?: { url: string };
  variants: { nodes: ShopifyVariant[] };
};

export type ShopifyVariant = {
  id: string;
  sku?: string;
  title: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  weight?: number;
};

export async function* iterProducts(store: StoreConfig) {
  let cursor: string | null = null;
  while (true) {
    const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: ShopifyProduct[] } } =
      await gql(store, PRODUCTS_QUERY, { cursor });
    for (const p of data.products.nodes) yield p;
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
}

// Heuristic: identify pack/bundle from title or tags. Returns bundle size or null.
export function detectBundleSize(title: string, tags: string[] = []): number | null {
  const hay = `${title} ${tags.join(" ")}`.toLowerCase();
  const m = hay.match(/(\d{1,3})\s*[- ]?\s*(pack|pk|set|bundle|x)\b/);
  if (m) return parseInt(m[1], 10);
  return null;
}
