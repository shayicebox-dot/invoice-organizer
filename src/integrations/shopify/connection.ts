import 'server-only';

import { shopifyGraphQL, type ThrottleStatus } from '@/integrations/shopify/client';
import {
  getShopifyConfig,
  HISTORICAL_ORDERS_SCOPE,
  REQUIRED_SHOPIFY_SCOPES,
  ShopifyConfigError,
} from '@/integrations/shopify/config';
import { ACCESS_SCOPES_QUERY, SHOP_QUERY } from '@/integrations/shopify/queries';
import {
  FAILURE_GUIDANCE,
  ShopifyError,
  type ShopifyFailureReason,
} from '@/integrations/shopify/errors';
import { isShopifyConfigured } from '@/lib/config/env';
import {
  optionalString,
  readField,
  requireArray,
  requireRecord,
  requireString,
} from '@/integrations/shopify/json';

/**
 * Connectivity check for the Shopify integration.
 *
 * Answers three questions a person actually has when wiring up a store:
 * can we reach it, is the token accepted, and does the token carry the scopes
 * this system needs. It reads nothing financial and writes nothing at all.
 */

export type ShopIdentity = {
  readonly name: string;
  readonly domain: string;
  readonly currency: string;
  readonly timeZone: string;
  readonly plan: string | null;
};

export type ScopeReport = {
  readonly granted: readonly string[];
  readonly missingRequired: readonly string[];
  /** Whether orders older than 60 days will be readable. */
  readonly historicalOrdersGranted: boolean;
};

export type ShopifyConnectionResult =
  | {
      readonly ok: true;
      readonly apiVersion: string;
      readonly shop: ShopIdentity;
      readonly scopes: ScopeReport | null;
      readonly throttle: ThrottleStatus | null;
    }
  | {
      readonly ok: false;
      readonly reason: ShopifyFailureReason;
      readonly message: string;
      readonly guidance: string;
    };

export async function testShopifyConnection(): Promise<ShopifyConnectionResult> {
  if (!isShopifyConfigured()) {
    return failure('not-configured', 'Shopify environment variables are not set.');
  }

  try {
    const config = getShopifyConfig();
    const shopResponse = await shopifyGraphQL({ query: SHOP_QUERY, config });
    const shop = parseShop(shopResponse.data);
    const scopes = await readScopes(config);

    return {
      ok: true,
      apiVersion: config.apiVersion,
      shop,
      scopes,
      throttle: shopResponse.throttle,
    };
  } catch (error) {
    if (error instanceof ShopifyConfigError) {
      return failure('invalid-configuration', error.message);
    }
    if (error instanceof ShopifyError) {
      return failure(error.reason, error.message);
    }
    return failure('network-error', 'Shopify connection test failed.');
  }
}

/**
 * Scopes are best-effort: a token can be perfectly valid for reading orders
 * while this particular query is unavailable, so a failure here downgrades the
 * report to `null` rather than failing the whole test.
 */
async function readScopes(
  config: ReturnType<typeof getShopifyConfig>,
): Promise<ScopeReport | null> {
  try {
    const response = await shopifyGraphQL({ query: ACCESS_SCOPES_QUERY, config });
    const granted = parseScopes(response.data);

    return {
      granted,
      missingRequired: REQUIRED_SHOPIFY_SCOPES.filter((scope) => !granted.includes(scope)),
      historicalOrdersGranted: granted.includes(HISTORICAL_ORDERS_SCOPE),
    };
  } catch {
    return null;
  }
}

function parseShop(data: unknown): ShopIdentity {
  const root = requireRecord(data, 'data');
  const shop = requireRecord(readField(root, 'shop'), 'data.shop');
  const plan = readField(shop, 'plan');

  return {
    name: requireString(readField(shop, 'name'), 'data.shop.name'),
    domain: requireString(readField(shop, 'myshopifyDomain'), 'data.shop.myshopifyDomain'),
    currency: requireString(readField(shop, 'currencyCode'), 'data.shop.currencyCode'),
    timeZone: requireString(readField(shop, 'ianaTimezone'), 'data.shop.ianaTimezone'),
    plan:
      plan === null || plan === undefined
        ? null
        : optionalString(
            readField(requireRecord(plan, 'data.shop.plan'), 'publicDisplayName'),
            'data.shop.plan.publicDisplayName',
          ),
  };
}

function parseScopes(data: unknown): readonly string[] {
  const root = requireRecord(data, 'data');
  const installation = readField(root, 'currentAppInstallation');

  if (installation === null || installation === undefined) return [];

  const scopes = requireArray(
    readField(requireRecord(installation, 'data.currentAppInstallation'), 'accessScopes'),
    'data.currentAppInstallation.accessScopes',
  );

  return scopes.map((scope, index) =>
    requireString(
      readField(requireRecord(scope, `accessScopes[${index}]`), 'handle'),
      `accessScopes[${index}].handle`,
    ),
  );
}

function failure(reason: ShopifyFailureReason, message: string): ShopifyConnectionResult {
  return { ok: false, reason, message, guidance: FAILURE_GUIDANCE[reason] };
}
