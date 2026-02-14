import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductCategories, getProductsByCategory } from '@/lib/data/products';
import { getBusinessInfo } from '@/lib/data/business';
import { generateCategoryMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { ProductCard } from '@/components/public/product-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

interface PageProps {
  params: Promise<{ categorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const result = await getProductsByCategory(categorySlug);

  if (!result) {
    return { title: 'Category Not Found' };
  }

  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo(`/products/${categorySlug}`),
  ]);
  return mergeMetadata(
    generateCategoryMetadata(result.category, 'product', businessInfo.name),
    seoOverrides
  );
}

export async function generateStaticParams() {
  const categories = await getProductCategories();
  return categories.map((cat) => ({
    categorySlug: cat.slug,
  }));
}

export default async function ProductCategoryPage({ params }: PageProps) {
  const { categorySlug } = await params;
  const result = await getProductsByCategory(categorySlug);

  if (!result) {
    notFound();
  }

  const { category, products } = result;

  return (
    <>
      {/* Category Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Products', href: '/products' },
              { label: category.name },
            ]}
            variant="light"
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-4 max-w-3xl text-lg text-blue-100/60">
              {category.description}
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {products.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categorySlug={categorySlug}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              No products are currently available in this category. Please check back soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
