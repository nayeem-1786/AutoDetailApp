import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  HeroSlide,
  HeroCarouselConfig,
  AnnouncementTicker,
  SeasonalTheme,
  SiteThemeSettings,
} from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Hero Slides
// ---------------------------------------------------------------------------

export const getActiveHeroSlides = unstable_cache(
  async (): Promise<HeroSlide[]> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    return (data ?? []) as HeroSlide[];
  },
  ['active-hero-slides'],
  { revalidate: 60, tags: ['cms-hero'] }
);

export const getHeroCarouselConfig = unstable_cache(
  async (): Promise<HeroCarouselConfig> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('business_settings')
      .select('value')
      .eq('key', 'hero_carousel_config')
      .single();
    const config = data?.value as HeroCarouselConfig | null;
    return config ?? {
      mode: 'single',
      interval_ms: 5000,
      transition: 'fade',
      pause_on_hover: true,
    };
  },
  ['hero-carousel-config'],
  { revalidate: 60, tags: ['cms-hero'] }
);

// ---------------------------------------------------------------------------
// Announcement Tickers
// ---------------------------------------------------------------------------

export const getTopBarTickers = unstable_cache(
  async (): Promise<AnnouncementTicker[]> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('announcement_tickers')
      .select('*')
      .eq('is_active', true)
      .eq('placement', 'top_bar')
      .order('sort_order', { ascending: true });

    // Date filtering happens client-side since cached value must be stable
    const now = Date.now();
    return ((data ?? []) as AnnouncementTicker[]).filter((ticker) => {
      if (ticker.starts_at && new Date(ticker.starts_at).getTime() > now) return false;
      if (ticker.ends_at && new Date(ticker.ends_at).getTime() < now) return false;
      return true;
    });
  },
  ['top-bar-tickers'],
  { revalidate: 60, tags: ['cms-tickers'] }
);

export const getSectionTickers = unstable_cache(
  async (pagePath: string, position?: string): Promise<AnnouncementTicker[]> => {
    const supabase = createAdminClient();
    let query = supabase
      .from('announcement_tickers')
      .select('*')
      .eq('is_active', true)
      .eq('placement', 'section');

    if (position) {
      query = query.eq('section_position', position);
    }

    const { data } = await query.order('sort_order', { ascending: true });

    const now = Date.now();
    return ((data ?? []) as AnnouncementTicker[]).filter((ticker) => {
      if (ticker.starts_at && new Date(ticker.starts_at).getTime() > now) return false;
      if (ticker.ends_at && new Date(ticker.ends_at).getTime() < now) return false;
      const pages = ticker.target_pages;
      if (!pages || pages.length === 0) return true;
      return pages.includes('all') || pages.includes(pagePath);
    });
  },
  ['section-tickers'],
  { revalidate: 60, tags: ['cms-tickers'] }
);

/**
 * Fetch ALL active section tickers without page filtering.
 * Page filtering is handled client-side by SectionTickerFiltered / LayoutSectionTickers.
 */
export const getAllSectionTickers = unstable_cache(
  async (): Promise<AnnouncementTicker[]> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('announcement_tickers')
      .select('*')
      .eq('is_active', true)
      .eq('placement', 'section')
      .order('sort_order', { ascending: true });

    const now = Date.now();
    return ((data ?? []) as AnnouncementTicker[]).filter((ticker) => {
      if (ticker.starts_at && new Date(ticker.starts_at).getTime() > now) return false;
      if (ticker.ends_at && new Date(ticker.ends_at).getTime() < now) return false;
      return true;
    });
  },
  ['all-section-tickers'],
  { revalidate: 60, tags: ['cms-tickers'] }
);

// ---------------------------------------------------------------------------
// Seasonal Themes
// ---------------------------------------------------------------------------

export const getActiveTheme = unstable_cache(
  async (): Promise<SeasonalTheme | null> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('seasonal_themes')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    return data as SeasonalTheme | null;
  },
  ['active-theme'],
  { revalidate: 60, tags: ['cms-theme'] }
);

// ---------------------------------------------------------------------------
// Site Theme Settings
// ---------------------------------------------------------------------------

export const getSiteThemeSettings = unstable_cache(
  async (): Promise<SiteThemeSettings | null> => {
    const supabase = createAdminClient();

    // Try active custom theme first
    const { data: active } = await supabase
      .from('site_theme_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle();

    if (active) return active as SiteThemeSettings;

    // Fall back to default
    const { data: defaultTheme } = await supabase
      .from('site_theme_settings')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();

    return (defaultTheme as SiteThemeSettings) ?? null;
  },
  ['site-theme-settings'],
  { revalidate: 60, tags: ['site-theme'] }
);

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

export const getCmsToggles = unstable_cache(
  async (): Promise<CmsToggles> => {
    const supabase = createAdminClient();

    const [{ data: flags }, { data: settings }] = await Promise.all([
      supabase
        .from('feature_flags')
        .select('key, enabled')
        .in('key', ['hero_carousel', 'announcement_tickers', 'ad_placements', 'seasonal_themes']),
      supabase
        .from('business_settings')
        .select('key, value')
        .in('key', ['ticker_enabled', 'ads_enabled']),
    ]);

    const flagMap: Record<string, boolean> = {};
    for (const f of flags ?? []) {
      flagMap[f.key] = f.enabled;
    }

    const settingMap: Record<string, boolean> = {};
    for (const s of settings ?? []) {
      settingMap[s.key] = s.value === true || s.value === 'true';
    }

    return {
      heroCarousel: flagMap.hero_carousel ?? true,
      announcementTickers: flagMap.announcement_tickers ?? false,
      adPlacements: (flagMap.ad_placements ?? false) && (settingMap.ads_enabled ?? true),
      seasonalThemes: flagMap.seasonal_themes ?? false,
      tickerEnabled: settingMap.ticker_enabled ?? false,
      adsEnabled: settingMap.ads_enabled ?? true,
    };
  },
  ['cms-toggles'],
  { revalidate: 60, tags: ['cms-toggles'] }
);

// ---------------------------------------------------------------------------
// Ticker Placement Options (multi-ticker rotation settings)
// ---------------------------------------------------------------------------

export interface TickerPlacementOptions {
  hold_duration: number;   // seconds, default 5
  bg_transition: 'slide_down' | 'crossfade' | 'none'; // default 'crossfade'
  text_entry: 'scroll' | 'ltr' | 'rtl' | 'ttb' | 'btt' | 'fade_in'; // default 'rtl'
}

const DEFAULT_TICKER_OPTIONS: TickerPlacementOptions = {
  hold_duration: 5,
  bg_transition: 'crossfade',
  text_entry: 'rtl',
};

export const getTickerOptions = unstable_cache(
  async (): Promise<{
    top_bar: TickerPlacementOptions;
    section: TickerPlacementOptions;
  }> => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['ticker_top_bar_options', 'ticker_section_options']);

    const map: Record<string, unknown> = {};
    for (const s of data ?? []) {
      map[s.key] = s.value;
    }

    return {
      top_bar: { ...DEFAULT_TICKER_OPTIONS, ...(map.ticker_top_bar_options as Partial<TickerPlacementOptions> | null) },
      section: { ...DEFAULT_TICKER_OPTIONS, ...(map.ticker_section_options as Partial<TickerPlacementOptions> | null) },
    };
  },
  ['ticker-options'],
  { revalidate: 60, tags: ['cms-tickers'] }
);

// ---------------------------------------------------------------------------
// Ads
// ---------------------------------------------------------------------------

export const getAdsForZone = unstable_cache(
  async (pagePath: string, zoneId: string) => {
    const supabase = createAdminClient();

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
    const now = Date.now();
    if (creative.starts_at && new Date(creative.starts_at).getTime() > now) return null;
    if (creative.ends_at && new Date(creative.ends_at).getTime() < now) return null;
    if (!creative.is_active) return null;

    return { placement: data, creative };
  },
  ['ads-for-zone'],
  { revalidate: 300, tags: ['cms-ads'] }
);
