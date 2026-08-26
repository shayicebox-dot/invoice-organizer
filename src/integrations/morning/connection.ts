import 'server-only';

import { morningGet } from '@/integrations/morning/client';
import {
  CREDENTIALS_LOCATION,
  getMorningConfig,
  VERIFY_PATH,
  MorningConfigError,
  type MorningEnvironment,
} from '@/integrations/morning/config';
import {
  MORNING_FAILURE_GUIDANCE,
  MorningError,
  type MorningFailureReason,
} from '@/integrations/morning/errors';
import { isMorningConfigured } from '@/lib/config/env';
import { isRecord, readField } from '@/integrations/shopify/json';

/**
 * Connectivity check for the Morning (Green Invoice) integration.
 *
 * This proves one thing only: that ICEBOX OS can authenticate with Morning. It
 * reads the signed-in account — the smallest read-only call the API offers —
 * and reads no documents, no revenue and no client records. It writes nothing,
 * and it returns neither the API key secret nor the minted token.
 *
 * No figure on any screen depends on it. Morning is not a financial source in
 * this system yet, and connecting it does not make it one.
 */

export type MorningAccountIdentity = {
  /**
   * The business name, when the answer happens to carry one. The endpoint this
   * check calls reports document settings rather than the account, so `null` is
   * the ordinary case and not a fault — authentication is what is being proven,
   * and a name that is not there is left absent rather than guessed at.
   */
  readonly businessName: string | null;
  readonly environment: MorningEnvironment;
  /** API host, which identifies the environment rather than the account. */
  readonly host: string;
};

export type MorningConnectionResult =
  | { readonly ok: true; readonly account: MorningAccountIdentity }
  | {
      readonly ok: false;
      readonly reason: MorningFailureReason;
      readonly message: string;
      readonly guidance: string;
      /**
       * The HTTP status Morning answered with, when the request got that far.
       * `null` for a failure with no response — unset credentials, an invalid
       * configuration, a timeout, an unreachable host.
       */
      readonly status: number | null;
    };

export async function testMorningConnection(): Promise<MorningConnectionResult> {
  if (!isMorningConfigured()) {
    return failure('not-configured', 'Morning environment variables are not set.');
  }

  try {
    const config = getMorningConfig();
    const payload = await morningGet({ path: VERIFY_PATH, config });

    return {
      ok: true,
      account: {
        businessName: readBusinessName(payload),
        environment: config.environment,
        host: config.host,
      },
    };
  } catch (error) {
    if (error instanceof MorningConfigError) {
      return failure('invalid-configuration', error.message);
    }
    if (error instanceof MorningError) {
      return failure(error.reason, error.message, error.status);
    }
    return failure('network-error', 'Morning connection test failed.');
  }
}

/**
 * Find the business name, if the answer carries one, without insisting on a
 * shape. An unrecognised body yields `null`: a display detail must never turn a
 * successful authentication into a reported failure.
 *
 * Only a name nested under a business object counts. A bare top-level `name` is
 * deliberately ignored, because on a document-settings response that field is
 * far more likely to be a document type's own label — and showing
 * "חשבונית מס/קבלה" where the business name belongs would be a plausible-looking
 * wrong answer, which is worse than an absent one.
 */
function readBusinessName(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const business = readField(payload, 'business');

  if (isRecord(business)) {
    const nested = readField(business, 'name');
    if (isNonEmptyString(nested)) return nested.trim();
  }

  const businesses = readField(payload, 'businesses');

  if (Array.isArray(businesses)) {
    for (const entry of businesses) {
      if (!isRecord(entry)) continue;
      const name = readField(entry, 'name');
      if (isNonEmptyString(name)) return name.trim();
    }
  }

  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function failure(
  reason: MorningFailureReason,
  message: string,
  status: number | null = null,
): MorningConnectionResult {
  return { ok: false, reason, message, guidance: MORNING_FAILURE_GUIDANCE[reason], status };
}

/** Where the owner creates the API key pair, for display in Settings. */
export const MORNING_CREDENTIALS_LOCATION = CREDENTIALS_LOCATION;
