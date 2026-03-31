import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Star, MapPin, Phone, Sparkles, CheckCircle2 } from 'lucide-react';
import { SITE_URL } from '@/lib/utils/constants';
import { getActiveCities, getCityBySlug } from '@/lib/data/cities';
import { getBusinessInfo, getSeoSettings } from '@/lib/data/business';
import { getHomepageSettings } from '@/lib/data/homepage-settings';
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
import { SectionTickerSlot } from '@/components/public/cms/section-ticker-slot';
import { formatPhone, phoneToE164 } from '@/lib/utils/format';
import AnimatedSection, { AnimatedItem } from '@/components/public/animated-section';

// ---------------------------------------------------------------------------
// Service Highlight type (matches admin editor)
// ---------------------------------------------------------------------------

interface ServiceHighlight {
  id: string;
  service_name: string;
  description: string;
  is_featured: boolean;
}

function parseServiceHighlights(raw: unknown): ServiceHighlight[] {
  if (!raw) return [];
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) return [];
    return data
      .filter((h: Record<string, unknown>) => h.service_name)
      .map((h: Record<string, unknown>) => ({
        id: (h.id as string) || '',
        service_name: (h.service_name as string) || '',
        description: (h.description as string) || '',
        is_featured: Boolean(h.is_featured),
      }));
  } catch {
    return [];
  }
}

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
  const [city, businessInfo, categories, reviews, contentBlocks, homepageSettings, seoSettings] = await Promise.all([
    getCityBySlug(citySlug),
    getBusinessInfo(),
    getServiceCategories(),
    getReviewData(),
    getPageContentBlocks(`/areas/${citySlug}`),
    getHomepageSettings(),
    getSeoSettings(),
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

  // Parse service highlights
  const serviceHighlights = parseServiceHighlights(city.service_highlights);
  const featuredHighlights = serviceHighlights.filter((h) => h.is_featured);
  const otherHighlights = serviceHighlights.filter((h) => !h.is_featured);

  // Parse landmarks
  const landmarks = city.local_landmarks
    ? city.local_landmarks.split(',').map((l) => l.trim()).filter(Boolean)
    : [];

  // JSON-LD structured data
  const localBusinessSchema = generateLocalBusinessSchema(businessInfo, {
    google: { rating: reviews.google.rating, count: reviews.google.count },
    yelp: { rating: reviews.yelp.rating, count: reviews.yelp.count },
  }, seoSettings);

  // Enhance LocalBusiness schema with city-specific areaServed
  const cityBusinessSchema = {
    ...localBusinessSchema,
    areaServed: [
      ...(Array.isArray(localBusinessSchema.areaServed) ? localBusinessSchema.areaServed : []),
      {
        '@type': 'City',
        name: city.city_name,
        containedInPlace: {
          '@type': 'State',
          name: city.state === 'CA' ? 'California' : city.state,
        },
      },
    ],
    ...(serviceHighlights.length > 0
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `Auto Detailing Services in ${city.city_name}`,
            itemListElement: serviceHighlights.map((h) => ({
              '@type': 'Offer',
              itemOffered: {
                '@type': 'Service',
                name: h.service_name,
                ...(h.description ? { description: h.description } : {}),
              },
            })),
          },
        }
      : {}),
  };

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: SITE_URL },
    { name: 'Service Areas', url: `${SITE_URL}/areas` },
    { name: city.city_name, url: `${SITE_URL}/areas/${city.slug}` },
  ]);

  // Extract city name from heading for accent gradient effect
  const headingParts = heading.split(city.city_name);
  const hasCity = headingParts.length > 1;

  return (
    <>
      <JsonLd data={cityBusinessSchema} />
      <JsonLd data={breadcrumbSchema} />

      {/* Hero Section */}
      <section className="bg-brand-black py-16 sm:py-20 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-brand/3 rounded-full blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Service Areas', href: '/areas' },
              { label: city.city_name },
            ]}
          />
          <AnimatedSection>
            <h1 className="font-display text-3xl font-black tracking-tight text-site-text uppercase sm:text-4xl lg:text-5xl">
              {hasCity ? (
                <>
                  {headingParts[0]}
                  <span className="text-gradient-accent">{city.city_name}</span>
                  {headingParts[1]}
                </>
              ) : (
                heading
              )}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-site-text-muted">
              {introText}
            </p>
            {city.distance_miles != null && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-site-text-dim">
                <MapPin className="h-4 w-4" />
                {city.distance_miles} miles from our shop in {businessInfo.city},{' '}
                {businessInfo.state}
              </p>
            )}
            {landmarks.length > 0 && (
              <p className="mt-1.5 text-sm text-site-text-dim">
                Serving the {city.city_name} area near {landmarks.slice(0, 3).join(', ')}
                {landmarks.length > 3 ? `, and more` : ''}
              </p>
            )}
            <div className="mt-8">
              <Link
                href="/book"
                className="inline-flex items-center justify-center gap-2 site-btn-cta font-bold text-base h-13 px-8 shadow-lg shadow-accent-brand/25 hover:shadow-xl hover:shadow-accent-brand/40 hover:-translate-y-0.5 transition-all duration-300 btn-accent-glow"
              >
                Book Your Detail
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </AnimatedSection>
        </div>
      </section>

      {/* Custom Service Highlights (from service_highlights field) */}
      {serviceHighlights.length > 0 && (
        <section className="bg-brand-dark section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                  Our Services in{' '}
                  <span className="text-gradient-accent">{city.city_name}</span>
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-site-text-muted">
                  Premium mobile auto detailing services tailored for {city.city_name} vehicles and conditions.
                </p>
              </div>
            </AnimatedSection>

            {/* Featured services — larger cards */}
            {featuredHighlights.length > 0 && (
              <AnimatedSection stagger className="mt-12 grid gap-6 sm:grid-cols-2">
                {featuredHighlights.map((h) => (
                  <AnimatedItem key={h.id}>
                    <div className="relative rounded-2xl bg-brand-surface border border-accent-brand/20 p-8 hover:border-accent-ui/40 transition-colors overflow-hidden">
                      <div className="absolute top-4 right-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-brand/10 px-2.5 py-1 text-xs font-semibold text-accent-brand">
                          <Sparkles className="h-3 w-3" />
                          Featured
                        </span>
                      </div>
                      <h3 className="font-display text-xl font-bold text-site-text pr-20">
                        {h.service_name}
                      </h3>
                      {h.description && (
                        <p className="mt-3 text-sm leading-relaxed text-site-text-muted">
                          {h.description}
                        </p>
                      )}
                      <Link
                        href="/book"
                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-brand hover:text-accent-ui transition-colors group"
                      >
                        Book now
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </div>
                  </AnimatedItem>
                ))}
              </AnimatedSection>
            )}

            {/* Non-featured services — smaller grid */}
            {otherHighlights.length > 0 && (
              <AnimatedSection stagger className={`${featuredHighlights.length > 0 ? 'mt-6' : 'mt-12'} grid gap-4 sm:grid-cols-2 lg:grid-cols-3`}>
                {otherHighlights.map((h) => (
                  <AnimatedItem key={h.id}>
                    <div className="rounded-xl bg-brand-surface border border-site-border p-6 hover:border-accent-ui/20 transition-colors">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-brand" />
                        <div>
                          <h3 className="font-semibold text-site-text">
                            {h.service_name}
                          </h3>
                          {h.description && (
                            <p className="mt-1.5 text-sm text-site-text-muted leading-relaxed">
                              {h.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </AnimatedItem>
                ))}
              </AnimatedSection>
            )}

            <AnimatedSection delay={0.3}>
              <div className="mt-10 text-center">
                <Link
                  href="/services"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent-brand hover:text-accent-ui transition-colors group"
                >
                  View all services
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </AnimatedSection>
          </div>
        </section>
      )}

      {/* Service Categories (fallback when no custom highlights) */}
      {serviceHighlights.length === 0 && topCategories.length > 0 && (
        <section className="bg-brand-dark section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <AnimatedSection>
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                  Services Available in{' '}
                  <span className="text-gradient-accent">{city.city_name}</span>
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-site-text-muted">
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
                  className="inline-flex items-center gap-2 text-sm font-semibold text-accent-brand hover:text-accent-ui transition-colors group"
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
                <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                  What Our Customers Say
                </h2>
                <p className="mx-auto mt-3 max-w-xl text-site-text-muted">
                  Rated {reviews.google.rating} stars across{' '}
                  {reviews.google.count} Google reviews
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection stagger className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.google.reviews.slice(0, 3).map((review, i) => (
                <AnimatedItem key={i}>
                  <div className="rounded-2xl bg-brand-surface p-7 border border-site-border hover:border-accent-ui/20 transition-colors">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: review.rating }).map((_, j) => (
                        <Star
                          key={j}
                          className="h-4 w-4 fill-amber-400 text-amber-400"
                        />
                      ))}
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-site-text-secondary line-clamp-4 italic">
                      &ldquo;{review.text}&rdquo;
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-medium text-site-text">
                        {review.author}
                      </span>
                      <span className="text-xs text-site-text-dim">
                        {review.relativeTime}
                      </span>
                    </div>
                  </div>
                </AnimatedItem>
              ))}
            </AnimatedSection>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <a
                href={`https://search.google.com/local/reviews?placeid=${homepageSettings.googlePlaceId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-brand hover:text-accent-ui font-medium transition-colors"
              >
                See all {reviews.google.count} reviews on Google &rarr;
              </a>
            </div>
          </div>
        </section>
      )}

      <SectionTickerSlot position="before_cta" pageType="areas" />

      {/* CTA Section */}
      <CtaSection
        title={`Book Your Detail in ${city.city_name}`}
        description={`Ready for a showroom-quality detail? We come to you anywhere in ${city.city_name}, ${city.state}.`}
      />

      {/* Business Info Footer */}
      <section className="bg-brand-black border-t border-site-border py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-8 sm:text-left">
            <div className="flex items-center gap-2 text-sm text-site-text-muted">
              <MapPin className="h-4 w-4 text-site-text-dim" />
              {businessInfo.address}
            </div>
            <a
              href={`tel:${phoneToE164(businessInfo.phone)}`}
              className="flex items-center gap-2 text-sm text-site-text-muted hover:text-accent-ui transition-colors"
            >
              <Phone className="h-4 w-4 text-site-text-dim" />
              {formatPhone(businessInfo.phone)}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
