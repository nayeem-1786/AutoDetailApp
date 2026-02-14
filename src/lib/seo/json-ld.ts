import { SITE_URL } from '@/lib/utils/constants';
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

interface ReviewData {
  rating?: string;
  count?: string;
}

export function generateLocalBusinessSchema(
  business: BusinessInfo,
  reviewData?: { google?: ReviewData; yelp?: ReviewData }
) {
  const schema: Record<string, unknown> = {
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
        '@type': 'GeoCircle',
        geoMidpoint: {
          '@type': 'GeoCoordinates',
          latitude: 33.7922,
          longitude: -118.3151,
        },
        geoRadius: '5 mi',
      },
      {
        '@type': 'Place',
        name: 'South Bay, Los Angeles',
      },
    ],
    sameAs: [],
  };

  // Add AggregateRating from Google reviews if available
  const gRating = parseFloat(reviewData?.google?.rating ?? '');
  const gCount = parseInt(reviewData?.google?.count ?? '', 10);
  if (!isNaN(gRating) && !isNaN(gCount) && gCount > 0) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: gRating.toFixed(1),
      reviewCount: gCount,
      bestRating: '5',
    };
  }

  return schema;
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
    description: service.description ?? `${service.name} service at ${business.name}`,
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
  category: ProductCategory,
  businessName: string
) {
  const url = `${SITE_URL}/products/${category.slug}/${product.slug}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description ?? `${product.name} available at ${businessName}`,
    url,
    image: product.image_url ?? undefined,
    sku: product.sku ?? undefined,
    brand: {
      '@type': 'Organization',
      name: businessName,
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
// generateServiceFaqSchema
// Returns a FAQPage JSON-LD object with common questions about a service.
// ---------------------------------------------------------------------------

export function generateServiceFaqSchema(
  service: Service & { service_pricing?: ServicePricing[] },
  categoryName: string,
  businessName: string
) {
  const serviceName = service.name;
  const mobileText = service.mobile_eligible
    ? `Yes, ${serviceName} is available as a mobile service. Our technicians will come to your home or office with all the equipment needed.`
    : `${serviceName} is currently offered at our shop location only. Please visit us for this service.`;

  // Build duration text
  let durationText = 'The duration varies based on vehicle size and condition.';
  if (service.base_duration_minutes > 0) {
    if (service.base_duration_minutes >= 60) {
      const hours = Math.floor(service.base_duration_minutes / 60);
      const mins = service.base_duration_minutes % 60;
      durationText = `${serviceName} typically takes about ${hours} hour${hours > 1 ? 's' : ''}${mins > 0 ? ` and ${mins} minutes` : ''}. Actual time may vary based on vehicle size and condition.`;
    } else {
      durationText = `${serviceName} typically takes about ${service.base_duration_minutes} minutes. Actual time may vary based on vehicle size and condition.`;
    }
  }

  // Build pricing answer
  let pricingAnswer = `Pricing for ${serviceName} depends on your vehicle and specific needs. Contact ${businessName} for a personalized quote.`;
  const offers = buildServiceOffers(service);
  if (offers) {
    if (offers['@type'] === 'AggregateOffer') {
      pricingAnswer = `${serviceName} ranges from ${formatCurrency(offers.lowPrice as number)} to ${formatCurrency(offers.highPrice as number)}, depending on vehicle size. Contact ${businessName} for exact pricing for your vehicle.`;
    } else if (offers.price != null) {
      const price = offers.price as number;
      if (offers.description && (offers.description as string).startsWith('Starting')) {
        pricingAnswer = `${serviceName} starts at ${formatCurrency(price)}. Final pricing depends on your vehicle's size and condition.`;
      } else {
        pricingAnswer = `${serviceName} is priced at ${formatCurrency(price)}. Contact ${businessName} for any additional details.`;
      }
    }
  }

  // Build description of what's included
  const includesAnswer = service.description
    ? `${service.description} For full details on what's included, visit our ${serviceName} page or contact us directly.`
    : `${serviceName} is a professional ${categoryName.toLowerCase()} service offered by ${businessName}. Contact us for full details on what's included.`;

  const questions = [
    {
      '@type': 'Question',
      name: `How much does ${serviceName} cost?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: pricingAnswer,
      },
    },
    {
      '@type': 'Question',
      name: `How long does ${serviceName} take?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: durationText,
      },
    },
    {
      '@type': 'Question',
      name: `Is ${serviceName} available as a mobile service?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: mobileText,
      },
    },
    {
      '@type': 'Question',
      name: `What's included in ${serviceName}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: includesAnswer,
      },
    },
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions,
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
