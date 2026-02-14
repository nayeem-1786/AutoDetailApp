import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getServiceCategories } from '@/lib/data/services';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

export async function generateMetadata(): Promise<Metadata> {
  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/services'),
  ]);
  const auto: Metadata = {
    title: `Auto Detailing Services — ${businessInfo.name}`,
    description: `Browse our full range of professional auto detailing services at ${businessInfo.name}.`,
    alternates: {
      canonical: `${SITE_URL}/services`,
    },
    openGraph: {
      title: `Auto Detailing Services — ${businessInfo.name}`,
      description:
        'Browse our full range of professional auto detailing services including ceramic coatings, paint correction, interior detailing, and more.',
      url: `${SITE_URL}/services`,
      siteName: businessInfo.name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `Auto Detailing Services — ${businessInfo.name}`,
      description:
        'Browse our full range of professional auto detailing services including ceramic coatings, paint correction, interior detailing, and more.',
    },
  };
  return mergeMetadata(auto, seoOverrides);
}

export default async function ServicesPage() {
  const categories = await getServiceCategories();

  return (
    <>
      {/* Page Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Breadcrumbs items={[{ label: 'Services' }]} variant="light" />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Our Detailing Services
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-blue-100/60">
            From express washes to multi-year ceramic coating packages, our trained technicians
            deliver results you can see and feel.
          </p>
        </div>
      </section>

      <section className="bg-surface dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {categories.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <ServiceCategoryCard key={category.id} category={category} />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              No service categories are currently available. Please check back soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
