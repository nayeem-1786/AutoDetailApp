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
import { getPageContentBlocks } from '@/lib/data/page-content';
import { JsonLd } from '@/components/public/json-ld';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { ServiceCategoryCard } from '@/components/public/service-category-card';

export const revalidate = 300;
import { ContentBlocks } from '@/components/public/content-block-renderer';
import { CtaSection } from '@/components/public/cta-section';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';
import AnimatedSection, { AnimatedItem } from '@/components/public/animated-section';

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
  const [city, businessInfo, categories, reviews, contentBlocks] = await Promise.all([
    getCityBySlug(citySlug),
    getBusinessInfo(),
    getServiceCategories(),
    getReviewData(),
    getPageContentBlocks(`/areas/${citySlug}`),
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

  // Extract city name from heading for lime gradient effect
  const headingParts = heading.split(city.city_name);
  const hasCity = headingParts.length > 1;

  return (
    <>
      <JsonLd data={localBusinessSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Hero Section */}
      <section className="bg-black py-16 sm:py-20 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-lime/3 rounded-full blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Service Areas', href: '/areas' },
              { label: city.city_name },
            ]}
          />
          <AnimatedSection>
            <h1 className="font-display text-3xl font-black tracking-tight text-white uppercase sm:text-4xl lg:text-5xl">
              {hasCity ? (
                <>
                  {headingParts[0]}
                  <span className="text-gradient-lime">{city.city_name}</span>
                  {headingParts[1]}
                </>
              ) : (
                heading
              )}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-gray-400">
              {introText}
            </p>
            {city.distance_miles != null && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-gray-500">
                <MapPin className="h-4 w-4" />
                {city.distance_miles} miles from our shop in {businessInfo.city},{' '}
                {businessInfo.state}
              </p>
            )}
            <div className="mt-8">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-lime text-black font-bold text-base h-13 px-8 shadow-lg shadow-lime/25 hover:shadow-xl hover:shadow-lime/40 hover:-translate-y-0.5 transition-all duration-300 btn-lime-glow"
              >
                Book Your Detail
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Service Highlights */}
      {topCategories.length > 0 && (
        <section className="bg-brand-dark section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Services Available in{' '}
                  <span className="text-gradient-lime">{city.city_name}</span>
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-gray-400">
                  From express washes to multi-year ceramic coating packages, we bring
                  professional auto detailing directly to you in {city.city_name}.
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {topCategories.map((category) => (
                <AnimatedItem key={category.id}>
                  <ServiceCategoryCard category={category} />
                </AnimatedItem>
              ))}
            </AnimatedSection>

            <AnimatedSection delay={0.3}>
              <div className="mt-10 text-center">
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-lime hover:text-lime-400 transition-colors group"
                >
                  View all services
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* AI-Generated Content Blocks */}
      <ContentBlocks blocks={contentBlocks} />

      {/* Reviews Section */}
      {reviews.google.reviews.length > 0 && (
        <section className="bg-brand-grey section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  What Our Customers Say
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-gray-400">
                  Rated {reviews.google.rating} stars across{' '}
                  {reviews.google.count} Google reviews
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.google.reviews.slice(0, 3).map((review, i) => (
                <AnimatedItem key={i}>
                  <div className="rounded-2xl bg-brand-surface p-7 border border-white/10 hover:border-lime/20 transition-colors">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: review.rating }).map((_, j) => (
                        <Star
                          key={j}
                          className="h-4 w-4 fill-amber-400 text-amber-400"
                        />
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-gray-300 line-clamp-4 italic">
                      &ldquo;{review.text}&rdquo;
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-white">
                        {review.author}
                      </span>
                      <span className="text-xs text-gray-500">
                        {review.relativeTime}
                      </span>
                    </div>
                  </div>
                </AnimatedItem>
              ))}
            </AnimatedSection>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <a
                href="https://search.google.com/local/reviews?placeid=ChIJf7qNDhW1woAROX-FX8CScGE"
                target="_blank"
                rel="noopener noreferrer"
                className="text-lime hover:text-lime-400 font-medium transition-colors"
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
      <section className="bg-black border-t border-white/10 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MapPin className="h-4 w-4 text-gray-500" />
              {businessInfo.address}
            </div>
            <a
              href={`tel:${phoneToE164(businessInfo.phone)}`}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-lime transition-colors"
            >
              <Phone className="h-4 w-4 text-gray-500" />
              {formatPhone(businessInfo.phone)}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
