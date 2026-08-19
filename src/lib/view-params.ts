/**
 * Reading the store + period selection out of the URL.
 *
 * Both the server (pages) and the client (filter bar) resolve the same
 * selection from the same query string using these pure helpers, so the header
 * and the data below it can never disagree.
 */

import { type DateRange, previousPeriod, resolveDateRange } from "./date-range";
import type { ISODate } from "./types";

export const ALL_STORES = "all";

export interface StoreOption {
  id: string;
  name: string;
  domain: string;
}

export interface ViewParams {
  /** A store id, or `"all"`. */
  scope: string;
  scopeLabel: string;
  range: DateRange;
  previous: { start: ISODate; end: ISODate };
  /** The query string to carry across navigation, including the leading `?`. */
  query: string;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeScope(scope: string | undefined, stores: readonly StoreOption[]): string {
  if (!scope || scope === ALL_STORES) return ALL_STORES;
  return stores.some((store) => store.id === scope) ? scope : ALL_STORES;
}

export function labelForScope(scope: string, stores: readonly StoreOption[]): string {
  if (scope === ALL_STORES) return "All Stores";
  return stores.find((store) => store.id === scope)?.name ?? "All Stores";
}

export function resolveViewParams(
  searchParams: RawSearchParams,
  stores: readonly StoreOption[],
): ViewParams {
  const scope = normalizeScope(firstValue(searchParams.store), stores);
  const range = resolveDateRange(
    firstValue(searchParams.range),
    firstValue(searchParams.from),
    firstValue(searchParams.to),
  );

  const params = new URLSearchParams();
  if (scope !== ALL_STORES) params.set("store", scope);
  if (range.preset !== "30d") params.set("range", range.preset);
  if (range.preset === "custom") {
    params.set("from", range.start);
    params.set("to", range.end);
  }
  const query = params.toString();

  return {
    scope,
    scopeLabel: labelForScope(scope, stores),
    range,
    previous: previousPeriod(range),
    query: query ? `?${query}` : "",
  };
}
