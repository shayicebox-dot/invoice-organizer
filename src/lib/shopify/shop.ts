/**
 * Shop metadata and the calendar helpers everything else here depends on.
 *
 * Shopify reports on calendar days in the shop's own reporting timezone. Every
 * module that buckets money into days goes through `dateInTimezone`, so a
 * late-evening order lands on the same day the merchant sees in Shopify
 * Analytics rather than being pushed into the next UTC day.
 *
 * The only scope required is `read_orders`; no customer field is ever selected,
 * so the integration reads no personal data.
 */

import "server-only";

import { type Money, ZERO, parseDecimalToMinor } from "../money";
import type { CurrencyCode } from "../money";
import type { ISODate } from "../types";
import { shopifyGraphQL } from "./client";

const SHOP_QUERY = `query EcomPlShop {
  shop {
    name
    myshopifyDomain
    ianaTimezone
    currencyCode
  }
}`;

export interface ShopInfo {
  name: string;
  domain: string;
  timezone: string;
  currency: CurrencyCode;
}

export interface MoneyBag {
  shopMoney: { amount: string; currencyCode?: string };
}

const SUPPORTED_CURRENCIES: CurrencyCode[] = ["USD", "EUR", "GBP", "ILS"];

export function toCurrency(code: string | undefined): CurrencyCode {
  const upper = (code ?? "USD").toUpperCase() as CurrencyCode;
  return SUPPORTED_CURRENCIES.includes(upper) ? upper : "USD";
}

export function bagToMoney(bag: MoneyBag | null | undefined, currency: CurrencyCode): Money {
  if (!bag) return ZERO;
  return parseDecimalToMinor(bag.shopMoney.amount, currency);
}

export async function fetchShopInfo(): Promise<ShopInfo> {
  const data = await shopifyGraphQL<{
    shop: { name: string; myshopifyDomain: string; ianaTimezone: string; currencyCode: string };
  }>(SHOP_QUERY);

  return {
    name: data.shop.name,
    domain: data.shop.myshopifyDomain,
    timezone: data.shop.ianaTimezone,
    currency: toCurrency(data.shop.currencyCode),
  };
}

/**
 * Format an instant as a calendar date in the shop's timezone. `en-CA` yields
 * `YYYY-MM-DD`, which is the format used everywhere else in the app.
 */
export function dateInTimezone(instant: string, timezone: string): ISODate {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(instant));
}

/** Shift an ISO instant by whole days, used to widen a query window. */
export function shiftIso(instant: string, days: number): string {
  const date = new Date(instant);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
