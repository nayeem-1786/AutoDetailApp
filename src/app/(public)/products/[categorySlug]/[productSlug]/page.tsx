import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { getProductBySlug, getAllProductsForSitemap } from '@/lib/data/products';
import { getBusinessInfo } from '@/lib/data/business';
import { generateProductMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { generateProductSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';
import { AdZone } from '@/components/public/cms/ad-zone';
import { ProductAddToCart } from '@/components/public/cart/product-add-to-cart';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug, productSlug } = await params;
  const result = await getProductBySlug(categorySlug, productSlug);

  if (!result) {
    return { title: 'Product Not Found' };
  }

  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo(`/products/${categorySlug}/${productSlug}`),
  ]);
  return mergeMetadata(
    generateProductMetadata(result.product, result.category, businessInfo.name),
    seoOverrides
  );
}

export async function generateStaticParams() {
  const products = await getAllProductsForSitemap();
  return products.map((prod) => ({
    categorySlug: prod.categorySlug,
    productSlug: prod.productSlug,
  }));
}

export default async function ProductDetailPage({ params }: PageProps) {
  const { categorySlug, productSlug } = await params;
  const result = await getProductBySlug(categorySlug, productSlug);

  if (!result) {
    notFound();
  }

  const { product, category } = result;
  const businessInfo = await getBusinessInfo();

  const breadcrumbItems = [
    { name: 'Home', url: SITE_URL },
    { name: 'Products', url: `${SITE_URL}/products` },
    { name: category.name, url: `${SITE_URL}/products/${category.slug}` },
    {
      name: product.name,
      url: `${SITE_URL}/products/${category.slug}/${product.slug}`,
    },
  ];

  const inStock = product.quantity_on_hand > 0;

  return (
    <>
      <JsonLd data={generateProductSchema(product, category, businessInfo.name)} />
      <JsonLd data={generateBreadcrumbSchema(breadcrumbItems)} />

      <article className="bg-brand-dark py-8 sm:py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Products', href: '/products' },
              { label: category.name, href: `/products/${category.slug}` },
              { label: product.name },
            ]}
          />

          <div className="mt-2 grid gap-10 lg:grid-cols-2">
            {/* Left column: product image */}
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-brand-surface border border-site-border">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.image_alt ?? `${product.name} - ${businessInfo.name}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-24 w-24 text-site-text-faint" />
                </div>
              )}
            </div>

            {/* Right column: product details */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <h1 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                {product.name}
              </h1>

              <p className="mt-4 font-display text-3xl font-bold text-lime">
                {formatCurrency(product.retail_price)}
              </p>

              {/* Availability */}
              <div className="mt-4">
                {product.quantity_on_hand > 5 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-950 px-3 py-1 text-sm font-medium text-green-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    In Stock
                  </span>
                ) : product.quantity_on_hand > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 px-3 py-1 text-sm font-medium text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Low Stock ({product.quantity_on_hand} left)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950 px-3 py-1 text-sm font-medium text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                    Out of Stock
                  </span>
                )}
              </div>

              {/* Add to Cart */}
              <ProductAddToCart
                product={{
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  categorySlug: category.slug,
                  price: product.retail_price,
                  stockQuantity: product.quantity_on_hand,
                  imageUrl: product.image_url,
                }}
              />

              {/* Description */}
              {product.description && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    Description
                  </h2>
                  <div className="mt-3 text-site-text-muted leading-relaxed whitespace-pre-line">
                    {product.description}
                  </div>
                </div>
              )}

              {/* Product details */}
              <div className="mt-8 rounded-2xl bg-brand-surface border border-site-border p-6">
                <h2 className="font-display text-lg font-semibold text-site-text">
                  Product Details
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {product.sku && (
                    <div className="flex justify-between">
                      <dt className="text-site-text-muted">SKU</dt>
                      <dd className="font-medium text-site-text">
                        {product.sku}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-site-text-muted">Category</dt>
                    <dd className="font-medium text-site-text">
                      {category.name}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-site-text-muted">Availability</dt>
                    <dd className="font-medium text-site-text">
                      {inStock ? 'Available in store' : 'Currently unavailable'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          <Suspense fallback={null}><AdZone zoneId="sidebar" pagePath={`/products/${categorySlug}/${productSlug}`} className="mt-8" /></Suspense>
        </div>
      </article>

      <CtaSection
        title="Need professional application?"
        description="Our technicians can apply this product as part of a detailing service. Book an appointment or call us to learn more."
      />
    </>
  );
}
