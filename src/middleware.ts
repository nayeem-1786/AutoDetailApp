import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { getIpWhitelistConfig, getClientIp } from '@/lib/security/ip-whitelist';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signin', '/signup', '/book', '/quote', '/unsubscribe', '/services', '/products', '/sitemap.xml', '/robots.txt', '/pos', '/auth/callback', '/s/'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // IP restriction for POS routes (controlled by toggle in Settings > POS Security)
  if (pathname.startsWith('/pos')) {
    const { ips, enabled } = await getIpWhitelistConfig();
    if (enabled && ips.length > 0) {
      const clientIp = getClientIp(request.headers);
      // null means local/dev connection (::1, 127.0.0.1, or no proxy headers)
      // Only enforce IP restriction when we have a real public IP to check
      if (clientIp && !ips.includes(clientIp)) {
        return new NextResponse(
          'Access denied: Your IP address (' + clientIp + ') is not authorized to access the POS system.',
          { status: 403 }
        );
      }
    }
  }

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
