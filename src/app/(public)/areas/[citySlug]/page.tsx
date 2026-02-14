import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Star, MapPin, Phone } from 'lucide-react';
import { SITE_URL } from '@/lib/utils/constants';
import { getActiveCities, getCityBySlug } from '@/lib/data/cities';
import { getBusinessInfo } from '@/lib/data/business';
import { getServiceCategories } from '@/lib/data/services';
import { getReviewData } from '@/lib/data/reviews';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { generateLocalBusinessSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { JsonLd } from '@/components/public/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { CtaSection } from '@/components/public/cta-section';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';

// ---------------------------------------------------------------------------
// Static params — pre-render all active cities at build time
// ---------------------------------------------------------------------------

export async function generateStaticParams() {
  const cities = await getActiveCities();
  return cities.map((city) => ({ citySlug: city.slug }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}): Promise<Metadata> {
  const { citySlug } = await params;
  const [city, businessInfo, seoOverrides] = await Promise.all([
    getCityBySlug(citySlug),
    getBusinessInfo(),
    getPageSeo(`/areas/${citySlug}`),
  ]);

  if (!city) {
    return { title: 'City Not Found' };
  }

  const title =
    city.meta_title ||
    `Mobile Auto Detailing in ${city.city_name}, ${city.state} — ${businessInfo.name}`;
  const description =
    city.meta_description ||
    `Professional mobile auto detailing services in ${city.city_name}, ${city.state}. Ceramic coatings, paint correction, interior detailing and more from ${businessInfo.name}.`;

  const auto: Metadata = {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/areas/${city.slug}`,
    },
    keywords: city.focus_keywords
      ? city.focus_keywords.split(',').map((k) => k.trim())
      : undefined,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/areas/${city.slug}`,
      siteName: businessInfo.name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  };

  return mergeMetadata(auto, seoOverrides);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CityLandingPage({
  params,
}: {
  params: Promise<{ citySlug: string }>;
}) {
  const { citySlug } = await params;
  const [city, businessInfo, categories, reviews] = await Promise.all([
    getCityBySlug(citySlug),
    getBusinessInfo(),
    getServiceCategories(),
    getReviewData(),
  ]);

  if (!city) {
    notFound();
  }

  const heading =
    city.heading || `Mobile Auto Detailing in ${city.city_name}, ${city.state}`;
  const introText =
    city.intro_text ||
    `${businessInfo.name} proudly serves ${city.city_name}, ${city.state} with premium mobile auto detailing services. Our trained technicians come to your home or office, saving you time while delivering showroom-quality results.`;

  // Limit service categories to 6 for the highlights section
  const topCategories = categories.slice(0, 6);

  // JSON-LD structured data
  const localBusinessSchema = generateLocalBusinessSchema(businessInfo, {
    google: { rating: reviews.google.rating, count: reviews.google.count },
    yelp: { rating: reviews.yelp.rating, count: reviews.yelp.count },
  });

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Service Areas', url: `${SITE_URL}/areas` },
    { name: city.city_name, url: `${SITE_URL}/areas/${city.slug}` },
  ]);

  return (
    <>
      <JsonLd data={localBusinessSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Hero Section */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Service Areas', href: '/areas' },
              { label: city.city_name },
            ]}
            variant="light"
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-blue-100/60">
            {introText}
          </p>
          {city.distance_miles != null && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-blue-200/50">
              <MapPin className="h-4 w-4" />
              {city.distance_miles} miles from our shop in {businessInfo.city},{' '}
              {businessInfo.state}
            </p>
          )}
          <div className="mt-8">
            <Link
              href="/book"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-navy font-semibold text-base h-13 px-8 shadow-lg shadow-brand-900/25 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
            >
              Book Your Detail
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Service Highlights */}
      {topCategories.length > 0 && (
        <section className="bg-white dark:bg-gray-900 section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                Services Available in {city.city_name}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-400">
                From express washes to multi-year ceramic coating packages, we bring
                professional auto detailing directly to you in {city.city_name}.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {topCategories.map((category) => (
                <ServiceCategoryCard key={category.id} category={category} />
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors group"
              >
                View all services
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Reviews Section */}
      {reviews.google.reviews.length > 0 && (
        <section className="bg-gray-50 dark:bg-gray-950 section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                What Our Customers Say
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-gray-600 dark:text-gray-400">
                Rated {reviews.google.rating} stars across{' '}
                {reviews.google.count} Google reviews
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.google.reviews.slice(0, 3).map((review, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-white dark:bg-gray-800 p-7 ring-1 ring-gray-100 dark:ring-gray-700"
                >
                  <div className="flex items-center gap-1">
                    {Array.from({ length: review.rating }).map((_, j) => (
                      <Star
                        key={j}
                        className="h-4 w-4 fill-amber-400 text-amber-400"
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 line-clamp-4">
                    &ldquo;{review.text}&rdquo;
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {review.author}
                    </span>
                    <span className="text-xs text-gray-400">
                      {review.relativeTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <a
                href="https://search.google.com/local/reviews?placeid=ChIJf7qNDhW1woAROX-FX8CScGE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
              >
                See all {reviews.google.count} reviews on Google &rarr;
              </a>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <CtaSection
        title={`Book Your Detail in ${city.city_name}`}
        description={`Ready for a showroom-quality detail? We come to you anywhere in ${city.city_name}, ${city.state}.`}
      />

      {/* Business Info Footer */}
      <section className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <MapPin className="h-4 w-4 text-gray-400" />
              {businessInfo.address}
            </div>
            <a
              href={`tel:${phoneToE164(businessInfo.phone)}`}
              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              <Phone className="h-4 w-4 text-gray-400" />
              {formatPhone(businessInfo.phone)}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
