/**
 * Session tokens for the single-owner login.
 *
 * A session is a short signed string in an HTTP-only cookie: the expiry, plus
 * an HMAC-SHA256 signature over it. There is no database and no session store —
 * the signature is what makes the cookie trustworthy, and a cookie that has
 * been edited or forged fails verification.
 *
 * The signing key is derived from `ICEBOX_ADMIN_PASSWORD` itself, which means
 * changing the password immediately invalidates every existing session. That is
 * deliberate: it makes "someone might still be logged in" impossible to get
 * wrong, and it avoids asking for a second secret to be configured.
 *
 * Web Crypto is used rather than `node:crypto` so the same code runs in
 * middleware (Edge runtime) and in server actions (Node runtime).
 */

export const SESSION_COOKIE_NAME = 'icebox_session';

/** How long a login lasts before it must be repeated. */
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Bound into the signature so this key cannot be reused for another purpose. */
const SIGNATURE_CONTEXT = 'icebox-os.session.v1';

const encoder = new TextEncoder();

async function signPayload(password: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${SIGNATURE_CONTEXT}.${payload}`),
  );

  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Compare without leaking where two strings differ.
 * `node:crypto`'s `timingSafeEqual` is unavailable on the Edge runtime, so the
 * comparison is written out: always the same number of operations, no early
 * return on the first mismatched character.
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

/** Mint a token that expires `SESSION_TTL_SECONDS` from now. */
export async function createSessionToken(password: string, now: number = Date.now()): Promise<string> {
  const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  const signature = await signPayload(password, payload);
  return `${payload}.${signature}`;
}

/**
 * True when the token is well-formed, correctly signed and unexpired.
 * Any doubt returns false — this never throws, so a malformed cookie cannot
 * turn into a 500 that hides an authentication failure.
 */
export async function verifySessionToken(
  token: string,
  password: string,
  now: number = Date.now(),
): Promise<boolean> {
  if (password.length === 0) return false;

  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!/^\d+$/.test(payload) || signature.length === 0) return false;

  let expected: string;
  try {
    expected = await signPayload(password, payload);
  } catch {
    return false;
  }

  if (!constantTimeEquals(signature, expected)) return false;

  const expiresAt = Number(payload);
  return Number.isSafeInteger(expiresAt) && expiresAt * 1000 > now;
}
