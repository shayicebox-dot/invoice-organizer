/**
 * Mock dataset generator.
 *
 * Produces the same record shapes a Supabase-backed deployment would return —
 * orders, order items, refunds, daily marketing spend and expenses — and then
 * rolls them into `DailyFinancials`. Nothing in the UI reads a hardcoded total:
 * every number on screen is computed from these records through
 * `lib/finance.ts`.
 */

import type { DailyFinancials } from "../finance";
import { netSales } from "../finance";
import { type Money, ZERO, add, fromMajor, fromMinor, multiply, scale, subtract, sum } from "../money";
import { addDays, daysInMonth, enumerateDates, parseISODate } from "../date-range";
import type {
  Expense,
  ISODate,
  MarketingChannel,
  MarketingSpendDaily,
  Order,
  OrderItem,
  Refund,
  RefundReason,
} from "../types";
import {
  type CatalogEntry,
  type StoreProfile,
  FIXED_EXPENSES,
  ORGANIZATION,
  STORE_PROFILES,
  catalogForStore,
  unitCostOn,
} from "./catalog";
import { type Rng, createRng, stableId } from "./random";

/** How much history the demo dataset covers. */
export const HISTORY_DAYS = 120;

/** Processing: 2.9% of the captured amount plus a flat 30¢ per transaction. */
const PAYMENT_RATE = 0.029;
const PAYMENT_FIXED_FEE = fromMajor(0.3);

/** Merchant-side shipping: a base handling charge plus a per-unit cost. */
const SHIP_BASE = fromMajor(6.5);
const SHIP_PER_UNIT = fromMajor(2.4);

/** Free shipping above this cart value; below it the customer pays. */
const FREE_SHIPPING_THRESHOLD = fromMajor(60);
const SHIPPING_CHARGED = fromMajor(6.95);

/** Sales tax rate, collected and remitted. Excluded from revenue. */
const TAX_RATE = 0.071;

const PACKAGING_PER_ORDER = fromMajor(0.55);

const SUPPORT_TOOLING_DAILY: Record<number, number> = { 0: 30, 1: 20, 2: 12 };

/** Sunday-first demand multipliers. */
const WEEKDAY_FACTORS = [0.88, 1.06, 1.08, 1.05, 1.02, 0.98, 0.9];

const DISCOUNT_TIERS = [0.1, 0.15, 0.2];

const REFUND_REASONS: RefundReason[] = [
  "customer_return",
  "customer_return",
  "damaged",
  "wrong_item",
  "cancelled",
  "other",
];

export interface MockDataset {
  /** Newest first. */
  orders: Order[];
  orderItems: OrderItem[];
  refunds: Refund[];
  marketingSpend: MarketingSpendDaily[];
  variableExpenses: Expense[];
  /** Store id -> daily records, oldest first. */
  dailyByStore: Map<string, DailyFinancials[]>;
  dates: ISODate[];
  generatedFor: ISODate;
}

interface DayAccumulator {
  grossSales: Money;
  discounts: Money;
  salesReversals: Money;
  taxes: Money;
  cogs: Money;
  shipping: Money;
  paymentFees: Money;
  variableExpenses: Money;
  orders: number;
  unitsSold: number;
}

function emptyAccumulator(): DayAccumulator {
  return {
    grossSales: ZERO,
    discounts: ZERO,
    salesReversals: ZERO,
    taxes: ZERO,
    cogs: ZERO,
    shipping: ZERO,
    paymentFees: ZERO,
    variableExpenses: ZERO,
    orders: 0,
    unitsSold: 0,
  };
}

function weekdayFactor(date: ISODate): number {
  return WEEKDAY_FACTORS[parseISODate(date).getUTCDay()];
}

/** Slow seasonal swell, so the trend chart is not a flat noisy line. */
function seasonalFactor(dayIndex: number): number {
  return 1 + 0.07 * Math.sin((dayIndex / HISTORY_DAYS) * Math.PI * 2.2);
}

function weightedPick(entries: readonly CatalogEntry[], rng: Rng): CatalogEntry {
  const total = entries.reduce((acc, entry) => acc + entry.weight, 0);
  let threshold = rng.next() * total;
  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry;
  }
  return entries[entries.length - 1];
}

interface GeneratedOrder {
  order: Order;
  items: OrderItem[];
  cogs: Money;
  /** Net of discount, what a refund can draw against. */
  refundable: Money;
}

function generateOrder(
  profile: StoreProfile,
  catalog: CatalogEntry[],
  date: ISODate,
  sequence: number,
  rng: Rng,
): GeneratedOrder {
  const storeId = profile.store.id;
  const orderId = stableId(`order:${storeId}:${date}:${sequence}`);
  const targetValue = fromMajor(profile.averageOrderValue * rng.jitter(0.5));

  const items: OrderItem[] = [];
  let subtotal = ZERO;
  let cogs = ZERO;
  let units = 0;

  while (subtotal < targetValue && items.length < 4) {
    const entry = weightedPick(catalog, rng);
    const quantity = rng.chance(0.22) ? 2 : 1;
    const unitCost = unitCostOn(entry, date);
    const lineTotal = multiply(entry.product.price, quantity);

    items.push({
      id: stableId(`item:${orderId}:${items.length}`),
      organizationId: ORGANIZATION.id,
      orderId,
      productId: entry.product.id,
      variantTitle: "Default",
      quantity,
      unitPrice: entry.product.price,
      unitCost,
      discount: ZERO,
    });

    subtotal = add(subtotal, lineTotal);
    cogs = add(cogs, multiply(unitCost, quantity));
    units += quantity;
  }

  const discount = rng.chance(profile.discountRate)
    ? scale(subtotal, rng.pick(DISCOUNT_TIERS))
    : ZERO;
  const shippingCharged = subtotal < FREE_SHIPPING_THRESHOLD ? SHIPPING_CHARGED : ZERO;
  const capturedAmount = add(subtract(subtotal, discount), shippingCharged);
  const paymentFees = add(scale(capturedAmount, PAYMENT_RATE), PAYMENT_FIXED_FEE);
  const shippingCost = add(
    scale(SHIP_BASE, rng.jitter(0.12)),
    multiply(SHIP_PER_UNIT, units),
  );

  const hour = rng.int(0, 23);
  const minute = rng.int(0, 59);

  const order: Order = {
    id: orderId,
    organizationId: ORGANIZATION.id,
    storeId,
    externalId: `gid://shopify/Order/${5_100_000_000 + (sequence + 1) * 7 + Math.abs(hashOf(orderId))}`,
    orderNumber: `#${1000 + sequence + parseInt(date.replaceAll("-", "").slice(4), 10) * 3}`,
    date,
    processedAt: `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`,
    currency: profile.store.currency,
    // Never invented. Order rows come from Shopify, where the real name is.
    customerName: "",
    grossSales: add(subtotal, shippingCharged),
    discounts: discount,
    shippingCharged,
    taxes: scale(capturedAmount, TAX_RATE),
    shippingCost,
    paymentFees,
    financialStatus: "paid",
    channel: rng.chance(0.04) ? "wholesale" : "online_store",
    itemCount: units,
  };

  return { order, items, cogs, refundable: subtract(subtotal, discount) };
}

function hashOf(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash % 100_000;
}

function marketingRow(
  profile: StoreProfile,
  date: ISODate,
  channel: MarketingChannel,
  spend: Money,
  rng: Rng,
): MarketingSpendDaily {
  const isPaidSocial = channel === "meta_ads";
  const cpm = rng.between(isPaidSocial ? 14 : 22, isPaidSocial ? 24 : 38);
  const impressions = Math.round((spend / 100 / cpm) * 1000);
  const ctr = rng.between(0.009, 0.021);
  const clicks = Math.round(impressions * ctr);
  const conversionRate = rng.between(0.022, 0.045);
  const attributedConversions = Math.round(clicks * conversionRate);
  const attributedRevenue = fromMajor(
    attributedConversions * profile.averageOrderValue * rng.jitter(0.18),
  );

  return {
    id: stableId(`spend:${profile.store.id}:${date}:${channel}`),
    organizationId: ORGANIZATION.id,
    storeId: profile.store.id,
    date,
    currency: profile.store.currency,
    channel,
    spend,
    impressions,
    clicks,
    attributedConversions,
    attributedRevenue,
  };
}

/**
 * Split a daily amount across stores in proportion to their net sales, with
 * leftover minor units handed to the largest share so the parts always sum
 * back to the original amount.
 */
function allocateProRata(amount: Money, weights: readonly number[]): Money[] {
  const total = weights.reduce((acc, weight) => acc + Math.max(weight, 0), 0);
  if (total <= 0) {
    const even = Math.trunc(amount / weights.length);
    const shares = weights.map(() => fromMinor(even));
    shares[0] = fromMinor(amount - even * (weights.length - 1));
    return shares;
  }

  const shares = weights.map((weight) => fromMinor(Math.trunc((amount * Math.max(weight, 0)) / total)));
  const distributed = shares.reduce((acc, share) => acc + share, 0);
  let remainder = amount - distributed;
  let index = weights.indexOf(Math.max(...weights));
  if (index < 0) index = 0;
  while (remainder !== 0) {
    const step = remainder > 0 ? 1 : -1;
    shares[index] = fromMinor(shares[index] + step);
    remainder -= step;
    index = (index + 1) % shares.length;
  }
  return shares;
}

/** Daily share of every fixed expense that applies to a given store. */
function fixedExpenseForDay(storeId: string, date: ISODate): Money {
  const monthLength = daysInMonth(date);
  const dayOfMonth = parseISODate(date).getUTCDate() - 1;

  let total = ZERO;
  for (const expense of FIXED_EXPENSES) {
    if (expense.storeId !== storeId) continue;
    if (expense.date > date) continue;
    if (expense.endDate && expense.endDate <= date) continue;
    const perDay = Math.trunc(expense.amount / monthLength);
    const remainder = expense.amount - perDay * monthLength;
    total = add(total, fromMinor(perDay + (dayOfMonth < remainder ? 1 : 0)));
  }
  return total;
}

/** Org-wide fixed expenses for one day, before they are split across stores. */
function sharedFixedExpenseForDay(date: ISODate): Money {
  const monthLength = daysInMonth(date);
  const dayOfMonth = parseISODate(date).getUTCDate() - 1;

  let total = ZERO;
  for (const expense of FIXED_EXPENSES) {
    if (expense.storeId !== null) continue;
    if (expense.date > date) continue;
    if (expense.endDate && expense.endDate <= date) continue;
    const perDay = Math.trunc(expense.amount / monthLength);
    const remainder = expense.amount - perDay * monthLength;
    total = add(total, fromMinor(perDay + (dayOfMonth < remainder ? 1 : 0)));
  }
  return total;
}

export function generateDataset(anchorDate: ISODate): MockDataset {
  const dates = enumerateDates(addDays(anchorDate, -(HISTORY_DAYS - 1)), anchorDate);

  const orders: Order[] = [];
  const orderItems: OrderItem[] = [];
  const refunds: Refund[] = [];
  const marketingSpend: MarketingSpendDaily[] = [];
  const variableExpenses: Expense[] = [];

  /** store id -> date -> accumulator */
  const accumulators = new Map<string, Map<ISODate, DayAccumulator>>();
  /** store id -> channel totals per date */
  const channelTotals = new Map<string, Map<ISODate, { meta: Money; google: Money; email: Money }>>();
  /** Recent orders per store, so refunds can reference real prior orders. */
  const recentOrders = new Map<string, GeneratedOrder[]>();

  for (const profile of STORE_PROFILES) {
    accumulators.set(profile.store.id, new Map());
    channelTotals.set(profile.store.id, new Map());
    recentOrders.set(profile.store.id, []);
  }

  for (const [profileIndex, profile] of STORE_PROFILES.entries()) {
    const storeId = profile.store.id;
    const catalog = catalogForStore(storeId);
    const storeAccumulators = accumulators.get(storeId)!;
    const storeChannels = channelTotals.get(storeId)!;
    const storeRecent = recentOrders.get(storeId)!;

    for (const [dayIndex, date] of dates.entries()) {
      const day = emptyAccumulator();
      const demandRng = createRng(`demand:${storeId}:${date}`);
      const growth = Math.pow(1 + profile.dailyGrowth, dayIndex - (dates.length - 1));
      const targetGross = fromMajor(
        profile.dailyGrossTarget *
          weekdayFactor(date) *
          growth *
          seasonalFactor(dayIndex) *
          demandRng.jitter(0.09),
      );

      // --- Orders -------------------------------------------------------
      const orderRng = createRng(`orders:${storeId}:${date}`);
      let sequence = 0;
      while (day.grossSales < targetGross && sequence < 600) {
        const generated = generateOrder(profile, catalog, date, sequence, orderRng);
        orders.push(generated.order);
        orderItems.push(...generated.items);
        storeRecent.push(generated);

        day.grossSales = add(day.grossSales, generated.order.grossSales);
        day.discounts = add(day.discounts, generated.order.discounts);
        day.taxes = add(day.taxes, generated.order.taxes);
        day.cogs = add(day.cogs, generated.cogs);
        day.shipping = add(day.shipping, generated.order.shippingCost);
        day.paymentFees = add(day.paymentFees, generated.order.paymentFees);
        day.orders += 1;
        day.unitsSold += generated.order.itemCount;
        sequence += 1;
      }
      if (storeRecent.length > 600) storeRecent.splice(0, storeRecent.length - 600);

      // --- Refunds ------------------------------------------------------
      const refundRng = createRng(`refunds:${storeId}:${date}`);
      const refundTarget = scale(day.grossSales, profile.refundRate * refundRng.jitter(0.35));
      let refunded = ZERO;
      let attempts = 0;
      while (refunded < refundTarget && attempts < 40 && storeRecent.length > 0) {
        attempts += 1;
        const candidate = storeRecent[refundRng.int(0, storeRecent.length - 1)];
        if (candidate.order.financialStatus !== "paid") continue;
        if (candidate.refundable <= 0) continue;

        const isPartial = refundRng.chance(0.35) && candidate.items.length > 1;
        const amount = isPartial
          ? scale(candidate.refundable, refundRng.between(0.3, 0.6))
          : candidate.refundable;
        const reason = refundRng.pick(REFUND_REASONS);
        const restocked =
          reason === "damaged" ? ZERO : scale(candidate.cogs, (amount / candidate.refundable) * 0.85);

        refunds.push({
          id: stableId(`refund:${candidate.order.id}:${date}`),
          organizationId: ORGANIZATION.id,
          storeId,
          orderId: candidate.order.id,
          date,
          currency: profile.store.currency,
          amount,
          restockedCogs: restocked,
          reason,
        });

        candidate.order.financialStatus = isPartial ? "partially_refunded" : "refunded";
        day.salesReversals = add(day.salesReversals, amount);
        day.cogs = subtract(day.cogs, restocked);
        refunded = add(refunded, amount);
      }

      // --- Marketing spend ----------------------------------------------
      const spendRng = createRng(`spend:${storeId}:${date}`);
      const spendShape = weekdayFactor(date) * growth * seasonalFactor(dayIndex);
      const meta = fromMajor(profile.metaDailySpend * spendShape * spendRng.jitter(0.14));
      const google = fromMajor(profile.googleDailySpend * spendShape * spendRng.jitter(0.11));
      const email = fromMajor(profile.emailDailySpend * spendRng.jitter(0.05));

      marketingSpend.push(marketingRow(profile, date, "meta_ads", meta, spendRng));
      marketingSpend.push(marketingRow(profile, date, "google_ads", google, spendRng));
      marketingSpend.push(marketingRow(profile, date, "klaviyo", email, spendRng));
      storeChannels.set(date, { meta, google, email });

      // --- Variable expenses --------------------------------------------
      const expenseRng = createRng(`expenses:${storeId}:${date}`);
      const packaging = multiply(PACKAGING_PER_ORDER, day.orders);
      variableExpenses.push({
        id: stableId(`expense:packaging:${storeId}:${date}`),
        organizationId: ORGANIZATION.id,
        storeId,
        name: "Packaging & inserts",
        type: "variable",
        category: "packaging",
        recurrence: "daily",
        amount: packaging,
        currency: profile.store.currency,
        date,
        endDate: null,
      });

      const support = fromMajor(
        (SUPPORT_TOOLING_DAILY[profileIndex] ?? 10) * expenseRng.jitter(0.08),
      );
      variableExpenses.push({
        id: stableId(`expense:support:${storeId}:${date}`),
        organizationId: ORGANIZATION.id,
        storeId,
        name: "Customer support tooling",
        type: "variable",
        category: "customer_support",
        recurrence: "daily",
        amount: support,
        currency: profile.store.currency,
        date,
        endDate: null,
      });

      let dayVariable = add(packaging, support);

      if (expenseRng.chance(0.18)) {
        const chargeback = fromMajor(expenseRng.between(60, 250));
        variableExpenses.push({
          id: stableId(`expense:chargeback:${storeId}:${date}`),
          organizationId: ORGANIZATION.id,
          storeId,
          name: "Chargeback & dispute fees",
          type: "variable",
          category: "chargebacks",
          recurrence: "one_off",
          amount: chargeback,
          currency: profile.store.currency,
          date,
          endDate: null,
        });
        dayVariable = add(dayVariable, chargeback);
      }

      day.variableExpenses = dayVariable;
      storeAccumulators.set(date, day);
    }
  }

  // --- Fixed expense allocation ----------------------------------------
  // Shared overhead is split across stores in proportion to that day's net
  // sales, so a store that sold nothing does not absorb the warehouse lease.
  const fixedByStoreDate = new Map<string, Money>();
  for (const date of dates) {
    const shared = sharedFixedExpenseForDay(date);
    const weights = STORE_PROFILES.map((profile) => {
      const day = accumulators.get(profile.store.id)!.get(date)!;
      return Math.max(netSales(day), 0);
    });
    const shares = allocateProRata(shared, weights);

    for (const [index, profile] of STORE_PROFILES.entries()) {
      const direct = fixedExpenseForDay(profile.store.id, date);
      fixedByStoreDate.set(`${profile.store.id}:${date}`, add(direct, shares[index]));
    }
  }

  // --- Daily roll-up ----------------------------------------------------
  const dailyByStore = new Map<string, DailyFinancials[]>();
  for (const profile of STORE_PROFILES) {
    const storeId = profile.store.id;
    const storeAccumulators = accumulators.get(storeId)!;
    const storeChannels = channelTotals.get(storeId)!;

    const days: DailyFinancials[] = dates.map((date) => {
      const day = storeAccumulators.get(date)!;
      const channels = storeChannels.get(date)!;
      const adSpend = add(channels.meta, channels.google);

      return {
        date,
        currency: profile.store.currency,
        grossSales: day.grossSales,
        discounts: day.discounts,
        salesReversals: day.salesReversals,
        taxes: day.taxes,
        cogs: day.cogs,
        shipping: day.shipping,
        paymentFees: day.paymentFees,
        marketingSpend: add(adSpend, channels.email),
        variableExpenses: day.variableExpenses,
        fixedExpenses: fixedByStoreDate.get(`${storeId}:${date}`) ?? ZERO,
        orders: day.orders,
        unitsSold: day.unitsSold,
        adSpend,
        emailSpend: channels.email,
        metaAdSpend: channels.meta,
        googleAdSpend: channels.google,
      } satisfies DailyFinancials;
    });

    dailyByStore.set(storeId, days);
  }

  orders.sort((a, b) => (a.processedAt < b.processedAt ? 1 : -1));
  refunds.sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    orders,
    orderItems,
    refunds,
    marketingSpend,
    variableExpenses,
    dailyByStore,
    dates,
    generatedFor: anchorDate,
  };
}

/** Roll several stores' daily series into one series covering the same dates. */
export function mergeDailySeries(
  series: readonly DailyFinancials[][],
  dates: readonly ISODate[],
): DailyFinancials[] {
  if (series.length === 1) return series[0].slice();

  return dates.map((date, index) => {
    const rows = series.map((entries) => entries[index]).filter(Boolean);
    const first = rows[0];
    return {
      date,
      currency: first?.currency ?? "USD",
      grossSales: sum(rows.map((row) => row.grossSales)),
      discounts: sum(rows.map((row) => row.discounts)),
      salesReversals: sum(rows.map((row) => row.salesReversals)),
      taxes: sum(rows.map((row) => row.taxes)),
      cogs: sum(rows.map((row) => row.cogs)),
      shipping: sum(rows.map((row) => row.shipping)),
      paymentFees: sum(rows.map((row) => row.paymentFees)),
      marketingSpend: sum(rows.map((row) => row.marketingSpend)),
      variableExpenses: sum(rows.map((row) => row.variableExpenses)),
      fixedExpenses: sum(rows.map((row) => row.fixedExpenses)),
      orders: rows.reduce((acc, row) => acc + row.orders, 0),
      unitsSold: rows.reduce((acc, row) => acc + row.unitsSold, 0),
      adSpend: sum(rows.map((row) => row.adSpend)),
      emailSpend: sum(rows.map((row) => row.emailSpend)),
      metaAdSpend: sum(rows.map((row) => row.metaAdSpend)),
      googleAdSpend: sum(rows.map((row) => row.googleAdSpend)),
    } satisfies DailyFinancials;
  });
}
