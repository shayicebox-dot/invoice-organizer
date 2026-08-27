/**
 * Error types for the Morning (Green Invoice) integration.
 *
 * None of these ever carry the API key secret, the minted JWT, a request URL,
 * or a raw response body — an error that reaches a log or a screen must not
 * leak credentials.
 */

export type MorningFailureReason =
  | 'not-configured'
  | 'invalid-configuration'
  | 'unauthorized'
  | 'forbidden'
  | 'plan-restricted'
  | 'not-found'
  | 'invalid-request'
  | 'throttled'
  | 'api-error'
  | 'invalid-response'
  | 'network-error'
  | 'timeout'
  | 'server-error';

export class MorningError extends Error {
  override readonly name = 'MorningError';
  readonly reason: MorningFailureReason;
  readonly status: number | null;

  constructor(reason: MorningFailureReason, message: string, status: number | null = null) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

export class MorningResponseError extends MorningError {
  constructor(message: string) {
    super('invalid-response', message);
  }
}

/** Human-readable guidance for each failure, safe to show in the UI. */
export const MORNING_FAILURE_GUIDANCE: Readonly<Record<MorningFailureReason, string>> = {
  'not-configured':
    'Morning credentials are not set. Add MORNING_CLIENT_ID and MORNING_CLIENT_SECRET.',
  'invalid-configuration': 'The Morning configuration is present but not valid.',
  unauthorized:
    'Morning rejected the API key pair. Check that both values were copied from the same key, and that the key has not been deleted or regenerated in the Morning dashboard.',
  // Reported when the token request itself is refused, where Morning's own
  // plan gate and a network policy in the way are indistinguishable.
  forbidden:
    'The request was refused before Morning answered. Either the subscription does not include API access (it requires the Best plan or higher), or something between this deployment and api.greeninvoice.co.il is blocking the request.',
  // Morning gates API access behind the Best plan and shows no "API Keys" menu
  // below it, so a key that authenticates but cannot read is usually the plan.
  'plan-restricted':
    'Morning refused the request. API access requires the Best plan or higher — check the subscription in the Morning dashboard.',
  'not-found': 'Morning does not recognise that endpoint.',
  // Morning validates search parameters and says which one it rejected. That
  // message is the useful part, so the guidance points at it rather than
  // talking over it — and says plainly that the credentials are not at fault.
  'invalid-request':
    'Morning rejected something in the request itself, not the credentials. Its own explanation is above.',
  throttled: 'Morning is rate limiting these requests. Wait a moment and try again.',
  'api-error': 'Morning returned an error for this request.',
  'invalid-response': 'Morning returned a response in an unexpected shape.',
  'network-error': 'Could not reach Morning.',
  timeout: 'Morning did not respond in time.',
  'server-error': 'Morning reported a server error.',
};
