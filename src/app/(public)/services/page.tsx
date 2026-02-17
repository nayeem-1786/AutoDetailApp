import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getServiceCategories } from '@/lib/data/services';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { getCmsToggles } from '@/lib/data/cms';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { AdZone } from '@/components/public/cms/ad-zone';

export const revalidate = 300;

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
  const [categories, cmsToggles] = await Promise.all([
    getServiceCategories(),
    getCmsToggles(),
  ]);

  return (
    <>
      {/* Page Hero */}
      <section className="bg-black py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Services' }]} />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Our Detailing <span className="text-gradient-lime">Services</span>
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-400">
            From express washes to multi-year ceramic coating packages, our trained technicians
            deliver results you can see and feel.
          </p>
        </div>
      </section>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="below_hero" pagePath="/services" /></Suspense>}

      <section className="bg-brand-dark py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {categories.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <ServiceCategoryCard key={category.id} category={category} />
              ))}
            </div>
          ) : (
            <p className="text-gray-400">
              No service categories are currently available. Please check back soon.
            </p>
          )}
        </div>
      </section>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="above_cta" pagePath="/services" /></Suspense>}

      <CtaSection />
    </>
  );
}
