'use server';

import { createHash, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
} from '@/lib/auth/session';
import { adminPassword, isProduction } from '@/lib/config/env';
import { NAV_ITEMS } from '@/lib/config/navigation';
import type { Route } from 'next';

/**
 * Sign in and sign out.
 *
 * The password is compared on the server and never sent back to the browser in
 * any form. What the browser receives is an HTTP-only cookie it cannot read
 * from JavaScript, containing a signed expiry and nothing else — no password,
 * no derived key, no user data.
 */

export type SignInState = {
  readonly error: string | null;
};

const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 5 * 60_000;

/**
 * Failed-attempt timestamps, per server instance.
 *
 * A deliberate speed bump against guessing, not a complete defence: it is lost
 * on restart and not shared between instances. The real protection is a long
 * password, which is why the login screen asks for one.
 */
const failedAttempts: number[] = [];

function isLockedOut(now: number): boolean {
  while (failedAttempts.length > 0 && now - (failedAttempts[0] ?? 0) > ATTEMPT_WINDOW_MS) {
    failedAttempts.shift();
  }
  return failedAttempts.length >= MAX_ATTEMPTS;
}

/**
 * Compare two secrets without leaking their contents through timing.
 * Both sides are hashed first so the comparison is over equal-length buffers —
 * `timingSafeEqual` throws on a length mismatch, and the length of a wrong
 * guess should teach an attacker nothing.
 */
function matchesAdminPassword(candidate: string, expected: string): boolean {
  const candidateDigest = createHash('sha256').update(candidate, 'utf8').digest();
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Resolve where to land after signing in.
 *
 * The submitted value is matched against the application's own routes rather
 * than merely checked for a leading slash. Nothing outside that list can be
 * redirected to, so this cannot become an open redirect, and the value stays
 * typed as a real `Route` instead of being cast past the type system. Query
 * strings are dropped — the page reloads with its own defaults.
 */
function safeRedirectTarget(value: FormDataEntryValue | null): Route {
  if (typeof value !== 'string') return '/dashboard';

  const path = value.split('?')[0] ?? '';
  return NAV_ITEMS.find((item) => item.href === path)?.href ?? '/dashboard';
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const expected = adminPassword();

  if (expected === null) {
    return {
      error:
        'No password is configured for this deployment. Set ICEBOX_ADMIN_PASSWORD in Vercel and redeploy.',
    };
  }

  const now = Date.now();

  if (isLockedOut(now)) {
    return { error: 'Too many failed attempts. Wait five minutes and try again.' };
  }

  const submitted = formData.get('password');
  const candidate = typeof submitted === 'string' ? submitted : '';

  if (candidate.length === 0 || !matchesAdminPassword(candidate, expected)) {
    failedAttempts.push(now);
    return { error: 'That password is not correct.' };
  }

  // Successful login clears the lockout counter.
  failedAttempts.length = 0;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, await createSessionToken(expected, now), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect(safeRedirectTarget(formData.get('next')));
}

export async function signOut(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect('/login');
}
