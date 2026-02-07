import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getProductCategories } from '@/lib/data/products';
import { ProductCategoryCard } from '@/components/public/product-category-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

export async function generateMetadata(): Promise<Metadata> {
  const businessInfo = await getBusinessInfo();
  return {
    title: `Car Care Products & Supplies — ${businessInfo.name}`,
    description: `Shop premium car care products and auto detailing supplies at ${businessInfo.name}.`,
    alternates: {
      canonical: `${SITE_URL}/products`,
    },
    openGraph: {
      title: `Car Care Products & Supplies — ${businessInfo.name}`,
      description:
        'Shop premium car care products and auto detailing supplies. Ceramic coating kits, wash solutions, interior cleaners, and more.',
      url: `${SITE_URL}/products`,
      siteName: businessInfo.name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `Car Care Products & Supplies — ${businessInfo.name}`,
      description:
        'Shop premium car care products and auto detailing supplies.',
    },
  };
}

export default async function ProductsPage() {
  const categories = await getProductCategories();

  return (
    <>
      <section className="bg-white dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ label: 'Products' }]}
          />

          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
            Car Care Products &amp; Supplies
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            Professional-grade car care products for every need. Whether
            you&apos;re maintaining a ceramic coating, detailing your interior,
            or washing your vehicle at home, we carry the products our
            technicians trust and recommend.
          </p>

          {categories.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <ProductCategoryCard key={category.id} category={category} />
              ))}
            </div>
          ) : (
            <p className="mt-12 text-gray-500 dark:text-gray-400">
              No product categories are currently available. Please check back
              soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
