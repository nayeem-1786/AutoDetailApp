import { createClient } from '@supabase/supabase-js';

// In-memory cache for IP whitelist
let cachedIps: string[] | null = null;
let cachedEnabled: boolean | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 10_000; // 10 seconds

/**
 * Fetch IP whitelist config from business_settings.
 * Caches result for 10 seconds to avoid DB round-trips on every request.
 * Falls back to ALLOWED_POS_IPS env var if DB query fails.
 */
export async function getIpWhitelistConfig(): Promise<{ ips: string[]; enabled: boolean }> {
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

/**
 * Extract client IP from request headers.
 * Returns null for local/dev connections (::1, 127.0.0.1).
 */
export function getClientIp(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const ip = forwarded.split(',')[0].trim();
    // In dev, x-forwarded-for may be ::1, 127.0.0.1, or ::ffff:127.0.0.1 — treat as null
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return null;
    return ip;
  }
  const realIp = headers.get('x-real-ip');
  if (realIp === '::1' || realIp === '127.0.0.1' || realIp === '::ffff:127.0.0.1') return null;
  return realIp;
}

/**
 * Check if a request's IP is allowed by the whitelist.
 * Returns true if allowed, false if blocked.
 * Always returns true if whitelist is disabled or IP can't be determined.
 */
export async function isIpAllowed(headers: Headers): Promise<boolean> {
  const { enabled, ips } = await getIpWhitelistConfig();
  if (!enabled || ips.length === 0) return true;

  const clientIp = getClientIp(headers);
  // null means local/dev connection — allow
  if (!clientIp) return true;

  return ips.includes(clientIp);
}
