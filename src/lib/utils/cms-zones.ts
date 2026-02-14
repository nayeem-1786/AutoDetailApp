import type { AdSize } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Ad Zone Definitions
// Each page has named ad zones where creatives can be placed.
// Desktop and mobile have different compatible sizes.
// ---------------------------------------------------------------------------

export interface AdZoneDefinition {
  id: string;
  label: string;
  description: string;
  desktopSizes: AdSize[];
  mobileSizes: AdSize[];
}

export interface PageZones {
  pagePath: string;
  label: string;
  zones: AdZoneDefinition[];
}

export const PAGE_ZONES: PageZones[] = [
  {
    pagePath: '/',
    label: 'Homepage',
    zones: [
      {
        id: 'below_hero',
        label: 'Below Hero',
        description: 'Between the hero section and trust bar',
        desktopSizes: ['970x250', '728x90'],
        mobileSizes: ['320x100', '320x50'],
      },
      {
        id: 'between_sections_1',
        label: 'Between Sections',
        description: 'Between services grid and review cards',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
      {
        id: 'above_cta',
        label: 'Above CTA',
        description: 'Above the bottom call-to-action section',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/services',
    label: 'Services Index',
    zones: [
      {
        id: 'below_hero',
        label: 'Below Hero',
        description: 'Below the services hero section',
        desktopSizes: ['970x250', '728x90'],
        mobileSizes: ['320x100', '320x50'],
      },
      {
        id: 'above_cta',
        label: 'Above CTA',
        description: 'Above the bottom CTA',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/services/:categorySlug',
    label: 'Service Category',
    zones: [
      {
        id: 'below_hero',
        label: 'Below Hero',
        description: 'Below the category hero',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
      {
        id: 'above_cta',
        label: 'Above CTA',
        description: 'Above the bottom CTA',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/services/:categorySlug/:serviceSlug',
    label: 'Service Detail',
    zones: [
      {
        id: 'sidebar',
        label: 'Sidebar',
        description: 'Sidebar ad on service detail page',
        desktopSizes: ['300x250', '336x280', '300x600'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/products',
    label: 'Products Index',
    zones: [
      {
        id: 'below_hero',
        label: 'Below Hero',
        description: 'Below the products hero',
        desktopSizes: ['970x250', '728x90'],
        mobileSizes: ['320x100', '320x50'],
      },
      {
        id: 'above_cta',
        label: 'Above CTA',
        description: 'Above the bottom CTA',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/products/:categorySlug/:productSlug',
    label: 'Product Detail',
    zones: [
      {
        id: 'sidebar',
        label: 'Sidebar',
        description: 'Sidebar ad on product detail page',
        desktopSizes: ['300x250', '336x280'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/gallery',
    label: 'Photo Gallery',
    zones: [
      {
        id: 'below_hero',
        label: 'Below Hero',
        description: 'Below the gallery hero',
        desktopSizes: ['728x90'],
        mobileSizes: ['320x100'],
      },
      {
        id: 'between_rows',
        label: 'Between Rows',
        description: 'Interspersed in the photo grid',
        desktopSizes: ['728x90', '970x90'],
        mobileSizes: ['320x100'],
      },
    ],
  },
  {
    pagePath: '/book',
    label: 'Booking',
    zones: [
      {
        id: 'sidebar',
        label: 'Sidebar (Desktop)',
        description: 'Sidebar ad on booking page, desktop only',
        desktopSizes: ['300x250', '160x600'],
        mobileSizes: [],
      },
    ],
  },
];

/**
 * Get zone definitions for a specific page path.
 * Matches exact paths and pattern paths like /services/:slug.
 */
export function getZonesForPage(pagePath: string): AdZoneDefinition[] {
  // Try exact match first
  const exact = PAGE_ZONES.find((p) => p.pagePath === pagePath);
  if (exact) return exact.zones;

  // Try pattern matching
  for (const page of PAGE_ZONES) {
    if (!page.pagePath.includes(':')) continue;
    const pattern = page.pagePath.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(pagePath)) return page.zones;
  }

  return [];
}

/**
 * All available ad sizes with labels.
 */
export const AD_SIZE_LABELS: Record<AdSize, string> = {
  '728x90': 'Leaderboard',
  '300x250': 'Medium Rectangle',
  '336x280': 'Large Rectangle',
  '160x600': 'Wide Skyscraper',
  '300x600': 'Half Page',
  '320x50': 'Mobile Leaderboard',
  '320x100': 'Large Mobile Banner',
  '970x90': 'Large Leaderboard',
  '970x250': 'Billboard',
  '250x250': 'Square',
};
