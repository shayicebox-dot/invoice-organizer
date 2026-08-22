/**
 * Error types for the Shopify integration.
 *
 * None of these ever carry the access token, a request header, or a raw
 * response body — an error that surfaces in a log must not leak credentials or
 * customer data.
 */

export type ShopifyFailureReason =
  | 'not-configured'
  | 'invalid-configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'throttled'
  | 'token-error'
  | 'graphql-error'
  | 'invalid-response'
  | 'network-error'
  | 'timeout'
  | 'server-error';

export class ShopifyError extends Error {
  override readonly name = 'ShopifyError';
  readonly reason: ShopifyFailureReason;
  /** HTTP status, when the failure came from a response. */
  readonly status: number | null;

  constructor(reason: ShopifyFailureReason, message: string, status: number | null = null) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

/** A response that did not match the shape the query asked for. */
export class ShopifyResponseError extends ShopifyError {
  constructor(message: string) {
    super('invalid-response', message);
  }
}

/** Human-readable guidance for each failure, safe to show in the UI. */
export const FAILURE_GUIDANCE: Readonly<Record<ShopifyFailureReason, string>> = {
  'not-configured':
    'Shopify credentials are not set. Add SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET.',
  'invalid-configuration': 'The Shopify configuration is present but not valid.',
  unauthorized:
    'Shopify rejected the app credentials. Check that the Client ID and Client secret were copied in full from the Dev Dashboard, and that the app is installed on this store.',
  forbidden:
    'The request was refused. Check the app’s Admin API scopes first; if those are correct, check whether anything between this server and Shopify is blocking the request.',
  'not-found':
    'The store or API version was not found. Check SHOPIFY_STORE_DOMAIN and SHOPIFY_API_VERSION.',
  throttled: 'Shopify is rate limiting these requests. Retry shortly.',
  'token-error':
    'Shopify would not issue an access token for these app credentials. Check the Client ID and Client secret, and that the app is installed on this store.',
  'graphql-error': 'Shopify returned an error for this query.',
  'invalid-response': 'Shopify returned a response in an unexpected shape.',
  'network-error': 'Could not reach Shopify.',
  timeout: 'Shopify did not respond in time.',
  'server-error': 'Shopify reported a server error.',
};
