import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Truck, Shield, Leaf, ArrowRight, Star } from 'lucide-react';
import { SITE_URL, SITE_DESCRIPTION } from '@/lib/utils/constants';
import { getServiceCategories } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';
import { getActiveTeamMembers, getCredentials } from '@/lib/data/team-members';
import { generateLocalBusinessSchema } from '@/lib/seo/json-ld';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { getActiveHeroSlides, getHeroCarouselConfig, getCmsToggles } from '@/lib/data/cms';
import { HeroCarousel } from '@/components/public/cms/hero-carousel';
import { HeroSection } from '@/components/public/hero-section';
import { AdZone } from '@/components/public/cms/ad-zone';
import { SectionTickerSlot } from '@/components/public/cms/section-ticker-slot';
import { TrustBar } from '@/components/public/trust-bar';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';
import { HomeAnimations } from '@/components/public/home-animations';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/'),
  ]);
  const auto: Metadata = {
    title: businessInfo.name,
    description: SITE_DESCRIPTION,
    alternates: {
      canonical: SITE_URL,
    },
    openGraph: {
      title: businessInfo.name,
      description: SITE_DESCRIPTION,
      url: SITE_URL,
      siteName: businessInfo.name,
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: businessInfo.name,
      description: SITE_DESCRIPTION,
    },
  };
  return mergeMetadata(auto, seoOverrides);
}

const differentiators = [
  {
    icon: Truck,
    title: 'Mobile Service',
    description: 'We come to your home or office throughout the South Bay area.',
  },
  {
    icon: Shield,
    title: 'Ceramic Pro Certified',
    description: 'Professional-grade coatings for lasting protection.',
  },
  {
    icon: Leaf,
    title: 'Eco-Friendly Products',
    description: 'Premium products that are safe for your vehicle and the environment.',
  },
] as const;

export default async function HomePage() {
  const [categories, businessInfo, reviews, teamMembers, credentials, heroSlides, heroConfig, cmsToggles] = await Promise.all([
    getServiceCategories(),
    getBusinessInfo(),
    getReviewData(),
    getActiveTeamMembers(),
    getCredentials(),
    getActiveHeroSlides(),
    getHeroCarouselConfig(),
    getCmsToggles(),
  ]);

  const useCarousel = cmsToggles.heroCarousel && heroSlides.length > 0;

  return (
    <>
      <JsonLd data={generateLocalBusinessSchema(businessInfo, {
        google: { rating: reviews.google.rating, count: reviews.google.count },
        yelp: { rating: reviews.yelp.rating, count: reviews.yelp.count },
      })} />

      {useCarousel ? (
        <HeroCarousel slides={heroSlides} config={heroConfig} />
      ) : (
        <HeroSection />
      )}

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="below_hero" pagePath="/" /></Suspense>}

      <SectionTickerSlot position="after_hero" pageType="home" />

      <TrustBar />

      {/* Our Services — Bento Grid */}
      <section className="bg-brand-black section-spacing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HomeAnimations type="section-header">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                Our Services
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-site-text-muted">
                From express washes to multi-year ceramic coating packages, we offer
                comprehensive auto detailing tailored to your vehicle&apos;s needs.
              </p>
            </div>
          </HomeAnimations>

          {categories.length > 0 && (
            <HomeAnimations type="stagger-grid" className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category, i) => (
                <ServiceCategoryCard
                  key={category.id}
                  category={category}
                  featured={i === 0}
                />
              ))}
            </HomeAnimations>
          )}

          <HomeAnimations type="section-header">
            <div className="mt-10 text-center">
              <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm font-semibold text-lime hover:text-lime-400 transition-colors group"
              >
                View all services
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </HomeAnimations>
        </div>
      </section>

      <SectionTickerSlot position="after_services" pageType="home" />

      {/* Why Choose Us — 3 items with dividers */}
      <section className="bg-brand-dark section-spacing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HomeAnimations type="section-header">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                Why Choose {businessInfo.name}?
              </h2>
            </div>
          </HomeAnimations>

          <HomeAnimations
            type="stagger-grid"
            className="mt-14 grid gap-0 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 divide-site-border"
          >
            {differentiators.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="px-6 py-8 text-center sm:py-0 sm:first:pl-0 sm:last:pr-0">
                  <Icon className="mx-auto h-8 w-8 text-lime" />
                  <h3 className="mt-4 font-display text-lg font-semibold text-site-text">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-site-text-muted">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </HomeAnimations>
        </div>
      </section>

      {/* Meet the Team */}
      {teamMembers.length > 0 && (
        <section className="bg-brand-black section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeAnimations type="section-header">
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                  Meet the Team
                </h2>
              </div>
            </HomeAnimations>

            <HomeAnimations type="stagger-grid" className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {teamMembers.map((member) => {
                const initials = member.name
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <div key={member.id} className="text-center">
                    <div className="mx-auto h-32 w-32 overflow-hidden rounded-full bg-brand-surface border border-site-border flex items-center justify-center">
                      {member.photo_url ? (
                        <Image
                          src={member.photo_url}
                          alt={member.name}
                          width={128}
                          height={128}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl font-bold text-lime">
                          {initials}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 font-display text-lg font-semibold text-site-text">
                      {member.name}
                    </h3>
                    <p className="text-sm font-medium text-lime">
                      {member.role}
                    </p>
                    {(member.excerpt || member.bio) && (
                      <p className="mt-2 text-sm text-site-text-muted line-clamp-2">
                        {member.excerpt || member.bio?.replace(/<[^>]*>/g, '')}
                      </p>
                    )}
                  </div>
                );
              })}
            </HomeAnimations>

            {credentials.length > 0 && (
              <HomeAnimations type="section-header">
                <div className="mt-12 border-t border-site-border pt-8">
                  <div className="flex flex-wrap justify-center gap-8 items-center">
                    {credentials.map((cred) => (
                      <div key={cred.id} className="flex items-center gap-3 text-center">
                        {cred.image_url && (
                          <Image
                            src={cred.image_url}
                            alt={cred.title}
                            width={80}
                            height={48}
                            className="h-12 w-auto object-contain"
                          />
                        )}
                        <div className="text-left">
                          <p className="text-sm font-semibold text-site-text">
                            {cred.title}
                          </p>
                          {cred.description && (
                            <p className="text-xs text-site-text-muted">
                              {cred.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </HomeAnimations>
            )}
          </div>
        </section>
      )}

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="between_sections_1" pagePath="/" /></Suspense>}

      {/* Google Review Cards */}
      {reviews.google.reviews.length > 0 && (
        <section className="bg-brand-dark section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeAnimations type="section-header">
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
                  What Our Customers Say
                </h2>
              </div>
            </HomeAnimations>

            <HomeAnimations type="stagger-grid" className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.google.reviews.slice(0, 3).map((review, i) => (
                <div
                  key={i}
                  className="relative rounded-2xl bg-brand-surface p-7 sm:p-8 border border-site-border hover:border-lime/30 transition-all duration-300"
                >
                  {/* Decorative quote mark */}
                  <span className="absolute -top-2 -left-1 text-6xl font-serif text-lime/20 leading-none select-none" aria-hidden="true">
                    &ldquo;
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: review.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-lime text-lime" />
                    ))}
                  </div>
                  <p className="mt-4 text-base sm:text-lg leading-relaxed text-site-text-secondary italic line-clamp-4">
                    &ldquo;{review.text}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center justify-between">
                    <span className="text-sm font-bold text-site-text">
                      {review.author}
                    </span>
                    <span className="text-xs bg-site-border-light border border-site-border rounded-full px-3 py-1 text-site-text-muted">
                      Google
                    </span>
                  </div>
                </div>
              ))}
            </HomeAnimations>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <a
                href={`https://search.google.com/local/reviews?placeid=ChIJf7qNDhW1woAROX-FX8CScGE`}
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

      <SectionTickerSlot position="after_reviews" pageType="home" />

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="above_cta" pagePath="/" /></Suspense>}

      <SectionTickerSlot position="before_cta" pageType="home" />

      <CtaSection
        beforeImage="/images/before-after-old.webp"
        afterImage="/images/before-after-new.webp"
      />
    </>
  );
}
