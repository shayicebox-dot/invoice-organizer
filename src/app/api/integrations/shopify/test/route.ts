import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { testShopifyConnection } from '@/integrations/shopify/connection';
import { integrationTestSecret } from '@/lib/config/env';

/**
 * Shopify connection test.
 *
 *   GET /api/integrations/shopify/test
 *   Authorization: Bearer <ICEBOX_INTEGRATION_TEST_SECRET>
 *
 * Runs server-side only and never returns the access token, the store's
 * financial data, or anything about customers — only whether the connection
 * works and which scopes the token carries.
 *
 * The endpoint fails closed: until authentication exists, no secret configured
 * means no access, rather than a publicly callable endpoint that anyone could
 * use to confirm the store or burn its API quota.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = integrationTestSecret();

  if (secret === null) {
    return NextResponse.json(
      {
        ok: false,
        reason: 'endpoint-disabled',
        message:
          'ICEBOX_INTEGRATION_TEST_SECRET is not set, so this endpoint is disabled. Set it to enable connection tests.',
      },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!isAuthorised(request, secret)) {
    return NextResponse.json(
      { ok: false, reason: 'unauthorized', message: 'Missing or invalid bearer token.' },
      { status: 401, headers: NO_STORE },
    );
  }

  const result = await testShopifyConnection();

  return NextResponse.json(result, {
    status: result.ok ? 200 : statusForFailure(result.reason),
    headers: NO_STORE,
  });
}

function isAuthorised(request: Request, secret: string): boolean {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer (.+)$/.exec(header.trim());

  if (match === null) return false;

  const provided = match[1] ?? '';
  return constantTimeEquals(provided, secret);
}

/** Compare without leaking length or content through timing. */
function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    // Still compare, so a wrong length costs the same as wrong content.
    timingSafeEqual(left, left);
    return false;
  }

  return timingSafeEqual(left, right);
}

function statusForFailure(reason: string): number {
  switch (reason) {
    case 'not-configured':
    case 'invalid-configuration':
      return 503;
    case 'unauthorized':
    case 'forbidden':
    case 'not-found':
      return 502;
    case 'throttled':
      return 429;
    case 'timeout':
      return 504;
    default:
      return 502;
  }
}
