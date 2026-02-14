import { createAdminClient } from '@/lib/supabase/admin';
import type { PageSeoType } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Known Public Pages — generates the full list of indexable pages
// ---------------------------------------------------------------------------

export interface KnownPage {
  path: string;
  page_type: PageSeoType;
  title: string;
}

const STATIC_PAGES: KnownPage[] = [
  { path: '/', page_type: 'homepage', title: 'Homepage' },
  { path: '/services', page_type: 'service_category', title: 'Services' },
  { path: '/products', page_type: 'product_category', title: 'Products' },
  { path: '/gallery', page_type: 'gallery', title: 'Gallery' },
  { path: '/book', page_type: 'booking', title: 'Book an Appointment' },
  { path: '/terms', page_type: 'custom', title: 'Terms & Conditions' },
];

/**
 * Generates the full list of all known public pages.
 * Includes static pages + dynamic pages from DB (services, products, city pages).
 */
export async function getKnownPages(): Promise<KnownPage[]> {
  const admin = createAdminClient();
  const pages: KnownPage[] = [...STATIC_PAGES];

  // Service categories: /services/{slug}
  const { data: serviceCategories } = await admin
    .from('service_categories')
    .select('slug, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (serviceCategories) {
    for (const cat of serviceCategories) {
      pages.push({
        path: `/services/${cat.slug}`,
        page_type: 'service_category',
        title: cat.name,
      });
    }
  }

  // Services: /services/{categorySlug}/{serviceSlug}
  const { data: services } = await admin
    .from('services')
    .select('slug, name, service_categories!inner(slug)')
    .eq('is_active', true)
    .eq('show_on_website', true);

  if (services) {
    for (const svc of services) {
      const catSlug = (svc.service_categories as unknown as { slug: string }).slug;
      pages.push({
        path: `/services/${catSlug}/${svc.slug}`,
        page_type: 'service_detail',
        title: svc.name,
      });
    }
  }

  // Product categories: /products/{slug}
  const { data: productCategories } = await admin
    .from('product_categories')
    .select('slug, name')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (productCategories) {
    for (const cat of productCategories) {
      pages.push({
        path: `/products/${cat.slug}`,
        page_type: 'product_category',
        title: cat.name,
      });
    }
  }

  // Products: /products/{categorySlug}/{productSlug}
  const { data: products } = await admin
    .from('products')
    .select('slug, name, product_categories!inner(slug)')
    .eq('is_active', true)
    .eq('show_on_website', true);

  if (products) {
    for (const prod of products) {
      const catSlug = (prod.product_categories as unknown as { slug: string }).slug;
      pages.push({
        path: `/products/${catSlug}/${prod.slug}`,
        page_type: 'product_detail',
        title: prod.name,
      });
    }
  }

  // City landing pages: /areas/{slug}
  const { data: cities } = await admin
    .from('city_landing_pages')
    .select('slug, city_name')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (cities) {
    for (const city of cities) {
      pages.push({
        path: `/areas/${city.slug}`,
        page_type: 'city_landing',
        title: `${city.city_name} Auto Detailing`,
      });
    }
  }

  return pages;
}
