import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import type { Service, ServiceCategory, Product, ProductCategory } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// generateServiceMetadata
// Builds Next.js Metadata for an individual service page.
// ---------------------------------------------------------------------------

export function generateServiceMetadata(
  service: Service,
  category: ServiceCategory,
  businessName: string
): Metadata {
  const title = `${service.name} \u2014 ${category.name} | ${businessName}`;
  const description =
    service.description ??
    `Professional ${service.name.toLowerCase()} service in ${category.name.toLowerCase()} at ${businessName}.`;
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
      siteName: businessName,
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
  type: 'service' | 'product',
  businessName: string
): Metadata {
  const typeLabel = type === 'service' ? 'Services' : 'Products';
  const title = `${category.name} ${typeLabel} \u2014 ${businessName}`;
  const description =
    category.description ??
    `Browse our ${category.name.toLowerCase()} ${typeLabel.toLowerCase()} at ${businessName}.`;
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
      siteName: businessName,
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
  category: ProductCategory,
  businessName: string
): Metadata {
  const title = `${product.name} \u2014 ${category.name} | ${businessName}`;
  const description =
    product.description ??
    `${product.name} available in ${category.name.toLowerCase()} at ${businessName}.`;
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
      siteName: businessName,
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

export function generateBaseMetadata(businessName: string, description: string, overrides?: Partial<Metadata>): Metadata {
  return {
    title: businessName,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      title: businessName,
      description,
      url: SITE_URL,
      siteName: businessName,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: businessName,
      description,
    },
    ...overrides,
  };
}
