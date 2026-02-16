import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Page Content Extraction — builds text summaries for AI SEO context
// ---------------------------------------------------------------------------

/**
 * Master function — routes to the correct extractor based on page path.
 */
export async function extractPageContentByPath(pagePath: string): Promise<string> {
  // Service detail: /services/{catSlug}/{serviceSlug}
  const serviceDetailMatch = pagePath.match(/^\/services\/([^/]+)\/([^/]+)$/);
  if (serviceDetailMatch) {
    return extractServiceDetailContent(serviceDetailMatch[1], serviceDetailMatch[2]);
  }

  // Service category: /services/{catSlug}
  const serviceCatMatch = pagePath.match(/^\/services\/([^/]+)$/);
  if (serviceCatMatch) {
    return extractServiceCategoryContent(serviceCatMatch[1]);
  }

  // Services index
  if (pagePath === '/services') {
    return extractServicesIndexContent();
  }

  // Product detail: /products/{catSlug}/{productSlug}
  const productDetailMatch = pagePath.match(/^\/products\/([^/]+)\/([^/]+)$/);
  if (productDetailMatch) {
    return extractProductDetailContent(productDetailMatch[1], productDetailMatch[2]);
  }

  // Product category: /products/{catSlug}
  const productCatMatch = pagePath.match(/^\/products\/([^/]+)$/);
  if (productCatMatch) {
    return extractProductCategoryContent(productCatMatch[1]);
  }

  // Products index
  if (pagePath === '/products') {
    return extractProductsIndexContent();
  }

  // City landing page: /areas/{slug}
  const cityMatch = pagePath.match(/^\/areas\/([^/]+)$/);
  if (cityMatch) {
    return extractCityPageContent(cityMatch[1]);
  }

  // Homepage
  if (pagePath === '/') {
    return extractHomepageContent();
  }

  // Gallery
  if (pagePath === '/gallery') {
    return extractGalleryContent();
  }

  // Booking
  if (pagePath === '/book') {
    return extractBookingContent();
  }

  // Terms
  if (pagePath === '/terms') {
    return extractTermsContent();
  }

  // Fallback for unknown page types
  return `Page: ${pagePath}\nNo detailed content extraction available for this page type.`;
}

// ---------------------------------------------------------------------------
// Individual Extractors
// ---------------------------------------------------------------------------

async function getBusinessContext(): Promise<string> {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from('business_settings')
    .select('key, value')
    .in('key', ['business_name', 'business_phone', 'business_address', 'business_website', 'google_review_url']);

  const s: Record<string, unknown> = {};
  for (const row of settings ?? []) s[row.key] = row.value;

  const addr = typeof s.business_address === 'object' && s.business_address !== null
    ? s.business_address as { line1: string; city: string; state: string; zip: string }
    : { line1: '2021 Lomita Blvd', city: 'Lomita', state: 'CA', zip: '90717' };

  return [
    `Business: ${s.business_name || 'Smart Detail Auto Spa & Supplies'}`,
    `Location: ${addr.line1}, ${addr.city}, ${addr.state} ${addr.zip}`,
    `Phone: ${s.business_phone || ''}`,
    `Website: ${s.business_website || ''}`,
    s.google_review_url ? `Google Reviews: 5.0 stars` : '',
  ].filter(Boolean).join('\n');
}

async function extractHomepageContent(): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  // Fetch top services
  const { data: services } = await admin
    .from('services')
    .select('name, description, pricing_model, flat_price, custom_starting_price')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .order('display_order', { ascending: true })
    .limit(10);

  const serviceLines = (services ?? []).map(s => {
    const price = s.flat_price ? `$${s.flat_price}` : s.custom_starting_price ? `From $${s.custom_starting_price}` : '';
    return `- ${s.name}${price ? ` (${price})` : ''}`;
  }).join('\n');

  // Fetch service categories
  const { data: categories } = await admin
    .from('service_categories')
    .select('name, description')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const catLines = (categories ?? []).map(c => `- ${c.name}: ${c.description || ''}`).join('\n');

  return [
    `Page: Homepage`,
    `URL: /`,
    `Type: Homepage — main landing page`,
    '',
    bizCtx,
    '',
    `SERVICE CATEGORIES:`,
    catLines,
    '',
    `TOP SERVICES:`,
    serviceLines,
    '',
    `KEY FEATURES: Professional auto detailing, ceramic coatings, paint protection, interior detailing, mobile service available`,
    `UNIQUE SELLING POINTS: Ceramic Pro certified, 5.0 Google rating, mobile service, South Bay area`,
  ].join('\n');
}

async function extractServicesIndexContent(): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: categories } = await admin
    .from('service_categories')
    .select('name, description')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const catLines = (categories ?? []).map(c => `- ${c.name}: ${c.description || ''}`).join('\n');

  return [
    `Page: All Services`,
    `URL: /services`,
    `Type: Service Index — lists all service categories`,
    '',
    bizCtx,
    '',
    `SERVICE CATEGORIES:`,
    catLines,
  ].join('\n');
}

async function extractServiceCategoryContent(categorySlug: string): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: cat } = await admin
    .from('service_categories')
    .select('name, description')
    .eq('slug', categorySlug)
    .single();

  const { data: services } = await admin
    .from('services')
    .select('name, description, pricing_model, flat_price, custom_starting_price, base_duration_minutes, mobile_eligible')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .eq('category_id', (await admin.from('service_categories').select('id').eq('slug', categorySlug).single()).data?.id ?? '')
    .order('display_order', { ascending: true });

  const serviceLines = (services ?? []).map(s => {
    const price = s.flat_price ? `$${s.flat_price}` : s.custom_starting_price ? `From $${s.custom_starting_price}` : 'Contact for pricing';
    const duration = s.base_duration_minutes ? `${s.base_duration_minutes} min` : '';
    const mobile = s.mobile_eligible ? ' [Mobile Available]' : '';
    return `- ${s.name}: ${price}${duration ? ` (${duration})` : ''}${mobile}\n  ${s.description || ''}`;
  }).join('\n');

  return [
    `Page: ${cat?.name || categorySlug} — Service Category`,
    `URL: /services/${categorySlug}`,
    `Type: Service Category`,
    `Category Description: ${cat?.description || ''}`,
    '',
    bizCtx,
    '',
    `SERVICES IN THIS CATEGORY:`,
    serviceLines,
  ].join('\n');
}

async function extractServiceDetailContent(categorySlug: string, serviceSlug: string): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: svc } = await admin
    .from('services')
    .select(`
      name, description, pricing_model, flat_price, custom_starting_price,
      per_unit_price, per_unit_label, per_unit_max, mobile_eligible,
      base_duration_minutes,
      service_categories!inner(name, slug),
      pricing:service_pricing(tier_name, tier_label, price, vehicle_size_sedan_price,
        vehicle_size_truck_suv_price, vehicle_size_suv_van_price, is_vehicle_size_aware, display_order)
    `)
    .eq('slug', serviceSlug)
    .single();

  if (!svc) return `Page: Service not found (${serviceSlug})`;

  let pricingText = '';
  switch (svc.pricing_model) {
    case 'flat':
      pricingText = svc.flat_price != null ? `$${svc.flat_price}` : 'Contact for pricing';
      break;
    case 'custom':
      pricingText = svc.custom_starting_price != null ? `Starting at $${svc.custom_starting_price}+` : 'Contact for quote';
      break;
    case 'per_unit':
      pricingText = `$${svc.per_unit_price} per ${svc.per_unit_label || 'unit'}${svc.per_unit_max ? ` (max ${svc.per_unit_max})` : ''}`;
      break;
    case 'vehicle_size':
    case 'scope':
    case 'specialty': {
      const tiers = (svc.pricing as Array<{
        tier_name: string; tier_label: string | null; price: number;
        vehicle_size_sedan_price: number | null;
        vehicle_size_truck_suv_price: number | null;
        vehicle_size_suv_van_price: number | null;
        is_vehicle_size_aware: boolean;
        display_order: number;
      }>) || [];
      pricingText = tiers
        .sort((a, b) => a.display_order - b.display_order)
        .map(t => {
          const label = t.tier_label || t.tier_name;
          if (t.vehicle_size_sedan_price != null) {
            return `${label}: Sedan $${t.vehicle_size_sedan_price}, Truck/SUV $${t.vehicle_size_truck_suv_price}, SUV 3-Row/Van $${t.vehicle_size_suv_van_price}`;
          }
          return `${label}: $${t.price}`;
        })
        .join(' | ');
      break;
    }
    default:
      pricingText = 'Contact for pricing';
  }

  const catName = (svc.service_categories as unknown as { name: string; slug: string }).name;

  return [
    `Page: ${svc.name} — Service Detail`,
    `URL: /services/${categorySlug}/${serviceSlug}`,
    `Type: Service Detail`,
    `Category: ${catName}`,
    `Pricing: ${pricingText}`,
    `Duration: ${svc.base_duration_minutes ? `${svc.base_duration_minutes} minutes` : 'Varies'}`,
    `Mobile Service: ${svc.mobile_eligible ? 'Yes — we come to you' : 'In-shop only'}`,
    '',
    `DESCRIPTION:`,
    svc.description || 'No description available.',
    '',
    bizCtx,
  ].join('\n');
}

async function extractProductsIndexContent(): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: categories } = await admin
    .from('product_categories')
    .select('name, description')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  const catLines = (categories ?? []).map(c => `- ${c.name}: ${c.description || ''}`).join('\n');

  return [
    `Page: All Products`,
    `URL: /products`,
    `Type: Product Index — lists all product categories`,
    '',
    bizCtx,
    '',
    `PRODUCT CATEGORIES:`,
    catLines,
  ].join('\n');
}

async function extractProductCategoryContent(categorySlug: string): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: cat } = await admin
    .from('product_categories')
    .select('id, name, description')
    .eq('slug', categorySlug)
    .single();

  const { data: products } = await admin
    .from('products')
    .select('name, description, retail_price')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .eq('category_id', cat?.id ?? '')
    .order('name', { ascending: true })
    .limit(20);

  const productLines = (products ?? []).map(p => {
    const price = p.retail_price ? `$${Number(p.retail_price).toFixed(2)}` : '';
    return `- ${p.name}${price ? ` (${price})` : ''}\n  ${p.description ? p.description.substring(0, 100) : ''}`;
  }).join('\n');

  return [
    `Page: ${cat?.name || categorySlug} — Product Category`,
    `URL: /products/${categorySlug}`,
    `Type: Product Category`,
    `Category Description: ${cat?.description || ''}`,
    '',
    bizCtx,
    '',
    `PRODUCTS IN THIS CATEGORY:`,
    productLines,
  ].join('\n');
}

async function extractProductDetailContent(categorySlug: string, productSlug: string): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: prod } = await admin
    .from('products')
    .select('name, description, retail_price, sku, product_categories!inner(name, slug)')
    .eq('slug', productSlug)
    .single();

  if (!prod) return `Page: Product not found (${productSlug})`;

  const catName = (prod.product_categories as unknown as { name: string; slug: string }).name;

  return [
    `Page: ${prod.name} — Product Detail`,
    `URL: /products/${categorySlug}/${productSlug}`,
    `Type: Product Detail`,
    `Category: ${catName}`,
    `Price: ${prod.retail_price ? `$${Number(prod.retail_price).toFixed(2)}` : 'Contact for pricing'}`,
    `SKU: ${prod.sku || 'N/A'}`,
    '',
    `DESCRIPTION:`,
    prod.description || 'No description available.',
    '',
    bizCtx,
  ].join('\n');
}

async function extractCityPageContent(citySlug: string): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: city } = await admin
    .from('city_landing_pages')
    .select('city_name, intro_text, meta_title, meta_description, service_highlights')
    .eq('slug', citySlug)
    .single();

  if (!city) return `Page: City page not found (${citySlug})`;

  // Also fetch service list for context
  const { data: services } = await admin
    .from('services')
    .select('name')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .order('display_order', { ascending: true })
    .limit(10);

  const serviceNames = (services ?? []).map(s => s.name).join(', ');
  const highlights = Array.isArray(city.service_highlights) ? city.service_highlights.join(', ') : '';

  return [
    `Page: ${city.city_name} Auto Detailing — City Landing Page`,
    `URL: /areas/${citySlug}`,
    `Type: City/Area Landing Page (Local SEO)`,
    `Target City: ${city.city_name}`,
    '',
    `INTRO TEXT:`,
    city.intro_text || '',
    '',
    highlights ? `SERVICE HIGHLIGHTS: ${highlights}` : '',
    `AVAILABLE SERVICES: ${serviceNames}`,
    '',
    bizCtx,
    '',
    `LOCAL SEO INTENT: Users searching for auto detailing, ceramic coatings, or car care in ${city.city_name} and surrounding areas.`,
  ].join('\n');
}

async function extractGalleryContent(): Promise<string> {
  const bizCtx = await getBusinessContext();

  return [
    `Page: Photo Gallery`,
    `URL: /gallery`,
    `Type: Gallery — Before/after photos of completed work`,
    '',
    bizCtx,
    '',
    `CONTENT: Showcases before-and-after transformation photos of vehicles serviced.`,
    `Features paint correction, ceramic coating, interior detailing, and full detail results.`,
    `Organized by service type with before/after comparison sliders.`,
  ].join('\n');
}

async function extractBookingContent(): Promise<string> {
  const admin = createAdminClient();
  const bizCtx = await getBusinessContext();

  const { data: services } = await admin
    .from('services')
    .select('name')
    .eq('is_active', true)
    .eq('show_on_website', true)
    .order('display_order', { ascending: true })
    .limit(15);

  const serviceNames = (services ?? []).map(s => s.name).join(', ');

  return [
    `Page: Book an Appointment`,
    `URL: /book`,
    `Type: Booking — Online appointment scheduling`,
    '',
    bizCtx,
    '',
    `CONTENT: Multi-step booking wizard for scheduling auto detailing appointments.`,
    `Steps: Service selection → Vehicle details → Date & time → Payment → Confirmation.`,
    `Supports both in-shop and mobile (on-location) service.`,
    `BOOKABLE SERVICES: ${serviceNames}`,
  ].join('\n');
}

async function extractTermsContent(): Promise<string> {
  const bizCtx = await getBusinessContext();

  return [
    `Page: Terms & Conditions`,
    `URL: /terms`,
    `Type: Legal — Terms of service and policies`,
    '',
    bizCtx,
    '',
    `CONTENT: Terms of service, cancellation policy, liability, payment terms, privacy policy.`,
    `Standard legal page for the auto detailing business.`,
  ].join('\n');
}
