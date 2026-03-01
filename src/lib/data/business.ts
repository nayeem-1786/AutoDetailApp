import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// SeoSettings — SEO / location data for JSON-LD structured data
// ---------------------------------------------------------------------------

export interface SeoSettings {
  description: string;
  latitude: number;
  longitude: number;
  serviceAreaName: string;
  serviceAreaRadius: string;
  priceRange: string;
  ogImageUrl: string | null;
}

// ---------------------------------------------------------------------------
// BusinessInfo — shape returned to public components
// ---------------------------------------------------------------------------

export interface BusinessInfo {
  name: string;
  phone: string;
  /** Formatted one-line address: "2021 Lomita Blvd., Lomita, CA 90717" */
  address: string;
  /** Structured address parts for JSON-LD PostalAddress */
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  email: string | null;
  website: string | null;
  /** Business logo URL from receipt printer settings */
  logo_url: string | null;
}

// ---------------------------------------------------------------------------
// getBusinessInfo
// Cached across requests with unstable_cache. Revalidates every 60s or on
// demand via revalidateTag('business-info').
// ---------------------------------------------------------------------------

export const getBusinessInfo = unstable_cache(
  async (): Promise<BusinessInfo> => {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['business_name', 'business_phone', 'business_address', 'business_email', 'business_website', 'receipt_config']);

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    // Parse address — stored as JSON object { line1, city, state, zip }
    const rawAddr = settings.business_address;
    const addr =
      typeof rawAddr === 'object' && rawAddr !== null
        ? (rawAddr as { line1: string; city: string; state: string; zip: string })
        : { line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' };

    return {
      name: (settings.business_name as string) || 'Smart Detail Auto Spa & Supplies',
      phone: (settings.business_phone as string) || '+13109990000',
      address: `${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`,
      streetAddress: addr.line1,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      email: (settings.business_email as string) || null,
      website: (settings.business_website as string) || null,
      logo_url: (typeof settings.receipt_config === 'object' && settings.receipt_config !== null
        ? ((settings.receipt_config as Record<string, unknown>).logo_url as string) || null
        : null),
    };
  },
  ['business-info'],
  { revalidate: 60, tags: ['business-info'] }
);

// ---------------------------------------------------------------------------
// getSeoSettings
// Reads SEO / geo settings from business_settings. Falls back to current
// hardcoded defaults so existing installs work without migration.
// ---------------------------------------------------------------------------

const DEFAULT_SEO: SeoSettings = {
  description: 'Professional auto detailing, ceramic coatings, and car care supplies in Lomita, CA. Mobile detailing available in the South Bay area.',
  latitude: 33.7922,
  longitude: -118.3151,
  serviceAreaName: 'South Bay, Los Angeles',
  serviceAreaRadius: '5 mi',
  priceRange: '$$',
  ogImageUrl: null,
};

export const getSeoSettings = unstable_cache(
  async (): Promise<SeoSettings> => {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', [
        'business_description',
        'business_latitude',
        'business_longitude',
        'service_area_name',
        'service_area_radius',
        'price_range',
        'og_image_url',
      ]);

    const settings: Record<string, unknown> = {};
    for (const row of data ?? []) {
      settings[row.key] = row.value;
    }

    // Parse JSON-wrapped strings (business_settings stores values as JSONB)
    const parseStr = (val: unknown, fallback: string): string => {
      if (typeof val === 'string') return val;
      return fallback;
    };

    const parseNum = (val: unknown, fallback: number): number => {
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const n = parseFloat(val);
        return isNaN(n) ? fallback : n;
      }
      return fallback;
    };

    // OG image: empty string means "not set"
    const rawOg = settings.og_image_url;
    const ogUrl = typeof rawOg === 'string' && rawOg.length > 0 ? rawOg : null;

    return {
      description: parseStr(settings.business_description, DEFAULT_SEO.description),
      latitude: parseNum(settings.business_latitude, DEFAULT_SEO.latitude),
      longitude: parseNum(settings.business_longitude, DEFAULT_SEO.longitude),
      serviceAreaName: parseStr(settings.service_area_name, DEFAULT_SEO.serviceAreaName),
      serviceAreaRadius: parseStr(settings.service_area_radius, DEFAULT_SEO.serviceAreaRadius),
      priceRange: parseStr(settings.price_range, DEFAULT_SEO.priceRange),
      ogImageUrl: ogUrl,
    };
  },
  ['seo-settings'],
  { revalidate: 60, tags: ['business-info'] }
);
