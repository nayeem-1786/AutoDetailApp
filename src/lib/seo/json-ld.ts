import { SITE_URL } from '@/lib/utils/constants';
// formatCurrency (dollars-input) survives the Money-Unify epic; used by
// the FAQ pricingAnswer strings below which receive dollar offers from
// the JSON-LD Offer object. formatMoney (cents-input) is used inside the
// Offer-building path which holds cents internally.
import { formatCurrency, formatMoney, phoneToE164 } from '@/lib/utils/format';
import { fromCents } from '@/lib/utils/money';
import type { BusinessInfo, SeoSettings } from '@/lib/data/business';
import type { Service, ServiceCategory, Product, ProductCategory, ServicePricing } from '@/lib/supabase/types';
import type { ProductSpecs } from '@/lib/utils/validation';
import type { ProductVariant } from '@/lib/data/products';

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
  reviewData?: { google?: ReviewData; yelp?: ReviewData },
  seo?: SeoSettings
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
    priceRange: seo?.priceRange ?? '$$',
    areaServed: [
      {
        '@type': 'GeoCircle',
        geoMidpoint: {
          '@type': 'GeoCoordinates',
          latitude: seo?.latitude ?? 33.7922,
          longitude: seo?.longitude ?? -118.3151,
        },
        geoRadius: seo?.serviceAreaRadius ?? '5 mi',
      },
      {
        '@type': 'Place',
        name: seo?.serviceAreaName ?? 'South Bay, Los Angeles',
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
  business: BusinessInfo,
  seo?: SeoSettings
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
      name: seo?.serviceAreaName ?? 'South Bay, Los Angeles',
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
  // Schema.org Offer.price_cents expects decimal dollars; convert from canonical
  // cents at the JSON-LD boundary via fromCents().
  const { pricing_model, flat_price_cents, custom_starting_price_cents, per_unit_price_cents } = service;
  const pricingRows = service.service_pricing ?? [];

  // Flat rate -- single known price
  if (pricing_model === 'flat' && flat_price_cents != null) {
    return {
      '@type': 'Offer',
      price: fromCents(flat_price_cents),
      priceCurrency: 'USD',
    };
  }

  // Per-unit pricing
  if (pricing_model === 'per_unit' && per_unit_price_cents != null) {
    return {
      '@type': 'Offer',
      price: fromCents(per_unit_price_cents),
      priceCurrency: 'USD',
      description: service.per_unit_label
        ? `Per ${service.per_unit_label}`
        : 'Per unit',
    };
  }

  // Custom / quote-based -- show starting price if available
  if (pricing_model === 'custom' && custom_starting_price_cents != null) {
    return {
      '@type': 'Offer',
      price: fromCents(custom_starting_price_cents),
      priceCurrency: 'USD',
      description: `Starting at ${formatMoney(custom_starting_price_cents)}`,
    };
  }

  // Tiered pricing (vehicle_size, scope, specialty) -- use pricing rows
  if (pricingRows.length > 0) {
    const priceCentsList = pricingRows
      .map((p) => p.price_cents)
      .filter((p): p is number => p != null && p > 0);
    if (priceCentsList.length === 1) {
      return {
        '@type': 'Offer',
        price: fromCents(priceCentsList[0]),
        priceCurrency: 'USD',
      };
    }
    if (priceCentsList.length > 1) {
      return {
        '@type': 'AggregateOffer',
        lowPrice: fromCents(Math.min(...priceCentsList)),
        highPrice: fromCents(Math.max(...priceCentsList)),
        priceCurrency: 'USD',
        offerCount: priceCentsList.length,
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
  businessName: string,
  variants?: ProductVariant[],
  vendorName?: string
) {
  const url = `${SITE_URL}/products/${category.slug}/${product.slug}`;
  const specs = product.specs as ProductSpecs | undefined;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: specs?.overview || product.description || `${product.name} available at ${businessName}`,
    url,
    image: product.image_url ?? undefined,
    sku: product.sku ?? undefined,
    ...(product.barcode ? { gtin: product.barcode } : {}),
    brand: {
      '@type': 'Organization',
      name: vendorName || businessName,
    },
    offers: {
      '@type': 'Offer',
      // Schema.org Offer.price_cents expects decimal dollars; convert from cents.
      price: product.retail_price_cents != null ? fromCents(product.retail_price_cents) : 0,
      priceCurrency: 'USD',
      availability: product.quantity_on_hand > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
  };

  // Add spec fields as additionalProperty when populated
  const properties: Array<{ '@type': string; name: string; value: string }> = [];
  if (specs?.size_volume) properties.push({ '@type': 'PropertyValue', name: 'Size', value: specs.size_volume });
  if (specs?.dilution_ratio) properties.push({ '@type': 'PropertyValue', name: 'Dilution Ratio', value: specs.dilution_ratio });
  if (specs?.coverage_yield) properties.push({ '@type': 'PropertyValue', name: 'Coverage', value: specs.coverage_yield });
  if (specs?.application_method) properties.push({ '@type': 'PropertyValue', name: 'Application Method', value: specs.application_method });
  if (specs?.scent) properties.push({ '@type': 'PropertyValue', name: 'Scent', value: specs.scent });
  if (properties.length > 0) {
    schema.additionalProperty = properties;
  }

  // Link variant siblings via isSimilarTo
  if (variants && variants.length > 0) {
    schema.isSimilarTo = variants.map((v) => ({
      '@type': 'Product',
      name: v.name,
      url: `${SITE_URL}/products/${v.categorySlug}/${v.slug}`,
    }));
  }

  return schema;
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
    } else if (offers.price_cents != null) {
      const price = offers.price_cents as number;
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
