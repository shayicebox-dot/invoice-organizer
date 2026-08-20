/**
 * Domain entities.
 *
 * These mirror the proposed Postgres/Supabase tables documented in
 * `docs/DATA_MODEL.md` and defined in `docs/schema.sql`, one interface per
 * table. The mock data layer produces these shapes, so replacing it with real
 * Supabase queries is a swap at the data-access boundary and nothing above it
 * changes.
 *
 * Money fields are `Money` (integer minor units). Dates are ISO `YYYY-MM-DD`
 * strings in the store's reporting timezone; timestamps are ISO-8601.
 */

import type { CurrencyCode, Money } from "./money";

export type UUID = string;
/** ISO calendar date, `YYYY-MM-DD`. */
export type ISODate = string;

/** Anything that belongs to a tenant and a point in time carries this. */
export interface FinancialRecordBase {
  organizationId: UUID;
  storeId: UUID;
  date: ISODate;
  currency: CurrencyCode;
}

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  /** Currency the roll-up is reported in. */
  baseCurrency: CurrencyCode;
  timezone: string;
  createdAt: string;
}

export type OrganizationRole = "owner" | "admin" | "analyst" | "viewer";

export interface User {
  id: UUID;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface OrganizationMember {
  organizationId: UUID;
  userId: UUID;
  role: OrganizationRole;
}

export type StorePlatform = "shopify" | "woocommerce" | "custom";

export interface Store {
  id: UUID;
  organizationId: UUID;
  name: string;
  platform: StorePlatform;
  domain: string;
  currency: CurrencyCode;
  timezone: string;
  isActive: boolean;
  createdAt: string;
}

export type ProviderCategory =
  | "commerce"
  | "advertising"
  | "email_sms"
  | "fulfillment"
  | "payments";

export type ProviderId =
  | "shopify"
  | "meta_ads"
  | "google_ads"
  | "klaviyo"
  | "omnisend"
  | "mailchimp"
  | "shipbob"
  | "shipstation"
  | "stripe"
  | "shopify_payments"
  | "paypal";

export type ConnectionStatus = "connected" | "disconnected" | "error" | "syncing";

/**
 * A link between a store and an external provider. Credentials are never held
 * here — the row references a secret stored outside the application database.
 */
export interface Connection {
  id: UUID;
  organizationId: UUID;
  storeId: UUID | null;
  provider: ProviderId;
  category: ProviderCategory;
  status: ConnectionStatus;
  accountLabel: string | null;
  lastSyncedAt: string | null;
  /** Opaque reference into the secret store. Never a credential itself. */
  credentialRef: string | null;
  createdAt: string;
}

export type OrderFinancialStatus = "paid" | "partially_refunded" | "refunded" | "pending";

export interface Order {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  /** Identifier in the source platform, e.g. Shopify order id. */
  externalId: string;
  orderNumber: string;
  date: ISODate;
  processedAt: string;
  currency: CurrencyCode;
  customerName: string;
  /** Sum of line prices before discounts. */
  grossSales: Money;
  discounts: Money;
  /** What the customer paid for shipping. Included in gross sales. */
  shippingCharged: Money;
  taxes: Money;
  /** What the merchant actually paid to ship and fulfil. */
  shippingCost: Money;
  paymentFees: Money;
  financialStatus: OrderFinancialStatus;
  channel: "online_store" | "pos" | "wholesale";
  itemCount: number;
}

export interface OrderItem {
  id: UUID;
  organizationId: UUID;
  orderId: UUID;
  productId: UUID;
  variantTitle: string;
  quantity: number;
  unitPrice: Money;
  unitCost: Money;
  discount: Money;
}

export type RefundReason = "customer_return" | "damaged" | "wrong_item" | "cancelled" | "other";

export interface Refund {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  orderId: UUID;
  date: ISODate;
  currency: CurrencyCode;
  amount: Money;
  /** COGS recovered when the goods came back in sellable condition. */
  restockedCogs: Money;
  reason: RefundReason;
}

export interface Product {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  title: string;
  sku: string;
  category: string;
  price: Money;
  currency: CurrencyCode;
  isActive: boolean;
}

/**
 * Unit cost with validity window, so historical orders keep the cost that
 * applied on the day they were placed.
 */
export interface ProductCost {
  id: UUID;
  organizationId: UUID;
  productId: UUID;
  unitCost: Money;
  currency: CurrencyCode;
  effectiveFrom: ISODate;
  effectiveTo: ISODate | null;
}

export type MarketingChannel = "meta_ads" | "google_ads" | "klaviyo" | "omnisend" | "mailchimp";

/** One row per store, per channel, per day. */
export interface MarketingSpendDaily extends FinancialRecordBase {
  id: UUID;
  channel: MarketingChannel;
  spend: Money;
  impressions: number;
  clicks: number;
  /** Platform-reported conversions. Attribution only — never counted as revenue. */
  attributedConversions: number;
  /** Platform-reported revenue. Attribution only — never counted as revenue. */
  attributedRevenue: Money;
}

export type ExpenseType = "fixed" | "variable";

export type ExpenseCategory =
  | "software"
  | "payroll"
  | "rent"
  | "professional_services"
  | "packaging"
  | "customer_support"
  | "chargebacks"
  | "other";

export type ExpenseRecurrence = "one_off" | "daily" | "weekly" | "monthly" | "annual";

/**
 * Fixed expenses are recorded once with a recurrence and allocated evenly
 * across the days of the period they cover. Variable expenses are dated.
 */
export interface Expense {
  id: UUID;
  organizationId: UUID;
  /** `null` means the expense is shared across every store in the org. */
  storeId: UUID | null;
  name: string;
  type: ExpenseType;
  category: ExpenseCategory;
  recurrence: ExpenseRecurrence;
  amount: Money;
  currency: CurrencyCode;
  /** Start of the period the amount covers. */
  date: ISODate;
  endDate: ISODate | null;
}

/**
 * Materialized daily roll-up. The application reads this table; a scheduled job
 * rebuilds it from orders, returns, marketing spend and expenses.
 */
export interface DailyFinancialsRow extends FinancialRecordBase {
  id: UUID;
  grossSales: Money;
  discounts: Money;
  salesReversals: Money;
  /** Reported alongside revenue, never part of it. */
  taxes: Money;
  cogs: Money;
  shipping: Money;
  paymentFees: Money;
  metaAdSpend: Money;
  googleAdSpend: Money;
  emailSpend: Money;
  variableExpenses: Money;
  fixedExpenses: Money;
  orders: number;
  unitsSold: number;
  computedAt: string;
}
