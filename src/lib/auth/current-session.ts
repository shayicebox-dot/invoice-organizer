import 'server-only';

import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';
import { adminPassword } from '@/lib/config/env';

/**
 * Whether the current request carries a valid session.
 *
 * Deliberately not in `actions.ts`: every exported function in a `'use server'`
 * module becomes a callable endpoint, and this is an internal check with no
 * business being one. The proxy already blocks unauthenticated requests — this
 * exists so an action touching real data can verify for itself rather than
 * trusting that a matcher pattern in another file stayed correct.
 */
export async function hasValidSession(): Promise<boolean> {
  const expected = adminPassword();
  if (expected === null) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? '';

  return token.length > 0 && verifySessionToken(token, expected);
}
