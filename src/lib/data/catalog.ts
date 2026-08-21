/**
 * Static reference data for the demo tenant: the organization, its stores,
 * the product catalog with cost history, recurring expenses and the provider
 * connection registry.
 *
 * These stand in for rows that a real deployment would read from Supabase.
 */

import { fromMajor } from "../money";
import type {
  Connection,
  Expense,
  Organization,
  Product,
  ProductCost,
  ProviderCategory,
  ProviderId,
  Store,
  User,
} from "../types";
import { stableId } from "./random";

/**
 * The tenant, with no invented brand.
 *
 * The display name is replaced with the connected Shopify shop's own name at
 * read time — see `getOrganization` and `getStores`. A placeholder that reads
 * like a real company gets mistaken for one, which is exactly what happened
 * when three fictional stores were rendering in the store selector and on
 * every order row.
 */
export const ORGANIZATION: Organization = {
  id: stableId("org:primary"),
  name: "Connected store",
  slug: "primary",
  baseCurrency: "USD",
  timezone: "America/New_York",
  createdAt: "2023-02-14T09:00:00.000Z",
};

export const CURRENT_USER: User = {
  id: stableId("user:owner"),
  email: "",
  fullName: "Store owner",
  createdAt: "2023-02-14T09:00:00.000Z",
};

/**
 * Per-store demand profile. `dailyGrossTarget` is the average gross sales the
 * generator aims for before weekday, trend and noise factors are applied, and
 * the remaining ratios shape that store's cost structure.
 */
export interface StoreProfile {
  store: Store;
  /**
   * Key into `PRODUCT_SEEDS`. Explicit rather than derived from the domain,
   * which is a live Shopify value and carries no relationship to a fixture.
   */
  catalogKey: string;
  /** Average gross sales per day, in major units. */
  dailyGrossTarget: number;
  /** Average order value, in major units. */
  averageOrderValue: number;
  /** COGS as a share of gross sales. */
  cogsRatio: number;
  /** Average daily Meta Ads spend, in major units. */
  metaDailySpend: number;
  /** Average daily Google Ads spend, in major units. */
  googleDailySpend: number;
  /** Average daily email/SMS platform cost, in major units. */
  emailDailySpend: number;
  /** Share of orders that use a discount code. */
  discountRate: number;
  /** Refunds as a share of gross sales. */
  refundRate: number;
  /** Compound daily growth applied across the generated window. */
  dailyGrowth: number;
}

function store(
  key: string,
  name: string,
  domain: string,
  createdAt: string,
  isActive = true,
): Store {
  return {
    id: stableId(`store:${key}`),
    organizationId: ORGANIZATION.id,
    name,
    platform: "shopify",
    domain,
    currency: "USD",
    timezone: "America/New_York",
    isActive,
    createdAt,
  };
}

/**
 * One profile, for the one connected store.
 *
 * These ratios shape the generated series that still stands in for cost lines
 * with no real source configured. Its name and domain are placeholders,
 * overwritten with the live shop's own at read time — nothing here should ever
 * reach the screen as though it were a real business.
 */
export const STORE_PROFILES: StoreProfile[] = [
  {
    store: store("primary", "Connected store", "", "2023-02-20T09:00:00.000Z"),
    catalogKey: "primary",
    dailyGrossTarget: 9_100,
    averageOrderValue: 86,
    cogsRatio: 0.24,
    metaDailySpend: 2_110,
    googleDailySpend: 550,
    emailDailySpend: 95,
    discountRate: 0.34,
    refundRate: 0.014,
    dailyGrowth: 0.0016,
  },
];

export const STORES: Store[] = STORE_PROFILES.map((profile) => profile.store);

export function getStore(storeId: string): Store | undefined {
  return STORES.find((entry) => entry.id === storeId);
}

export function getStoreProfile(storeId: string): StoreProfile | undefined {
  return STORE_PROFILES.find((profile) => profile.store.id === storeId);
}

interface ProductSeed {
  title: string;
  sku: string;
  category: string;
  /** Retail price in major units. */
  price: number;
  /** Unit cost in major units, current. */
  cost: number;
  /** Earlier unit cost, superseded on `costChangedOn`. */
  previousCost: number;
  /** Relative share of that store's order lines. */
  weight: number;
}

const PRODUCT_SEEDS: Record<string, ProductSeed[]> = {
  "primary": [
    { title: "Daily Greens Powder — 30 Servings", sku: "NB-GRN-30", category: "Supplements", price: 48, cost: 11.4, previousCost: 10.8, weight: 26 },
    { title: "Magnesium Complex — 60ct", sku: "NB-MAG-60", category: "Supplements", price: 34, cost: 7.9, previousCost: 7.4, weight: 21 },
    { title: "Electrolyte Sticks — 24 Pack", sku: "NB-ELE-24", category: "Hydration", price: 39, cost: 9.6, previousCost: 9.6, weight: 18 },
    { title: "Collagen Peptides — 16oz", sku: "NB-COL-16", category: "Supplements", price: 56, cost: 14.2, previousCost: 13.5, weight: 14 },
    { title: "Sleep Blend — 30ct", sku: "NB-SLP-30", category: "Supplements", price: 42, cost: 10.1, previousCost: 10.1, weight: 11 },
    { title: "Starter Bundle", sku: "NB-BND-01", category: "Bundles", price: 129, cost: 32.5, previousCost: 30.9, weight: 10 },
  ],
};

export interface CatalogEntry {
  product: Product;
  costs: ProductCost[];
  weight: number;
}

/** Date the second cost record takes effect, mid-window for every catalog. */
const COST_CHANGE_DATE = "2025-01-01";

function buildCatalog(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const profile of STORE_PROFILES) {
    for (const seed of PRODUCT_SEEDS[profile.catalogKey] ?? []) {
      const productId = stableId(`product:${seed.sku}`);
      const product: Product = {
        id: productId,
        organizationId: ORGANIZATION.id,
        storeId: profile.store.id,
        title: seed.title,
        sku: seed.sku,
        category: seed.category,
        price: fromMajor(seed.price),
        currency: "USD",
        isActive: true,
      };

      const costs: ProductCost[] = [
        {
          id: stableId(`cost:${seed.sku}:current`),
          organizationId: ORGANIZATION.id,
          productId,
          unitCost: fromMajor(seed.cost),
          currency: "USD",
          effectiveFrom: COST_CHANGE_DATE,
          effectiveTo: null,
        },
      ];

      if (seed.previousCost !== seed.cost) {
        costs.unshift({
          id: stableId(`cost:${seed.sku}:previous`),
          organizationId: ORGANIZATION.id,
          productId,
          unitCost: fromMajor(seed.previousCost),
          currency: "USD",
          effectiveFrom: "2023-01-01",
          effectiveTo: COST_CHANGE_DATE,
        });
      }

      entries.push({ product, costs, weight: seed.weight });
    }
  }

  return entries;
}

export const CATALOG: CatalogEntry[] = buildCatalog();

export const PRODUCTS: Product[] = CATALOG.map((entry) => entry.product);

export const PRODUCT_COSTS: ProductCost[] = CATALOG.flatMap((entry) => entry.costs);

/** Unit cost that applied on a given date. */
export function unitCostOn(entry: CatalogEntry, date: string) {
  const applicable = entry.costs.filter(
    (cost) => cost.effectiveFrom <= date && (cost.effectiveTo === null || date < cost.effectiveTo),
  );
  const chosen = applicable.at(-1) ?? entry.costs.at(-1);
  if (!chosen) throw new Error(`No cost record for product ${entry.product.sku}`);
  return chosen.unitCost;
}

export function catalogForStore(storeId: string): CatalogEntry[] {
  return CATALOG.filter((entry) => entry.product.storeId === storeId);
}

interface FixedExpenseSeed {
  name: string;
  category: Expense["category"];
  /** Monthly amount in major units. */
  monthly: number;
  /** `null` spreads the cost across every store, pro-rata by net sales. */
  storeKey: string | null;
}

const FIXED_EXPENSE_SEEDS: FixedExpenseSeed[] = [
  { name: "Team payroll", category: "payroll", monthly: 21_400, storeKey: null },
  { name: "Warehouse lease", category: "rent", monthly: 4_500, storeKey: null },
  { name: "Software stack", category: "software", monthly: 1_850, storeKey: null },
  { name: "Bookkeeping & legal", category: "professional_services", monthly: 1_250, storeKey: null },
  { name: "3PL monthly minimum", category: "professional_services", monthly: 900, storeKey: "primary" },
];

export const FIXED_EXPENSES: Expense[] = FIXED_EXPENSE_SEEDS.map((seed) => ({
  id: stableId(`expense:fixed:${seed.name}`),
  organizationId: ORGANIZATION.id,
  storeId: seed.storeKey ? stableId(`store:${seed.storeKey}`) : null,
  name: seed.name,
  type: "fixed" as const,
  category: seed.category,
  recurrence: "monthly" as const,
  amount: fromMajor(seed.monthly),
  currency: "USD" as const,
  date: "2024-01-01",
  endDate: null,
}));

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  category: ProviderCategory;
  description: string;
  /** Two-letter mark shown in the connection card. */
  initials: string;
  /** Brand-tinted accent for the card mark. */
  accent: string;
}

export const PROVIDER_CATEGORY_LABELS: Record<ProviderCategory, string> = {
  commerce: "Commerce",
  advertising: "Advertising",
  email_sms: "Email & SMS",
  fulfillment: "Fulfillment",
  payments: "Payments",
};

export const PROVIDER_CATEGORY_DESCRIPTIONS: Record<ProviderCategory, string> = {
  commerce: "The source of truth for orders, refunds and revenue.",
  advertising: "Paid channels. Spend flows into the P&L as marketing cost.",
  email_sms: "Owned channels. Platform cost flows into the P&L as marketing cost.",
  fulfillment: "Pick, pack and shipping costs per order.",
  payments: "Processing fees deducted from every settlement.",
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "shopify",
    name: "Shopify",
    category: "commerce",
    description: "Orders, refunds, discounts and payouts. The revenue source of truth.",
    initials: "SH",
    accent: "#5E8E3E",
  },
  {
    id: "meta_ads",
    name: "Meta Ads",
    category: "advertising",
    description: "Facebook and Instagram ad spend, imported daily per account.",
    initials: "MA",
    accent: "#0866FF",
  },
  {
    id: "google_ads",
    name: "Google Ads",
    category: "advertising",
    description: "Search, Shopping and PMax spend, imported daily per account.",
    initials: "GA",
    accent: "#1A73E8",
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    category: "email_sms",
    description: "Email and SMS platform cost, plus campaign attribution.",
    initials: "KL",
    accent: "#1F2937",
  },
  {
    id: "omnisend",
    name: "Omnisend",
    category: "email_sms",
    description: "Email and SMS platform cost for stores running Omnisend.",
    initials: "OM",
    accent: "#3B4EE0",
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    category: "email_sms",
    description: "Email platform cost and campaign performance.",
    initials: "MC",
    accent: "#B8861A",
  },
  {
    id: "shipbob",
    name: "ShipBob",
    category: "fulfillment",
    description: "Per-order pick, pack and postage costs from your 3PL.",
    initials: "SB",
    accent: "#0F766E",
  },
  {
    id: "shipstation",
    name: "ShipStation",
    category: "fulfillment",
    description: "Label costs and carrier invoices for self-fulfilled orders.",
    initials: "SS",
    accent: "#B45309",
  },
  {
    id: "shopify_payments",
    name: "Shopify Payments",
    category: "payments",
    description: "Processing fees and payout reconciliation.",
    initials: "SP",
    accent: "#5E8E3E",
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "payments",
    description: "Processing fees for non-Shopify checkout flows.",
    initials: "ST",
    accent: "#635BFF",
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "payments",
    description: "Transaction fees and dispute costs.",
    initials: "PP",
    accent: "#003087",
  },
];

/**
 * Demo connection state. Nothing here holds a credential — `credentialRef`
 * points at a secret held outside the application database.
 */
const CONNECTION_SEEDS: Array<{
  provider: ProviderId;
  storeKey: string | null;
  status: Connection["status"];
  accountLabel: string | null;
  lastSyncedAt: string | null;
}> = [
  { provider: "shopify", storeKey: "primary", status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "meta_ads", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "google_ads", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "klaviyo", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "omnisend", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "mailchimp", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "shipbob", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "shipstation", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "shopify_payments", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "stripe", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
  { provider: "paypal", storeKey: null, status: "disconnected", accountLabel: null, lastSyncedAt: null },
];

export const CONNECTIONS: Connection[] = CONNECTION_SEEDS.map((seed) => {
  const definition = PROVIDERS.find((provider) => provider.id === seed.provider);
  if (!definition) throw new Error(`Unknown provider in connection seed: ${seed.provider}`);
  return {
    id: stableId(`connection:${seed.provider}`),
    organizationId: ORGANIZATION.id,
    storeId: seed.storeKey ? stableId(`store:${seed.storeKey}`) : null,
    provider: seed.provider,
    category: definition.category,
    status: seed.status,
    accountLabel: seed.accountLabel,
    lastSyncedAt: seed.lastSyncedAt,
    credentialRef: null,
    createdAt: ORGANIZATION.createdAt,
  };
});
