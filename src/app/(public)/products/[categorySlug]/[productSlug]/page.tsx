import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Package } from 'lucide-react';
import { getProductBySlug, getAllProductsForSitemap } from '@/lib/data/products';
import { generateProductMetadata } from '@/lib/seo/metadata';
import { generateProductSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';

interface PageProps {
  params: Promise<{ categorySlug: string; productSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug, productSlug } = await params;
  const result = await getProductBySlug(categorySlug, productSlug);

  if (!result) {
    return { title: 'Product Not Found' };
  }

  return generateProductMetadata(result.product, result.category);
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

  // Build breadcrumb data for JSON-LD
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
      <JsonLd data={generateProductSchema(product, category)} />
      <JsonLd data={generateBreadcrumbSchema(breadcrumbItems)} />

      <article className="bg-white py-12 sm:py-16">
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
            <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Package className="h-24 w-24 text-gray-300" />
                </div>
              )}
            </div>

            {/* Right column: product details */}
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
                {product.name}
              </h1>

              <p className="mt-4 text-3xl font-bold text-gray-900">
                {formatCurrency(product.retail_price)}
              </p>

              {/* Availability */}
              <div className="mt-4">
                {inStock ? (
                  <span className="inline-flex items-center rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                    In Stock
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-700">
                    Out of Stock
                  </span>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <div className="mt-8">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Description
                  </h2>
                  <div className="mt-3 text-gray-600 leading-relaxed whitespace-pre-line">
                    {product.description}
                  </div>
                </div>
              )}

              {/* Product details */}
              <div className="mt-8 rounded-lg border border-gray-200 bg-gray-50 p-6">
                <h2 className="text-lg font-semibold text-gray-900">
                  Product Details
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {product.sku && (
                    <div className="flex justify-between">
                      <dt className="text-gray-500">SKU</dt>
                      <dd className="font-medium text-gray-900">
                        {product.sku}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Category</dt>
                    <dd className="font-medium text-gray-900">
                      {category.name}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Availability</dt>
                    <dd className="font-medium text-gray-900">
                      {inStock ? 'Available in store' : 'Currently unavailable'}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </article>

      <CtaSection
        title="Need professional application?"
        description="Our technicians can apply this product as part of a detailing service. Book an appointment or call us to learn more."
      />
    </>
  );
}
