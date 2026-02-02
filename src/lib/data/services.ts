import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';
import type {
  Service,
  ServiceCategory,
  ServicePricing,
  ServiceAddonSuggestion,
} from '@/lib/supabase/types';

// Helper: create a Supabase client that works in both request and build contexts.
// During runtime (SSR), uses the cookie-based server client.
// During build (generateStaticParams, sitemap), falls back to the anon client.
async function getClient() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

// ---------------------------------------------------------------------------
// Types for returned data shapes
// ---------------------------------------------------------------------------

export interface ServiceWithPricing extends Service {
  service_pricing: ServicePricing[];
  service_categories: ServiceCategory;
}

export interface ServiceWithFullDetails extends Service {
  service_pricing: ServicePricing[];
  service_categories: ServiceCategory;
  service_addon_suggestions: (ServiceAddonSuggestion & {
    addon_service: Pick<
      Service,
      | 'id'
      | 'name'
      | 'slug'
      | 'description'
      | 'pricing_model'
      | 'flat_price'
      | 'custom_starting_price'
    >;
  })[];
}

export interface ServiceCategoryWithServices {
  category: ServiceCategory;
  services: ServiceWithPricing[];
}

export interface ServiceWithCategory {
  service: ServiceWithFullDetails;
  category: ServiceCategory;
}

export interface SitemapService {
  serviceSlug: string;
  categorySlug: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// getServiceCategories
// All active service categories ordered by display_order.
// ---------------------------------------------------------------------------

export async function getServiceCategories(): Promise<ServiceCategory[]> {
  const supabase = await getClient();

  const { data, error } = await supabase
    .from('service_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching service categories:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------------------------------------------------------------------------
// getServicesByCategory
// All active services (with pricing) belonging to a category identified by slug.
// Returns the category and its services, or null if the category is not found.
// ---------------------------------------------------------------------------

export async function getServicesByCategory(
  categorySlug: string
): Promise<ServiceCategoryWithServices | null> {
  const supabase = await getClient();

  // 1. Look up the category by slug
  const { data: category, error: catError } = await supabase
    .from('service_categories')
    .select('*')
    .eq('slug', categorySlug)
    .eq('is_active', true)
    .single();

  if (catError || !category) {
    // Not found or DB error
    return null;
  }

  // 2. Fetch services for this category with pricing + category data
  const { data: services, error: svcError } = await supabase
    .from('services')
    .select(
      '*, service_pricing(*), service_categories!inner(*)'
    )
    .eq('category_id', category.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (svcError) {
    console.error('Error fetching services by category:', svcError.message);
    return { category, services: [] };
  }

  // Sort pricing rows within each service by display_order
  const servicesWithSortedPricing = (services ?? []).map((service) => ({
    ...service,
    service_pricing: [...(service.service_pricing ?? [])].sort(
      (a: ServicePricing, b: ServicePricing) => a.display_order - b.display_order
    ),
  })) as ServiceWithPricing[];

  return { category, services: servicesWithSortedPricing };
}

// ---------------------------------------------------------------------------
// getServiceBySlug
// Fetch a single service by its slug, verifying it belongs to the category
// identified by categorySlug. Returns full details including pricing and
// addon suggestions (with the addon service joined).
// ---------------------------------------------------------------------------

export async function getServiceBySlug(
  categorySlug: string,
  serviceSlug: string
): Promise<ServiceWithCategory | null> {
  const supabase = await getClient();

  // Use an inner join on service_categories so we can filter by category slug
  // directly in a single query.
  const { data: service, error } = await supabase
    .from('services')
    .select(
      `*,
      service_pricing(*),
      service_categories!inner(*),
      service_addon_suggestions!service_addon_suggestions_primary_service_id_fkey(
        *,
        addon_service:services!service_addon_suggestions_addon_service_id_fkey(
          id, name, slug, description, pricing_model, flat_price, custom_starting_price
        )
      )`
    )
    .eq('slug', serviceSlug)
    .eq('is_active', true)
    .eq('service_categories.slug', categorySlug)
    .eq('service_categories.is_active', true)
    .single();

  if (error || !service) {
    return null;
  }

  // Sort pricing by display_order
  const sortedService = {
    ...service,
    service_pricing: [...(service.service_pricing ?? [])].sort(
      (a: ServicePricing, b: ServicePricing) => a.display_order - b.display_order
    ),
    service_addon_suggestions: [...(service.service_addon_suggestions ?? [])].sort(
      (a: { display_order: number }, b: { display_order: number }) =>
        a.display_order - b.display_order
    ),
  } as ServiceWithFullDetails;

  return {
    service: sortedService,
    category: sortedService.service_categories,
  };
}

// ---------------------------------------------------------------------------
// getAllServicesForSitemap
// Minimal data for generating the sitemap: service slug, category slug, and
// the last-updated timestamp.
// ---------------------------------------------------------------------------

export async function getAllServicesForSitemap(): Promise<SitemapService[]> {
  const supabase = await getClient();

  const { data, error } = await supabase
    .from('services')
    .select(
      'slug, updated_at, service_categories!inner(slug)'
    )
    .eq('is_active', true)
    .eq('service_categories.is_active', true);

  if (error) {
    console.error('Error fetching services for sitemap:', error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    serviceSlug: row.slug as string,
    categorySlug: (row.service_categories as unknown as { slug: string }).slug,
    updatedAt: row.updated_at as string,
  }));
}
