import type { Metadata } from 'next';
import { SITE_URL, SITE_NAME } from '@/lib/utils/constants';
import { getProductCategories } from '@/lib/data/products';
import { ProductCategoryCard } from '@/components/public/product-category-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

export const metadata: Metadata = {
  title: `Car Care Products & Supplies — ${SITE_NAME}`,
  description:
    'Shop premium car care products and auto detailing supplies. Ceramic coating kits, wash solutions, interior cleaners, and more at Smart Detail Auto Spa & Supplies in Lomita, CA.',
  alternates: {
    canonical: `${SITE_URL}/products`,
  },
  openGraph: {
    title: `Car Care Products & Supplies — ${SITE_NAME}`,
    description:
      'Shop premium car care products and auto detailing supplies. Ceramic coating kits, wash solutions, interior cleaners, and more.',
    url: `${SITE_URL}/products`,
    siteName: SITE_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: `Car Care Products & Supplies — ${SITE_NAME}`,
    description:
      'Shop premium car care products and auto detailing supplies.',
  },
};

export default async function ProductsPage() {
  const categories = await getProductCategories();

  return (
    <>
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ label: 'Products' }]}
          />

          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Car Care Products &amp; Supplies
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-600">
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
            <p className="mt-12 text-gray-500">
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
