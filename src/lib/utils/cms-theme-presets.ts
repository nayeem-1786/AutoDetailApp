import type { ParticleEffect } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Seasonal Theme Presets
// Pre-built themes that admin can one-click apply and customize.
// ---------------------------------------------------------------------------

export interface ThemePreset {
  name: string;
  slug: string;
  description: string;
  colorOverrides: Record<string, string>;
  gradientOverrides: Record<string, string>;
  particleEffect: ParticleEffect | null;
  particleIntensity: number;
  particleColor: string | null;
  tickerMessage: string;
  tickerBgColor: string;
  tickerTextColor: string;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'Christmas',
    slug: 'christmas',
    description: 'Red and green holiday theme with snowfall',
    colorOverrides: {
      'brand-500': '#dc2626',
      'brand-600': '#b91c1c',
      'brand-700': '#991b1b',
      'accent-500': '#16a34a',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #991b1b 0%, #14532d 100%)',
    },
    particleEffect: 'snowfall',
    particleIntensity: 60,
    particleColor: '#ffffff',
    tickerMessage: 'Happy Holidays! Gift certificates available — the perfect gift for car lovers',
    tickerBgColor: '#991b1b',
    tickerTextColor: '#ffffff',
  },
  {
    name: 'Halloween',
    slug: 'halloween',
    description: 'Orange and purple spooky theme',
    colorOverrides: {
      'brand-500': '#ea580c',
      'brand-600': '#c2410c',
      'brand-700': '#9a3412',
      'accent-500': '#7c3aed',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #9a3412 0%, #581c87 100%)',
    },
    particleEffect: 'sparkles',
    particleIntensity: 40,
    particleColor: '#f97316',
    tickerMessage: 'Spooktacular October Special: 20% off interior detailing',
    tickerBgColor: '#9a3412',
    tickerTextColor: '#fed7aa',
  },
  {
    name: '4th of July',
    slug: '4th-of-july',
    description: 'Patriotic red, white, and blue with fireworks',
    colorOverrides: {
      'brand-500': '#2563eb',
      'brand-600': '#1d4ed8',
      'brand-700': '#1e3a8a',
      'accent-500': '#dc2626',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #1e3a8a 0%, #7f1d1d 100%)',
    },
    particleEffect: 'fireworks',
    particleIntensity: 50,
    particleColor: null,
    tickerMessage: 'Independence Day detailing special! Book this weekend',
    tickerBgColor: '#1e3a8a',
    tickerTextColor: '#ffffff',
  },
  {
    name: 'Memorial Day',
    slug: 'memorial-day',
    description: 'Navy and red patriotic theme',
    colorOverrides: {
      'brand-500': '#1e3a8a',
      'brand-600': '#172554',
      'brand-700': '#0f172a',
      'accent-500': '#dc2626',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #172554 0%, #7f1d1d 100%)',
    },
    particleEffect: 'stars',
    particleIntensity: 30,
    particleColor: '#fbbf24',
    tickerMessage: 'Memorial Day Weekend Sale — thank you for your service',
    tickerBgColor: '#172554',
    tickerTextColor: '#ffffff',
  },
  {
    name: "Presidents' Day",
    slug: 'presidents-day',
    description: 'Navy and gold theme',
    colorOverrides: {
      'brand-500': '#1e3a8a',
      'brand-600': '#172554',
      'brand-700': '#0f172a',
      'accent-500': '#ca8a04',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #172554 0%, #713f12 100%)',
    },
    particleEffect: 'stars',
    particleIntensity: 25,
    particleColor: '#fbbf24',
    tickerMessage: "Presidents' Day Special: 15% off ceramic coating this weekend",
    tickerBgColor: '#172554',
    tickerTextColor: '#fbbf24',
  },
  {
    name: "Valentine's Day",
    slug: 'valentines-day',
    description: 'Pink and rose theme with hearts',
    colorOverrides: {
      'brand-500': '#ec4899',
      'brand-600': '#db2777',
      'brand-700': '#be185d',
      'accent-500': '#f43f5e',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #be185d 0%, #881337 100%)',
    },
    particleEffect: 'hearts',
    particleIntensity: 40,
    particleColor: '#fda4af',
    tickerMessage: 'Show your car some love this Valentine\'s Day',
    tickerBgColor: '#be185d',
    tickerTextColor: '#fce7f3',
  },
  {
    name: 'Fall / Autumn',
    slug: 'fall-autumn',
    description: 'Warm amber and red with falling leaves',
    colorOverrides: {
      'brand-500': '#d97706',
      'brand-600': '#b45309',
      'brand-700': '#92400e',
      'accent-500': '#dc2626',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #92400e 0%, #7f1d1d 100%)',
    },
    particleEffect: 'leaves',
    particleIntensity: 45,
    particleColor: '#d97706',
    tickerMessage: 'Protect your paint before winter! Fall ceramic coating special',
    tickerBgColor: '#92400e',
    tickerTextColor: '#fef3c7',
  },
  {
    name: 'New Year',
    slug: 'new-year',
    description: 'Gold and black celebration with confetti',
    colorOverrides: {
      'brand-500': '#ca8a04',
      'brand-600': '#a16207',
      'brand-700': '#854d0e',
      'accent-500': '#eab308',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #0f172a 0%, #854d0e 100%)',
    },
    particleEffect: 'confetti',
    particleIntensity: 55,
    particleColor: null,
    tickerMessage: 'Start fresh — book your New Year detail today!',
    tickerBgColor: '#0f172a',
    tickerTextColor: '#fbbf24',
  },
];

/**
 * Get a theme preset by slug.
 */
export function getThemePreset(slug: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.slug === slug);
}
