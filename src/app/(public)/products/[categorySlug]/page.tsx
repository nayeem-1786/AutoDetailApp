import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductCategories, getProductsByCategory } from '@/lib/data/products';
import { getBusinessInfo } from '@/lib/data/business';
import { generateCategoryMetadata } from '@/lib/seo/metadata';
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

  const businessInfo = await getBusinessInfo();
  return generateCategoryMetadata(result.category, 'product', businessInfo.name);
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
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Products', href: '/products' },
              { label: category.name },
            ]}
          />

          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-4 max-w-3xl text-lg text-gray-600">
              {category.description}
            </p>
          )}

          {products.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  categorySlug={categorySlug}
                />
              ))}
            </div>
          ) : (
            <p className="mt-12 text-gray-500">
              No products are currently available in this category. Please check
              back soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
