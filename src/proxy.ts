import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signin', '/signup', '/book', '/quote', '/unsubscribe', '/services', '/products', '/sitemap.xml', '/robots.txt', '/pos', '/auth/callback', '/s/'];

// In-memory cache for IP whitelist
let cachedIps: string[] | null = null;
let cachedEnabled: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

async function getIpWhitelistConfig(): Promise<{ ips: string[]; enabled: boolean }> {
  const now = Date.now();

  // Return cached value if still valid
  if (cachedIps !== null && cachedEnabled !== null && now < cacheExpiry) {
    return { ips: cachedIps, enabled: cachedEnabled };
  }

  // Query Supabase directly — avoids self-fetch which causes cascading
  // requests and double compilation in dev mode
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['pos_allowed_ips', 'pos_ip_whitelist_enabled']);

    if (!error && data) {
      const settings: Record<string, unknown> = {};
      for (const row of data) {
        settings[row.key] = row.value;
      }

      const rawIps = settings.pos_allowed_ips;
      let ips: string[] = [];
      if (Array.isArray(rawIps)) {
        ips = rawIps.map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && (item as { ip?: string }).ip) return (item as { ip: string }).ip;
          return '';
        }).filter(Boolean);
      }
      const enabled = settings.pos_ip_whitelist_enabled === true;

      cachedIps = ips;
      cachedEnabled = enabled;
      cacheExpiry = now + CACHE_TTL_MS;
      return { ips, enabled };
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
  cachedEnabled = envIps.length > 0;
  cacheExpiry = now + CACHE_TTL_MS;
  return { ips: cachedIps, enabled: cachedEnabled };
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip');
}

export async function proxy(request: NextRequest) {
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

  // Allow public routes (including homepage) — still refresh session tokens
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
  // The proxy only handles authentication (is user logged in?)

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all routes except static files, _next internals, and API routes
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
