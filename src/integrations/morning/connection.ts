import 'server-only';

import { morningGet } from '@/integrations/morning/client';
import {
  CREDENTIALS_LOCATION,
  getMorningConfig,
  IDENTITY_PATH,
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
   * The business name, when the account exposes one. `null` is a real answer —
   * authentication succeeded and the name simply was not in the response — and
   * is reported as such rather than filled in with the account id or a guess.
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
    };

export async function testMorningConnection(): Promise<MorningConnectionResult> {
  if (!isMorningConfigured()) {
    return failure('not-configured', 'Morning environment variables are not set.');
  }

  try {
    const config = getMorningConfig();
    const payload = await morningGet({ path: IDENTITY_PATH, config });

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
      return failure(error.reason, error.message);
    }
    return failure('network-error', 'Morning connection test failed.');
  }
}

/**
 * Find the business name without insisting on a shape.
 *
 * Morning's response body for this endpoint is not documented field by field,
 * and the account name is a convenience here rather than the thing being
 * proven. So the known spellings are tried in turn and an unrecognised shape
 * yields `null` — a display detail must never turn a successful authentication
 * into a reported failure.
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

  for (const key of ['businessName', 'name']) {
    const value = readField(payload, key);
    if (isNonEmptyString(value)) return value.trim();
  }

  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function failure(reason: MorningFailureReason, message: string): MorningConnectionResult {
  return { ok: false, reason, message, guidance: MORNING_FAILURE_GUIDANCE[reason] };
}

/** Where the owner creates the API key pair, for display in Settings. */
export const MORNING_CREDENTIALS_LOCATION = CREDENTIALS_LOCATION;
