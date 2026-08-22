import { ShopifyResponseError } from '@/integrations/shopify/errors';

/**
 * Narrowing helpers for untrusted JSON.
 *
 * Everything arriving from Shopify is `unknown` until proven otherwise. No
 * casts, no `any`: a shape change upstream must surface as a clear error rather
 * than as a wrong number somewhere downstream.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ShopifyResponseError(`Expected an object at ${path}.`);
  }
  return value;
}

export function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new ShopifyResponseError(`Expected an array at ${path}.`);
  }
  return value;
}

export function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new ShopifyResponseError(`Expected a string at ${path}.`);
  }
  return value;
}

export function optionalString(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, path);
}

export function requireInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ShopifyResponseError(`Expected an integer at ${path}.`);
  }
  return value;
}

export function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ShopifyResponseError(`Expected a boolean at ${path}.`);
  }
  return value;
}

/**
 * Shopify serialises `UnsignedInt64` as a string (e.g. `numberOfOrders: "7"`).
 * Parsed strictly so a future change to a JSON number is not silently accepted
 * in a way that could round large values.
 */
export function requireUnsignedInt64(value: unknown, path: string): number {
  const text = requireString(value, path);

  if (!/^\d+$/.test(text)) {
    throw new ShopifyResponseError(`Expected an unsigned integer string at ${path}.`);
  }

  const parsed = Number(text);

  if (!Number.isSafeInteger(parsed)) {
    throw new ShopifyResponseError(`Value at ${path} exceeds the safe integer range.`);
  }

  return parsed;
}

export function readField(source: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(source, key) ? source[key] : undefined;
}
