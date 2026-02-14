import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import type { CityLandingPage } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// City Landing Page Data
// ---------------------------------------------------------------------------

async function getSupabase() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

/**
 * Get all active city landing pages, sorted by sort_order.
 */
export const getActiveCities = cache(async (): Promise<CityLandingPage[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('city_landing_pages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as CityLandingPage[];
});

/**
 * Get a single city landing page by slug.
 */
export const getCityBySlug = cache(async (slug: string): Promise<CityLandingPage | null> => {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from('city_landing_pages')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  return data as CityLandingPage | null;
});
