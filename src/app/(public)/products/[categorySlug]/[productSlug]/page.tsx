import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Package, Clock, Lightbulb } from 'lucide-react';
import { getProductBySlug, getProductVariants, getAllProductsForSitemap } from '@/lib/data/products';
import { getBusinessInfo } from '@/lib/data/business';
import { generateProductMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { generateProductSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL } from '@/lib/utils/constants';
import { formatMoney } from '@/lib/utils/format';
import { getSaleStatus, getTierSaleInfo, getSaleEndDescription, isEndingSoon } from '@/lib/utils/sale-pricing';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { SectionTickerSlot } from '@/components/public/cms/section-ticker-slot';
import { JsonLd } from '@/components/public/json-ld';
import { AdZone } from '@/components/public/cms/ad-zone';
import { getCmsToggles } from '@/lib/data/cms';
import { ProductAddToCart } from '@/components/public/cart/product-add-to-cart';
import type { ProductSpecs } from '@/lib/utils/validation';

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
  const specs = product.specs as ProductSpecs | undefined;

  const [businessInfo, cmsToggles, variants] = await Promise.all([
    getBusinessInfo(),
    getCmsToggles(),
    getProductVariants(product.product_group_id, product.id),
  ]);

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

  // Build spec rows for the specifications table — only include populated fields
  const specRows: Array<{ label: string; value: string | string[] }> = [];
  if (specs?.size_volume) specRows.push({ label: 'Size / Volume', value: specs.size_volume });
  if (specs?.application_method) specRows.push({ label: 'Application Method', value: specs.application_method });
  if (specs?.dilution_ratio) specRows.push({ label: 'Dilution Ratio', value: specs.dilution_ratio });
  if (specs?.coverage_yield) specRows.push({ label: 'Coverage / Yield', value: specs.coverage_yield });
  if (specs?.scent) specRows.push({ label: 'Scent', value: specs.scent });
  if (specs?.surface_compatibility?.length) specRows.push({ label: 'Surfaces', value: specs.surface_compatibility });

  return (
    <>
      <JsonLd data={generateProductSchema(product, category, businessInfo.name, variants, product.vendors?.name)} />
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
                <Image
                  src={product.image_url}
                  alt={product.image_alt ?? `${product.name} - ${businessInfo.name}`}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                  priority
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

              {(() => {
                const saleStatus = getSaleStatus(product);
                const saleInfo = getTierSaleInfo(product.retail_price_cents, product.sale_price_cents, saleStatus.isOnSale);

                if (saleInfo?.isDiscounted) {
                  const endDesc = getSaleEndDescription(saleStatus.saleEndsAt);
                  const urgent = isEndingSoon(saleStatus.saleEndsAt);

                  return (
                    <div className="mt-4 space-y-1">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
                          Sale
                        </span>
                        <span className="text-sm font-medium text-site-text-muted">
                          Save {saleInfo.discountPercent}%
                        </span>
                      </div>
                      <div className="flex items-baseline gap-3">
                        <span className="text-lg text-site-text-muted line-through">
                          {formatMoney(saleInfo.originalPriceCents)}
                        </span>
                        <span className="font-display text-3xl font-bold text-accent-brand">
                          {formatMoney(saleInfo.currentPriceCents)}
                        </span>
                      </div>
                      {endDesc && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${urgent ? 'text-red-400' : 'text-site-text-muted'}`}>
                          <Clock className="h-3 w-3" />
                          {endDesc}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <p className="mt-4 font-display text-3xl font-bold text-accent-brand">
                    {formatMoney(product.retail_price_cents)}
                  </p>
                );
              })()}

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
                  price_cents: (() => {
                    const ss = getSaleStatus(product);
                    const si = getTierSaleInfo(product.retail_price_cents, product.sale_price_cents, ss.isOnSale);
                    return si?.isDiscounted ? si.currentPriceCents : product.retail_price_cents;
                  })(),
                  stockQuantity: product.quantity_on_hand,
                  imageUrl: product.image_url,
                }}
              />

              {/* Short Description */}
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

              {/* Full Description (specs.overview) */}
              {specs?.overview && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    About This Product
                  </h2>
                  <p className="mt-3 text-site-text-muted leading-relaxed">
                    {specs.overview}
                  </p>
                </div>
              )}

              {/* Use Case */}
              {specs?.use_case && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    What Problem Does This Solve?
                  </h2>
                  <p className="mt-3 text-site-text-muted leading-relaxed">
                    {specs.use_case}
                  </p>
                </div>
              )}

              {/* Key Features */}
              {specs?.key_features && specs.key_features.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    Key Features
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {specs.key_features.map((feature, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-brand-surface border border-site-border px-3 py-1 text-sm text-site-text"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Specifications */}
              {specRows.length > 0 && (
                <div className="mt-8 rounded-2xl bg-brand-surface border border-site-border p-6">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    Specifications
                  </h2>
                  <dl className="mt-4 space-y-3 text-sm">
                    {specRows.map((row) => (
                      <div key={row.label} className="flex justify-between gap-4">
                        <dt className="text-site-text-muted shrink-0">{row.label}</dt>
                        <dd className="font-medium text-site-text text-right">
                          {Array.isArray(row.value) ? (
                            <span className="flex flex-wrap justify-end gap-1.5">
                              {row.value.map((v, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center rounded-full bg-brand-dark border border-site-border px-2 py-0.5 text-xs text-site-text"
                                >
                                  {v}
                                </span>
                              ))}
                            </span>
                          ) : (
                            row.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {/* Pro Tips */}
              {specs?.pro_tips && (
                <div className="mt-8 rounded-2xl border border-amber-800/40 bg-amber-950/30 p-5">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-5 w-5 shrink-0 text-amber-400 mt-0.5" />
                    <div>
                      <h2 className="font-display text-sm font-semibold text-amber-300 uppercase tracking-wider">
                        Pro Tip
                      </h2>
                      <p className="mt-1.5 text-sm text-amber-200/80 leading-relaxed">
                        {specs.pro_tips}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Also Available In — variant links */}
              {variants.length > 0 && (
                <div className="mt-8">
                  <h2 className="font-display text-lg font-semibold text-site-text">
                    Also Available In
                  </h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Current variant — solid */}
                    <span className="inline-flex items-center rounded-lg bg-accent-brand/20 border border-accent-brand px-4 py-2 text-sm font-medium text-accent-brand">
                      {product.variant_label || product.name}
                      <span className="ml-2 text-site-text-muted">
                        {formatMoney((() => {
                          const ss = getSaleStatus(product);
                          const si = getTierSaleInfo(product.retail_price_cents, product.sale_price_cents, ss.isOnSale);
                          return si?.isDiscounted ? si.currentPriceCents : product.retail_price_cents;
                        })())}
                      </span>
                    </span>
                    {/* Sibling variants — outline links */}
                    {variants.map((v) => {
                      const vs = getSaleStatus({ sale_starts_at: v.sale_starts_at, sale_ends_at: v.sale_ends_at });
                      const vi = getTierSaleInfo(v.retail_price_cents, v.sale_price_cents, vs.isOnSale);
                      const displayPrice = vi?.isDiscounted ? vi.currentPriceCents : v.retail_price_cents;
                      return (
                        <Link
                          key={v.id}
                          href={`/products/${v.categorySlug}/${v.slug}`}
                          className="inline-flex items-center rounded-lg border border-site-border bg-brand-surface px-4 py-2 text-sm font-medium text-site-text hover:border-accent-brand hover:text-accent-brand transition-colors"
                        >
                          {v.variant_label || v.name}
                          <span className="ml-2 text-site-text-muted">
                            {formatMoney(displayPrice)}
                          </span>
                        </Link>
                      );
                    })}
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

          {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="below_content" pagePath={`/products/${categorySlug}/${productSlug}`} className="mt-8" /></Suspense>}
        </div>
      </article>

      <SectionTickerSlot position="before_cta" pageType="products" />

      <CtaSection
        title="Need professional application?"
        description="Our technicians can apply this product as part of a detailing service. Book an appointment or call us to learn more."
      />
    </>
  );
}
