import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { SITE_URL } from '@/lib/utils/constants';
import { getActiveCities } from '@/lib/data/cities';
import { getBusinessInfo } from '@/lib/data/business';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { JsonLd } from '@/components/public/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata(): Promise<Metadata> {
  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/areas'),
  ]);

  const auto: Metadata = {
    title: `Service Areas — ${businessInfo.name}`,
    description: `${businessInfo.name} provides mobile auto detailing services across the South Bay. See the cities we serve.`,
    alternates: {
      canonical: `${SITE_URL}/areas`,
    },
    openGraph: {
      title: `Service Areas — ${businessInfo.name}`,
      description: `${businessInfo.name} provides mobile auto detailing services across the South Bay. See the cities we serve.`,
      url: `${SITE_URL}/areas`,
      siteName: businessInfo.name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: `Service Areas — ${businessInfo.name}`,
      description: `${businessInfo.name} provides mobile auto detailing services across the South Bay.`,
    },
  };

  return mergeMetadata(auto, seoOverrides);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AreasIndexPage() {
  const [cities, businessInfo] = await Promise.all([
    getActiveCities(),
    getBusinessInfo(),
  ]);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Service Areas', url: `${SITE_URL}/areas` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />

      {/* Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Breadcrumbs items={[{ label: 'Service Areas' }]} variant="light" />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Service Areas
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-blue-100/60">
            {businessInfo.name} provides premium mobile auto detailing across
            the South Bay and surrounding areas. Select your city to learn more.
          </p>
        </div>
      </section>

      {/* City Grid */}
      <section className="bg-white dark:bg-gray-900 section-spacing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {cities.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {cities.map((city) => (
                <Link
                  key={city.id}
                  href={`/areas/${city.slug}`}
                  className="group block h-full"
                >
                  <div className="relative h-full overflow-hidden rounded-2xl bg-white dark:bg-gray-800 p-7 shadow-sm ring-1 ring-gray-100 dark:ring-gray-700 transition-shadow duration-300 hover:shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-display text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {city.city_name}, {city.state}
                        </h2>
                        {city.distance_miles != null && (
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                            <MapPin className="h-3.5 w-3.5" />
                            {city.distance_miles} miles away
                          </p>
                        )}
                        {city.intro_text && (
                          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
                            {city.intro_text}
                          </p>
                        )}
                      </div>
                      <div className="ml-4 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 group-hover:text-brand-600 transition-colors">
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400">
              No service areas are currently listed. Please check back soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
