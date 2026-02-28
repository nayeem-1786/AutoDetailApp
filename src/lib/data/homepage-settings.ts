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
  heroTagline: string;
  ctaTitle: string;
  ctaDescription: string;
  ctaButtonText: string;
  servicesDescription: string;
  servicesPageDescription: string;
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
const DEFAULT_HERO_TAGLINE = 'Expert ceramic coatings, paint correction, and premium detailing. We bring showroom results directly to your doorstep.';
const DEFAULT_CTA_TITLE = 'Ready to Transform Your Vehicle?';
const DEFAULT_CTA_DESCRIPTION = 'Book your appointment today and experience the difference professional detailing makes.';
const DEFAULT_CTA_BUTTON_TEXT = 'Book Your Detail';
const DEFAULT_SERVICES_DESCRIPTION = 'From express washes to multi-year ceramic coating packages, we offer comprehensive auto detailing tailored to your vehicle\u2019s needs.';
const DEFAULT_SERVICES_PAGE_DESCRIPTION = 'From express washes to multi-year ceramic coating packages, our trained technicians deliver results you can see and feel.';

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
    'homepage_hero_tagline',
    'homepage_cta_title',
    'homepage_cta_description',
    'homepage_cta_button_text',
    'homepage_services_description',
    'services_page_description',
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
  const heroTagline = parseJsonString(map.get('homepage_hero_tagline')) || DEFAULT_HERO_TAGLINE;
  const ctaTitle = parseJsonString(map.get('homepage_cta_title')) || DEFAULT_CTA_TITLE;
  const ctaDescription = parseJsonString(map.get('homepage_cta_description')) || DEFAULT_CTA_DESCRIPTION;
  const ctaButtonText = parseJsonString(map.get('homepage_cta_button_text')) || DEFAULT_CTA_BUTTON_TEXT;
  const servicesDescription = parseJsonString(map.get('homepage_services_description')) || DEFAULT_SERVICES_DESCRIPTION;
  const servicesPageDescription = parseJsonString(map.get('services_page_description')) || DEFAULT_SERVICES_PAGE_DESCRIPTION;

  return {
    differentiators,
    googlePlaceId,
    ctaBeforeImage,
    ctaAfterImage,
    heroTagline,
    ctaTitle,
    ctaDescription,
    ctaButtonText,
    servicesDescription,
    servicesPageDescription,
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
