import type { ParticleEffect } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Seasonal Theme Presets
// Pre-built themes that admin can one-click apply and customize.
//
// colorOverrides keys map to Tailwind v4 color tokens via ThemeProvider:
//   'lime' → --color-lime → bg-lime, text-lime, border-lime, etc.
//   'lime-200' → --color-lime-200 → bg-lime-200, text-lime-200, etc.
//   'brand-dark' → --color-brand-dark → bg-brand-dark, etc.
//   'accent-glow-rgb' → --theme-accent-glow-rgb (shadows/glows)
// ---------------------------------------------------------------------------

export interface ThemePreset {
  name: string;
  slug: string;
  description: string;
  colorOverrides: Record<string, string>;
  gradientOverrides: Record<string, string>;
  bodyBgColor: string;
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
      // Accent: festive red
      'lime': '#dc2626',
      'lime-50': '#fef2f2',
      'lime-100': '#fee2e2',
      'lime-200': '#fca5a5',
      'lime-300': '#f87171',
      'lime-400': '#ef4444',
      'lime-500': '#b91c1c',
      'lime-600': '#991b1b',
      // Surfaces: deep evergreen tint
      'brand-dark': '#0a1a0a',
      'brand-surface': '#1a2a1a',
      'accent-glow-rgb': '220, 38, 38',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #991b1b 0%, #14532d 100%)',
    },
    bodyBgColor: '#050f05',
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
      'lime': '#ea580c',
      'lime-50': '#fff7ed',
      'lime-100': '#ffedd5',
      'lime-200': '#fed7aa',
      'lime-300': '#fdba74',
      'lime-400': '#fb923c',
      'lime-500': '#c2410c',
      'lime-600': '#9a3412',
      'brand-dark': '#1a0a1a',
      'brand-surface': '#2a1a2a',
      'accent-glow-rgb': '234, 88, 12',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #9a3412 0%, #581c87 100%)',
    },
    bodyBgColor: '#0f050f',
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
      'lime': '#3b82f6',
      'lime-50': '#eff6ff',
      'lime-100': '#dbeafe',
      'lime-200': '#bfdbfe',
      'lime-300': '#93c5fd',
      'lime-400': '#60a5fa',
      'lime-500': '#2563eb',
      'lime-600': '#1d4ed8',
      'brand-dark': '#0a0a1a',
      'brand-surface': '#1a1a2a',
      'accent-glow-rgb': '59, 130, 246',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #1e3a8a 0%, #7f1d1d 100%)',
    },
    bodyBgColor: '#05050f',
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
      // Changed from #1e40af (dark navy, 2.3:1 on black) to #60a5fa
      // (blue-400, 8.6:1 on black) for readability on dark backgrounds
      'lime': '#60a5fa',
      'lime-50': '#eff6ff',
      'lime-100': '#dbeafe',
      'lime-200': '#bfdbfe',
      'lime-300': '#93c5fd',
      'lime-400': '#60a5fa',
      'lime-500': '#3b82f6',
      'lime-600': '#2563eb',
      'brand-dark': '#0a0a14',
      'brand-surface': '#1a1a2a',
      'accent-glow-rgb': '96, 165, 250',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #172554 0%, #7f1d1d 100%)',
    },
    bodyBgColor: '#05050a',
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
      'lime': '#ca8a04',
      'lime-50': '#fefce8',
      'lime-100': '#fef9c3',
      'lime-200': '#fef08a',
      'lime-300': '#fde047',
      'lime-400': '#facc15',
      'lime-500': '#a16207',
      'lime-600': '#854d0e',
      'brand-dark': '#0a0a0f',
      'brand-surface': '#1a1a24',
      'accent-glow-rgb': '202, 138, 4',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #172554 0%, #713f12 100%)',
    },
    bodyBgColor: '#050508',
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
      // Accent: hot pink
      'lime': '#ec4899',
      'lime-50': '#fdf2f8',
      'lime-100': '#fce7f3',
      'lime-200': '#fbcfe8',
      'lime-300': '#f9a8d4',
      'lime-400': '#f472b6',
      'lime-500': '#db2777',
      'lime-600': '#be185d',
      // Surfaces: warm rose-tinted dark
      'brand-dark': '#120a10',
      'brand-surface': '#1f1019',
      'accent-glow-rgb': '236, 72, 153',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #be185d 0%, #881337 100%)',
    },
    bodyBgColor: '#0a0508',
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
      'lime': '#d97706',
      'lime-50': '#fffbeb',
      'lime-100': '#fef3c7',
      'lime-200': '#fde68a',
      'lime-300': '#fcd34d',
      'lime-400': '#fbbf24',
      'lime-500': '#b45309',
      'lime-600': '#92400e',
      'brand-dark': '#120a05',
      'brand-surface': '#1f1a10',
      'accent-glow-rgb': '217, 119, 6',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #92400e 0%, #7f1d1d 100%)',
    },
    bodyBgColor: '#0a0503',
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
      'lime': '#eab308',
      'lime-50': '#fefce8',
      'lime-100': '#fef9c3',
      'lime-200': '#fef08a',
      'lime-300': '#fde047',
      'lime-400': '#facc15',
      'lime-500': '#ca8a04',
      'lime-600': '#a16207',
      'brand-dark': '#0a0a05',
      'brand-surface': '#1a1a10',
      'accent-glow-rgb': '234, 179, 8',
    },
    gradientOverrides: {
      hero: 'linear-gradient(135deg, #0f172a 0%, #854d0e 100%)',
    },
    bodyBgColor: '#050503',
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
