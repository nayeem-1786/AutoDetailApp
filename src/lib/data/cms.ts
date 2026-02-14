import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import type {
  HeroSlide,
  HeroCarouselConfig,
  AnnouncementTicker,
  SeasonalTheme,
} from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSupabase() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

async function getBusinessSetting<T>(key: string): Promise<T | null> {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('business_settings')
    .select('value')
    .eq('key', key)
    .single();
  return data?.value as T | null;
}

// ---------------------------------------------------------------------------
// Hero Slides
// ---------------------------------------------------------------------------

export const getActiveHeroSlides = cache(async (): Promise<HeroSlide[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('hero_slides')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as HeroSlide[];
});

export const getHeroCarouselConfig = cache(async (): Promise<HeroCarouselConfig> => {
  const config = await getBusinessSetting<HeroCarouselConfig>('hero_carousel_config');
  return config ?? {
    mode: 'single',
    interval_ms: 5000,
    transition: 'fade',
    pause_on_hover: true,
  };
});

// ---------------------------------------------------------------------------
// Announcement Tickers
// ---------------------------------------------------------------------------

export const getTopBarTickers = cache(async (pagePath: string): Promise<AnnouncementTicker[]> => {
  const supabase = await getSupabase();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('announcement_tickers')
    .select('*')
    .eq('is_active', true)
    .eq('placement', 'top_bar')
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('sort_order', { ascending: true });

  // Filter by target_pages
  return ((data ?? []) as AnnouncementTicker[]).filter((ticker) => {
    const pages = ticker.target_pages;
    if (!pages || pages.length === 0) return true;
    return pages.includes('all') || pages.includes(pagePath);
  });
});

export const getSectionTickers = cache(async (pagePath: string, position?: string): Promise<AnnouncementTicker[]> => {
  const supabase = await getSupabase();
  const now = new Date().toISOString();

  let query = supabase
    .from('announcement_tickers')
    .select('*')
    .eq('is_active', true)
    .eq('placement', 'section');

  if (position) {
    query = query.eq('section_position', position);
  }

  const { data } = await query
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order('sort_order', { ascending: true });

  return ((data ?? []) as AnnouncementTicker[]).filter((ticker) => {
    const pages = ticker.target_pages;
    if (!pages || pages.length === 0) return true;
    return pages.includes('all') || pages.includes(pagePath);
  });
});

// ---------------------------------------------------------------------------
// Seasonal Themes
// ---------------------------------------------------------------------------

export const getActiveTheme = cache(async (): Promise<SeasonalTheme | null> => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('seasonal_themes')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data as SeasonalTheme | null;
});

// ---------------------------------------------------------------------------
// CMS Feature Toggles
// ---------------------------------------------------------------------------

export interface CmsToggles {
  heroCarousel: boolean;
  announcementTickers: boolean;
  adPlacements: boolean;
  seasonalThemes: boolean;
  tickerEnabled: boolean;
  adsEnabled: boolean;
}

export const getCmsToggles = cache(async (): Promise<CmsToggles> => {
  const supabase = await getSupabase();

  // Fetch feature flags
  const { data: flags } = await supabase
    .from('feature_flags')
    .select('key, enabled')
    .in('key', ['hero_carousel', 'announcement_tickers', 'ad_placements', 'seasonal_themes']);

  const flagMap: Record<string, boolean> = {};
  for (const f of flags ?? []) {
    flagMap[f.key] = f.enabled;
  }

  // Fetch master toggles from business_settings
  const { data: settings } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['ticker_enabled', 'ads_enabled']);

  const settingMap: Record<string, boolean> = {};
  for (const s of settings ?? []) {
    settingMap[s.key] = s.value === true || s.value === 'true';
  }

  return {
    heroCarousel: flagMap.hero_carousel ?? true,
    announcementTickers: flagMap.announcement_tickers ?? false,
    adPlacements: flagMap.ad_placements ?? false,
    seasonalThemes: flagMap.seasonal_themes ?? false,
    tickerEnabled: settingMap.ticker_enabled ?? false,
    adsEnabled: settingMap.ads_enabled ?? false,
  };
});

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export async function getAdsForZone(pagePath: string, zoneId: string) {
  const supabase = await getSupabase();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from('ad_placements')
    .select('*, ad_creative:ad_creatives(*)')
    .eq('page_path', pagePath)
    .eq('zone_id', zoneId)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.ad_creative) return null;

  const creative = data.ad_creative;
  // Check date range
  if (creative.starts_at && new Date(creative.starts_at) > new Date(now)) return null;
  if (creative.ends_at && new Date(creative.ends_at) < new Date(now)) return null;
  if (!creative.is_active) return null;

  return { placement: data, creative };
}
