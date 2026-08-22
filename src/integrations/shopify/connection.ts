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
import { getTokenSnapshot } from '@/integrations/shopify/token';
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
 * Answers the questions a person actually has when wiring up a store: can we
 * reach it, were the app credentials accepted, and does the resulting token
 * carry the scopes this system needs. It reads nothing financial and writes
 * nothing at all — and it never returns the token or the client secret.
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

/** How the request was authenticated, and when the token lapses. */
export type AuthReport = {
  readonly method: 'client_credentials';
  /** ISO timestamp; the token is refreshed automatically before this. */
  readonly tokenExpiresAt: string | null;
};

export type ShopifyConnectionResult =
  | {
      readonly ok: true;
      readonly apiVersion: string;
      readonly auth: AuthReport;
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

    // The token response reports the scopes granted to this app version, so it
    // is the authoritative source; the installation query is only a fallback.
    const token = getTokenSnapshot(config);
    const scopes =
      token !== null && token.grantedScopes.length > 0
        ? buildScopeReport(token.grantedScopes)
        : await readScopes(config);

    return {
      ok: true,
      apiVersion: config.apiVersion,
      auth: {
        method: 'client_credentials',
        tokenExpiresAt: token?.expiresAt ?? null,
      },
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
    return buildScopeReport(parseScopes(response.data));
  } catch {
    return null;
  }
}

function buildScopeReport(granted: readonly string[]): ScopeReport {
  return {
    granted,
    missingRequired: REQUIRED_SHOPIFY_SCOPES.filter((scope) => !granted.includes(scope)),
    historicalOrdersGranted: granted.includes(HISTORICAL_ORDERS_SCOPE),
  };
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
