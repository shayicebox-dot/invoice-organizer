/**
 * Error types for the Meta Ads integration.
 *
 * None of these ever carry the access token, a request URL containing it, or a
 * raw response body — an error that surfaces in a log must not leak credentials.
 */

export type MetaFailureReason =
  | 'not-configured'
  | 'invalid-configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'throttled'
  | 'unsupported-version'
  | 'api-error'
  | 'invalid-response'
  | 'network-error'
  | 'timeout'
  | 'server-error';

export class MetaError extends Error {
  override readonly name = 'MetaError';
  readonly reason: MetaFailureReason;
  readonly status: number | null;

  constructor(reason: MetaFailureReason, message: string, status: number | null = null) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

export class MetaResponseError extends MetaError {
  constructor(message: string) {
    super('invalid-response', message);
  }
}

/** Human-readable guidance for each failure, safe to show in the UI. */
export const META_FAILURE_GUIDANCE: Readonly<Record<MetaFailureReason, string>> = {
  'not-configured':
    'Meta Ads credentials are not set. Add META_AD_ACCOUNT_ID and META_ACCESS_TOKEN.',
  'invalid-configuration': 'The Meta Ads configuration is present but not valid.',
  unauthorized:
    'Meta rejected the access token. It may have expired, been revoked, or belong to a different account.',
  forbidden:
    'The token is valid but not permitted to read this ad account. Check that the system user has access to it and that the token carries the ads_read permission.',
  'not-found':
    'Meta could not find that ad account. Check META_AD_ACCOUNT_ID — it is the number shown in Ads Manager.',
  throttled: 'Meta is rate limiting these requests. Retry shortly.',
  'unsupported-version':
    'Meta no longer serves the Graph API version this app requests. Set META_API_VERSION to a current version.',
  'api-error': 'Meta returned an error for this request.',
  'invalid-response': 'Meta returned a response in an unexpected shape.',
  'network-error': 'Could not reach Meta.',
  timeout: 'Meta did not respond in time.',
  'server-error': 'Meta reported a server error.',
};
