import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getServiceCategories } from '@/lib/data/services';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

export async function generateMetadata(): Promise<Metadata> {
  const businessInfo = await getBusinessInfo();
  return {
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
}

export default async function ServicesPage() {
  const categories = await getServiceCategories();

  return (
    <>
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[{ label: 'Services' }]}
          />

          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Our Auto Detailing Services
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-600">
            We offer a comprehensive range of auto detailing services designed
            to protect and enhance your vehicle. From express washes to
            multi-year ceramic coating packages, our trained technicians deliver
            results you can see and feel.
          </p>

          {categories.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <ServiceCategoryCard key={category.id} category={category} />
              ))}
            </div>
          ) : (
            <p className="mt-12 text-gray-500">
              No service categories are currently available. Please check back
              soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
