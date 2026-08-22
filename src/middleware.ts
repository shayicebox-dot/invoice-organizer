import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/session';

/**
 * Gatekeeper for the whole application.
 *
 * Every request that is not the login screen or a static asset must carry a
 * valid session cookie. Putting the check here means a new page or server
 * action is protected the moment it exists — nobody has to remember to add a
 * guard. Sensitive server actions verify the session again themselves, so a
 * matcher mistake cannot silently expose one.
 *
 * It fails closed: with `ICEBOX_ADMIN_PASSWORD` unset, nothing is reachable.
 */

const LOGIN_PATH = '/login';

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const password = process.env.ICEBOX_ADMIN_PASSWORD ?? '';

  if (password.length === 0) {
    return redirectToLogin(request);
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? '';

  if (token.length > 0 && (await verifySessionToken(token, password))) {
    return NextResponse.next();
  }

  return redirectToLogin(request);
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = LOGIN_PATH;
  url.search = '';

  // Remember where they were headed, but only ever as a path on this site:
  // reflecting an arbitrary value here would be an open redirect.
  const intended = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (isSafeInternalPath(intended) && intended !== LOGIN_PATH) {
    url.searchParams.set('next', intended);
  }

  return NextResponse.redirect(url);
}

function isSafeInternalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
}

export const config = {
  /*
   * Everything except:
   *  - the login screen (and the sign-in action, which posts to it)
   *  - Next.js internals and the app icon
   *  - /api/integrations/*, which carries its own bearer-secret auth so
   *    scripts and CI can still reach it without a browser session
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|login|api/integrations).*)'],
};
