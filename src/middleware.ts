import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signin', '/signup', '/book', '/quote', '/unsubscribe', '/api/', '/services', '/products', '/sitemap.xml', '/robots.txt', '/pos', '/auth/callback'];

// In-memory cache for IP whitelist
let cachedIps: string[] | null = null;
let cachedEnabled: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds (faster updates for IP whitelist changes)

async function getIpWhitelistConfig(): Promise<{ ips: string[]; enabled: boolean }> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedIps !== null && cachedEnabled !== null && now < cacheExpiry) {
    return { ips: cachedIps, enabled: cachedEnabled };
  }

  // Try to fetch from database via internal API
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/internal/allowed-ips`, {
      cache: 'no-store',
    });

    if (res.ok) {
      const { ips, enabled } = await res.json();
      cachedIps = Array.isArray(ips) ? ips : [];
      cachedEnabled = enabled === true;
      cacheExpiry = now + CACHE_TTL_MS;
      return { ips: cachedIps, enabled: cachedEnabled };
    }
  } catch {
    // Fall through to env var
  }

  // Fallback to environment variable
  const envIps = process.env.ALLOWED_POS_IPS
    ? process.env.ALLOWED_POS_IPS.split(',')
        .map((ip) => ip.trim())
        .filter(Boolean)
    : [];

  cachedIps = envIps;
  cachedEnabled = envIps.length > 0; // If env var is set, assume enabled
  cacheExpiry = now + CACHE_TTL_MS;
  return { ips: cachedIps, enabled: cachedEnabled };
}

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

  // IP restriction for POS routes (controlled by toggle in Settings > POS Security)
  if (pathname.startsWith('/pos')) {
    const { ips, enabled } = await getIpWhitelistConfig();
    if (enabled && ips.length > 0) {
      const clientIp = getClientIp(request);
      if (!clientIp || !ips.includes(clientIp)) {
        return new NextResponse('Access denied: Your IP address is not authorized to access the POS system.', { status: 403 });
      }
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
