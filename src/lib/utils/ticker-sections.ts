import type { AnnouncementTicker } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Ticker Section Position — types, options, availability, and fallback logic
// ---------------------------------------------------------------------------

export type TickerPosition =
  | 'after_hero'
  | 'after_services'
  | 'after_reviews'
  | 'before_cta'
  | 'before_footer';

export type PageType =
  | 'home'
  | 'products'
  | 'services'
  | 'areas'
  | 'gallery'
  | 'cms_pages'
  | 'cart'
  | 'checkout'
  | 'account'
  | 'other';

export const TICKER_POSITION_OPTIONS: {
  value: TickerPosition;
  label: string;
  description: string;
}[] = [
  {
    value: 'after_hero',
    label: 'After Hero',
    description: 'Below the hero section (homepage only)',
  },
  {
    value: 'after_services',
    label: 'After Services',
    description: 'Below the services grid (homepage only)',
  },
  {
    value: 'after_reviews',
    label: 'After Reviews',
    description: 'Below the reviews section (homepage only)',
  },
  {
    value: 'before_cta',
    label: 'Before CTA',
    description: 'Above the call-to-action section (most pages)',
  },
  {
    value: 'before_footer',
    label: 'Before Footer',
    description: 'Above the footer (all pages)',
  },
];

/** Which page types natively support each position */
export const POSITION_AVAILABILITY: Record<TickerPosition, PageType[]> = {
  after_hero: ['home'],
  after_services: ['home'],
  after_reviews: ['home'],
  before_cta: ['home', 'products', 'services', 'areas'],
  before_footer: [
    'home', 'products', 'services', 'areas', 'gallery',
    'cms_pages', 'cart', 'checkout', 'account', 'other',
  ],
};

/** Fallback chain — when a position isn't available on a page type */
const FALLBACK_CHAIN: Record<TickerPosition, TickerPosition[]> = {
  after_hero: ['before_cta', 'before_footer'],
  after_services: ['before_cta', 'before_footer'],
  after_reviews: ['before_cta', 'before_footer'],
  before_cta: ['before_footer'],
  before_footer: [],
};

/**
 * Resolve a ticker's position to where it should actually render on a given
 * page type. Returns the original position if available, or walks the
 * fallback chain until a supported position is found.
 */
export function resolveTickerPosition(
  position: TickerPosition | string | null,
  pageType: PageType,
): TickerPosition {
  // Default null/unknown positions to before_footer (backward compat)
  const pos = (position ?? 'before_footer') as TickerPosition;
  if (!(pos in POSITION_AVAILABILITY)) return 'before_footer';

  // Check if this position is natively available on this page type
  if (POSITION_AVAILABILITY[pos].includes(pageType)) return pos;

  // Walk fallback chain
  const chain = FALLBACK_CHAIN[pos] ?? [];
  for (const fallback of chain) {
    if (POSITION_AVAILABILITY[fallback].includes(pageType)) return fallback;
  }

  return 'before_footer';
}

/**
 * Filter tickers to those that should render at a specific slot on a
 * specific page type. Resolves fallback positions so tickers targeted at
 * e.g. `after_hero` will fall back to `before_cta` on non-homepage pages.
 */
export function tickersForPosition(
  tickers: AnnouncementTicker[],
  slotPosition: TickerPosition,
  pageType: PageType,
): AnnouncementTicker[] {
  return tickers.filter((ticker) => {
    const resolved = resolveTickerPosition(ticker.section_position, pageType);
    return resolved === slotPosition;
  });
}

/** Human-readable labels for page types */
export const PAGE_TYPE_LABELS: Record<string, string> = {
  all: 'All Pages',
  home: 'Homepage',
  cms_pages: 'CMS Pages',
  products: 'Products',
  services: 'Services',
  areas: 'Service Areas',
  gallery: 'Gallery',
  cart: 'Cart',
  checkout: 'Checkout',
  account: 'Account',
};
