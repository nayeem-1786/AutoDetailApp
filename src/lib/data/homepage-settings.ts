import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Homepage Settings — Data Access Layer
// ---------------------------------------------------------------------------

export interface Differentiator {
  icon: string;
  title: string;
  description: string;
}

export interface HomepageSettings {
  differentiators: Differentiator[];
  googlePlaceId: string;
  ctaBeforeImage: string;
  ctaAfterImage: string;
}

// Fallback defaults — used when business_settings keys are missing
const DEFAULT_DIFFERENTIATORS: Differentiator[] = [
  {
    icon: 'Truck',
    title: 'Mobile Service',
    description: 'We come to your home or office throughout the South Bay area.',
  },
  {
    icon: 'Shield',
    title: 'Ceramic Pro Certified',
    description: 'Professional-grade coatings for lasting protection.',
  },
  {
    icon: 'Leaf',
    title: 'Eco-Friendly Products',
    description: 'Premium products that are safe for your vehicle and the environment.',
  },
];

const DEFAULT_GOOGLE_PLACE_ID = 'ChIJf7qNDhW1woAROX-FX8CScGE';
const DEFAULT_CTA_BEFORE_IMAGE = '/images/before-after-old.webp';
const DEFAULT_CTA_AFTER_IMAGE = '/images/before-after-new.webp';

/**
 * Read homepage settings from business_settings table.
 * Returns typed object with fallback defaults for every field.
 */
export const getHomepageSettings = cache(async (): Promise<HomepageSettings> => {
  const supabase = createAdminClient();

  const keys = [
    'homepage_differentiators',
    'google_place_id',
    'homepage_cta_before_image',
    'homepage_cta_after_image',
  ];

  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', keys);

  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.key, row.value);
  }

  // Parse differentiators
  let differentiators = DEFAULT_DIFFERENTIATORS;
  const diffRaw = map.get('homepage_differentiators');
  if (diffRaw) {
    try {
      const parsed = JSON.parse(diffRaw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        differentiators = parsed.map((d: Record<string, unknown>) => ({
          icon: (d.icon as string) || 'Star',
          title: (d.title as string) || '',
          description: (d.description as string) || '',
        }));
      }
    } catch { /* use defaults */ }
  }

  // Parse string settings
  const googlePlaceId = parseJsonString(map.get('google_place_id')) || DEFAULT_GOOGLE_PLACE_ID;
  const ctaBeforeImage = parseJsonString(map.get('homepage_cta_before_image')) || DEFAULT_CTA_BEFORE_IMAGE;
  const ctaAfterImage = parseJsonString(map.get('homepage_cta_after_image')) || DEFAULT_CTA_AFTER_IMAGE;

  return {
    differentiators,
    googlePlaceId,
    ctaBeforeImage,
    ctaAfterImage,
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonString(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed.trim() : null;
  } catch {
    return null;
  }
}
