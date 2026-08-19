"use server";

/**
 * Server Actions behind the Business Costs page.
 *
 * Every mutation runs on the server, validates its input, and revalidates the
 * dashboard so the P&L reflects the change immediately. Amounts arrive as
 * strings from form fields and are parsed into integer minor units by the same
 * exact parser the provider integrations use — a typed "12.34" never becomes a
 * float.
 */

import { revalidatePath } from "next/cache";

import { type Money, ZERO, parseDecimalToMinor } from "../money";
import type { ExpenseCategory, ISODate } from "../types";
import { updateSettings } from "./store";
import type { PaymentProcessor, Recurrence, RecurringCost, ShippingRate, SkuCost } from "./types";

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "software",
  "payroll",
  "rent",
  "professional_services",
  "packaging",
  "customer_support",
  "chargebacks",
  "other",
];

const RECURRENCES: Recurrence[] = ["monthly", "weekly", "yearly", "one_time"];

/** Refresh every page whose numbers depend on these settings. */
function revalidateDashboard(): void {
  for (const path of ["/", "/profit-and-loss", "/expenses", "/business-costs", "/marketing"]) {
    revalidatePath(path);
  }
}

function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Parse a money field. Returns zero for blank, throws on nonsense. */
function money(form: FormData, key: string): Money {
  const raw = text(form, key);
  if (raw === "") return ZERO;
  return parseDecimalToMinor(raw.replace(/[$,\s]/g, ""));
}

function date(form: FormData, key: string, fallback?: ISODate): ISODate {
  const raw = text(form, key);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (fallback) return fallback;
  return new Date().toISOString().slice(0, 10);
}

function optionalDate(form: FormData, key: string): ISODate | null {
  const raw = text(form, key);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function category(form: FormData, key: string): ExpenseCategory {
  const raw = text(form, key) as ExpenseCategory;
  return EXPENSE_CATEGORIES.includes(raw) ? raw : "other";
}

function recurrence(form: FormData, key: string): Recurrence {
  const raw = text(form, key) as Recurrence;
  return RECURRENCES.includes(raw) ? raw : "monthly";
}

/** A percentage typed as "2.9" becomes the decimal rate 0.029. */
function percentage(form: FormData, key: string): number {
  const raw = Number.parseFloat(text(form, key).replace(/[%\s]/g, ""));
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 100) / 100;
}

function share(form: FormData, key: string): number {
  const raw = Number.parseFloat(text(form, key).replace(/[%\s]/g, ""));
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(Math.max(raw / 100, 0), 1);
}

// --- COGS ------------------------------------------------------------------

export async function setCogsMode(form: FormData): Promise<void> {
  const mode = text(form, "mode");
  if (mode !== "shopify_cost_per_item" && mode !== "manual_sku_costs" && mode !== "not_configured") {
    return;
  }
  await updateSettings((current) => ({ ...current, cogs: { ...current.cogs, mode } }));
  revalidateDashboard();
}

export async function addSkuCost(form: FormData): Promise<void> {
  const sku = text(form, "sku");
  if (sku === "") return;

  const record: SkuCost = {
    id: newId("sku"),
    sku,
    label: text(form, "label") || sku,
    unitCost: money(form, "unitCost"),
    effectiveFrom: date(form, "effectiveFrom"),
    effectiveTo: optionalDate(form, "effectiveTo"),
  };

  await updateSettings((current) => ({
    ...current,
    cogs: { ...current.cogs, skuCosts: [...current.cogs.skuCosts, record] },
  }));
  revalidateDashboard();
}

export async function removeSkuCost(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    cogs: { ...current.cogs, skuCosts: current.cogs.skuCosts.filter((cost) => cost.id !== id) },
  }));
  revalidateDashboard();
}

// --- Shipping --------------------------------------------------------------

export async function addShippingRate(form: FormData): Promise<void> {
  const record: ShippingRate = {
    id: newId("ship"),
    label: text(form, "label") || "Shipping rate",
    perOrder: money(form, "perOrder"),
    perUnit: money(form, "perUnit"),
    sku: text(form, "sku") || null,
    effectiveFrom: date(form, "effectiveFrom"),
    effectiveTo: optionalDate(form, "effectiveTo"),
  };

  await updateSettings((current) => ({
    ...current,
    shipping: { ...current.shipping, rates: [...current.shipping.rates, record] },
  }));
  revalidateDashboard();
}

export async function removeShippingRate(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    shipping: {
      ...current.shipping,
      rates: current.shipping.rates.filter((rate) => rate.id !== id),
    },
  }));
  revalidateDashboard();
}

function recurringFromForm(form: FormData, prefix: string, fallbackCategory: ExpenseCategory) {
  const record: RecurringCost = {
    id: newId(prefix),
    name: text(form, "name") || "Untitled",
    category: text(form, "category") ? category(form, "category") : fallbackCategory,
    amount: money(form, "amount"),
    recurrence: recurrence(form, "recurrence"),
    startDate: date(form, "startDate"),
    endDate: optionalDate(form, "endDate"),
  };
  return record;
}

export async function addFulfillmentFee(form: FormData): Promise<void> {
  const record = recurringFromForm(form, "fee", "professional_services");
  await updateSettings((current) => ({
    ...current,
    shipping: { ...current.shipping, fixedFees: [...current.shipping.fixedFees, record] },
  }));
  revalidateDashboard();
}

export async function removeFulfillmentFee(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    shipping: {
      ...current.shipping,
      fixedFees: current.shipping.fixedFees.filter((fee) => fee.id !== id),
    },
  }));
  revalidateDashboard();
}

// --- Payment processors ----------------------------------------------------

export async function addPaymentProcessor(form: FormData): Promise<void> {
  const record: PaymentProcessor = {
    id: newId("pay"),
    name: text(form, "name") || "Processor",
    percentageRate: percentage(form, "percentageRate"),
    fixedPerTransaction: money(form, "fixedPerTransaction"),
    shareOfOrders: share(form, "shareOfOrders"),
    effectiveFrom: date(form, "effectiveFrom"),
    effectiveTo: optionalDate(form, "effectiveTo"),
  };

  await updateSettings((current) => ({
    ...current,
    payments: { processors: [...current.payments.processors, record] },
  }));
  revalidateDashboard();
}

export async function removePaymentProcessor(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    payments: {
      processors: current.payments.processors.filter((processor) => processor.id !== id),
    },
  }));
  revalidateDashboard();
}

// --- Klaviyo ---------------------------------------------------------------

export async function addKlaviyoPlan(form: FormData): Promise<void> {
  const record = recurringFromForm(form, "klaviyo", "software");
  await updateSettings((current) => ({
    ...current,
    klaviyo: { plans: [...current.klaviyo.plans, record] },
  }));
  revalidateDashboard();
}

export async function removeKlaviyoPlan(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    klaviyo: { plans: current.klaviyo.plans.filter((plan) => plan.id !== id) },
  }));
  revalidateDashboard();
}

// --- Other expenses --------------------------------------------------------

export async function addExpense(form: FormData): Promise<void> {
  const record = recurringFromForm(form, "exp", "other");
  await updateSettings((current) => ({ ...current, expenses: [...current.expenses, record] }));
  revalidateDashboard();
}

export async function removeExpense(form: FormData): Promise<void> {
  const id = text(form, "id");
  await updateSettings((current) => ({
    ...current,
    expenses: current.expenses.filter((expense) => expense.id !== id),
  }));
  revalidateDashboard();
}
