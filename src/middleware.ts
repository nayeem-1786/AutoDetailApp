import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getIpWhitelistConfig, getClientIp } from '@/lib/security/ip-whitelist';
import { getHostType, STAFF_PATHS, APP_ALLOWED_PATHS } from '@/lib/security/host-routing';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signin', '/signup', '/book', '/quote', '/unsubscribe', '/services', '/products', '/sitemap.xml', '/robots.txt', '/pos', '/auth/callback', '/s/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Session 1.6 — POS > Appointments tab retired per AC-4 (POS > Jobs as
  // unified surface; conceptual audit `26521e5a` Target G.4). Permanent 308
  // redirect to /pos/jobs?scope=schedule preserves bookmarks, browser history,
  // and any saved links. 308 (not 302) so browsers cache and don't add latency.
  // Placed before host-routing so the redirect short-circuits regardless of
  // which host the request arrives on.
  if (pathname === '/pos/appointments' || pathname.startsWith('/pos/appointments/')) {
    const target = new URL('/pos/jobs', request.url);
    target.searchParams.set('scope', 'schedule');
    return NextResponse.redirect(target, 308);
  }

  const host = request.headers.get('host') || '';
  const hostType = getHostType(host);

  // =========================================================================
  // MAIN DOMAIN: redirect staff paths to app. subdomain
  // =========================================================================
  if (hostType === 'main') {
    if (STAFF_PATHS.some((p) => pathname.startsWith(p))) {
      const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN!;
      const appUrl = new URL(request.url);
      appUrl.hostname = `app.${mainDomain}`;
      appUrl.port = '';
      return NextResponse.redirect(appUrl, 302);
    }
    // Fall through to existing auth logic below
  }

  // =========================================================================
  // APP DOMAIN: IP restrict everything, allow only staff paths
  // =========================================================================
  if (hostType === 'app') {
    // IP whitelist applies to ALL paths on app. domain
    const { ips, enabled } = await getIpWhitelistConfig();
    if (enabled && ips.length > 0) {
      const clientIp = getClientIp(request.headers);
      if (clientIp && !ips.includes(clientIp)) {
        return new NextResponse(
          'Access denied: Your IP address (' + clientIp + ') is not authorized.',
          { status: 403 }
        );
      }
    }

    // Root path → redirect to /admin
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/admin', request.url), 302);
    }

    // Non-staff path → redirect to main domain
    if (!APP_ALLOWED_PATHS.some((p) => pathname.startsWith(p))) {
      const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN!;
      const mainUrl = new URL(request.url);
      mainUrl.hostname = mainDomain;
      mainUrl.port = '';
      return NextResponse.redirect(mainUrl, 302);
    }

    // Fall through to existing auth logic below
  }

  // =========================================================================
  // STAGING: preserve /pos-only IP restriction (no redirects)
  // =========================================================================
  if (hostType === 'staging' && pathname.startsWith('/pos')) {
    const { ips, enabled } = await getIpWhitelistConfig();
    if (enabled && ips.length > 0) {
      const clientIp = getClientIp(request.headers);
      if (clientIp && !ips.includes(clientIp)) {
        return new NextResponse(
          'Access denied: Your IP address (' + clientIp + ') is not authorized to access the POS system.',
          { status: 403 }
        );
      }
    }
  }

  // =========================================================================
  // DEV (localhost / ngrok / unknown): no changes — fall through to auth logic
  // =========================================================================

  // =========================================================================
  // EXISTING AUTH FLOW (unchanged)
  // =========================================================================

  // Public routes: skip auth entirely for anonymous visitors (no Supabase cookie).
  // Logged-in users still get their session refreshed.
  if (pathname === '/' || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith('sb-'));
    if (!hasAuthCookie) {
      return NextResponse.next({ request });
    }
    const { supabaseResponse } = await updateSession(request);
    return supabaseResponse;
  }

  // For protected routes, check authentication
  const { user, supabaseResponse } = await updateSession(request);

  if (!user && pathname.startsWith('/admin')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Customer portal: redirect unauthenticated users to signin
  if (!user && pathname.startsWith('/account')) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Role-based route protection is handled at the layout/page level
  // because we need to query the employee record which requires a DB call
  // The proxy only handles authentication (is user logged in?)

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files, _next internals, and API routes
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
