import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/utils/constants';
import type { Service, ServiceCategory, Product, ProductCategory } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// generateServiceMetadata
// Builds Next.js Metadata for an individual service page.
// ---------------------------------------------------------------------------

export function generateServiceMetadata(
  service: Service,
  category: ServiceCategory
): Metadata {
  const title = `${service.name} \u2014 ${category.name} | ${SITE_NAME}`;
  const description =
    service.description ??
    `Professional ${service.name.toLowerCase()} service in ${category.name.toLowerCase()} at ${SITE_NAME}. Serving Lomita and the South Bay area.`;
  const url = `${SITE_URL}/services/${category.slug}/${service.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// generateCategoryMetadata
// Builds Next.js Metadata for a service or product category listing page.
// ---------------------------------------------------------------------------

export function generateCategoryMetadata(
  category: ServiceCategory | ProductCategory,
  type: 'service' | 'product'
): Metadata {
  const typeLabel = type === 'service' ? 'Services' : 'Products';
  const title = `${category.name} ${typeLabel} \u2014 ${SITE_NAME}`;
  const description =
    category.description ??
    `Browse our ${category.name.toLowerCase()} ${typeLabel.toLowerCase()} at ${SITE_NAME}. Serving Lomita and the South Bay area.`;
  const slug = type === 'service' ? 'services' : 'products';
  const url = `${SITE_URL}/${slug}/${category.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };
}

// ---------------------------------------------------------------------------
// generateProductMetadata
// Builds Next.js Metadata for an individual product page.
// ---------------------------------------------------------------------------

export function generateProductMetadata(
  product: Product,
  category: ProductCategory
): Metadata {
  const title = `${product.name} \u2014 ${category.name} | ${SITE_NAME}`;
  const description =
    product.description ??
    `${product.name} available in ${category.name.toLowerCase()} at ${SITE_NAME}. Serving Lomita and the South Bay area.`;
  const url = `${SITE_URL}/products/${category.slug}/${product.slug}`;

  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };

  if (product.image_url) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ url: product.image_url, alt: product.name }],
    };
  }

  return metadata;
}

// ---------------------------------------------------------------------------
// generateBaseMetadata
// Default Metadata for the site root / fallback pages.
// ---------------------------------------------------------------------------

export function generateBaseMetadata(overrides?: Partial<Metadata>): Metadata {
  return {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      siteName: SITE_NAME,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
    },
    ...overrides,
  };
}
