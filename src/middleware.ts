import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signin', '/signup', '/book', '/quote', '/api/', '/services', '/products', '/sitemap.xml', '/robots.txt', '/pos'];

// Allowed IPs for POS access (comma-separated in env var)
const ALLOWED_POS_IPS: string[] | null = process.env.ALLOWED_POS_IPS
  ? process.env.ALLOWED_POS_IPS.split(',').map((ip) => ip.trim()).filter(Boolean)
  : null;

function getClientIp(request: NextRequest): string | null {
  // x-forwarded-for is set by proxies/load balancers (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  // x-real-ip is set by some proxies (Nginx, Cloudflare)
  return request.headers.get('x-real-ip');
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // IP restriction for POS routes (only enforced in production when ALLOWED_POS_IPS is set)
  if (
    pathname.startsWith('/pos') &&
    ALLOWED_POS_IPS &&
    ALLOWED_POS_IPS.length > 0 &&
    process.env.NODE_ENV === 'production'
  ) {
    const clientIp = getClientIp(request);
    if (!clientIp || !ALLOWED_POS_IPS.includes(clientIp)) {
      return new NextResponse('Access denied', { status: 403 });
    }
  }

  // Allow public routes (including homepage)
  if (pathname === '/' || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
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
  // The middleware only handles authentication (is user logged in?)

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files and _next
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
