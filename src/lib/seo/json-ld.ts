import { SITE_URL, SITE_NAME } from '@/lib/utils/constants';
import { formatCurrency, phoneToE164 } from '@/lib/utils/format';
import type { BusinessInfo } from '@/lib/data/business';
import type { Service, ServiceCategory, Product, ProductCategory, ServicePricing } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function localBusinessReference(business: BusinessInfo) {
  return {
    '@type': 'AutoRepair',
    name: business.name,
    url: SITE_URL,
  };
}

// ---------------------------------------------------------------------------
// generateLocalBusinessSchema
// Returns a LocalBusiness (AutoRepair subtype) JSON-LD object.
// ---------------------------------------------------------------------------

export function generateLocalBusinessSchema(business: BusinessInfo) {
  return {
    '@context': 'https://schema.org',
    '@type': 'AutoRepair',
    name: business.name,
    url: SITE_URL,
    telephone: phoneToE164(business.phone),
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.streetAddress,
      addressLocality: business.city,
      addressRegion: business.state,
      postalCode: business.zip,
      addressCountry: 'US',
    },
    priceRange: '$$',
    areaServed: [
      {
        '@type': 'Place',
        name: 'South Bay',
      },
      {
        '@type': 'Place',
        name: 'Los Angeles',
      },
    ],
    sameAs: [],
  };
}

// ---------------------------------------------------------------------------
// generateServiceSchema
// Returns a Service JSON-LD object with optional pricing offers.
// ---------------------------------------------------------------------------

export function generateServiceSchema(
  service: Service & { service_pricing?: ServicePricing[] },
  category: ServiceCategory,
  business: BusinessInfo
) {
  const url = `${SITE_URL}/services/${category.slug}/${service.slug}`;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description ?? `${service.name} service at ${SITE_NAME}`,
    url,
    provider: localBusinessReference(business),
    category: category.name,
    areaServed: {
      '@type': 'Place',
      name: 'South Bay, Los Angeles',
    },
  };

  // Build offers from pricing data
  const offers = buildServiceOffers(service);
  if (offers) {
    schema.offers = offers;
  }

  return schema;
}

/**
 * Build Schema.org Offer(s) from a service's pricing information.
 * Returns a single Offer, an AggregateOffer, or null when pricing is unknown.
 */
function buildServiceOffers(
  service: Service & { service_pricing?: ServicePricing[] }
): Record<string, unknown> | null {
  const { pricing_model, flat_price, custom_starting_price, per_unit_price } = service;
  const pricingRows = service.service_pricing ?? [];

  // Flat rate -- single known price
  if (pricing_model === 'flat' && flat_price != null) {
    return {
      '@type': 'Offer',
      price: flat_price,
      priceCurrency: 'USD',
    };
  }

  // Per-unit pricing
  if (pricing_model === 'per_unit' && per_unit_price != null) {
    return {
      '@type': 'Offer',
      price: per_unit_price,
      priceCurrency: 'USD',
      description: service.per_unit_label
        ? `Per ${service.per_unit_label}`
        : 'Per unit',
    };
  }

  // Custom / quote-based -- show starting price if available
  if (pricing_model === 'custom' && custom_starting_price != null) {
    return {
      '@type': 'Offer',
      price: custom_starting_price,
      priceCurrency: 'USD',
      description: `Starting at ${formatCurrency(custom_starting_price)}`,
    };
  }

  // Tiered pricing (vehicle_size, scope, specialty) -- use pricing rows
  if (pricingRows.length > 0) {
    const prices = pricingRows.map((p) => p.price).filter((p) => p > 0);
    if (prices.length === 1) {
      return {
        '@type': 'Offer',
        price: prices[0],
        priceCurrency: 'USD',
      };
    }
    if (prices.length > 1) {
      return {
        '@type': 'AggregateOffer',
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        priceCurrency: 'USD',
        offerCount: prices.length,
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// generateProductSchema
// Returns a Product JSON-LD object with pricing and availability.
// ---------------------------------------------------------------------------

export function generateProductSchema(
  product: Product,
  category: ProductCategory
) {
  const url = `${SITE_URL}/products/${category.slug}/${product.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? `${product.name} available at ${SITE_NAME}`,
    url,
    image: product.image_url ?? undefined,
    sku: product.sku ?? undefined,
    brand: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    offers: {
      '@type': 'Offer',
      price: product.retail_price,
      priceCurrency: 'USD',
      availability: product.quantity_on_hand > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  };
}

// ---------------------------------------------------------------------------
// generateBreadcrumbSchema
// Returns a BreadcrumbList JSON-LD object from an ordered list of items.
// ---------------------------------------------------------------------------

export function generateBreadcrumbSchema(
  items: { name: string; url: string }[]
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
