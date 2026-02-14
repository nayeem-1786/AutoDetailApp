import type { Metadata } from 'next';
import Link from 'next/link';
import { Truck, Shield, Leaf, ArrowRight, Star } from 'lucide-react';
import { SITE_URL, SITE_DESCRIPTION } from '@/lib/utils/constants';
import { getServiceCategories } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { getReviewData } from '@/lib/data/reviews';
import { getTeamData } from '@/lib/data/team';
import { generateLocalBusinessSchema } from '@/lib/seo/json-ld';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { HeroSection } from '@/components/public/hero-section';
import { TrustBar } from '@/components/public/trust-bar';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';
import { HomeAnimations } from '@/components/public/home-animations';

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
  const [categories, businessInfo, reviews, teamData] = await Promise.all([
    getServiceCategories(),
    getBusinessInfo(),
    getReviewData(),
    getTeamData(),
  ]);

  return (
    <>
      <JsonLd data={generateLocalBusinessSchema(businessInfo, {
        google: { rating: reviews.google.rating, count: reviews.google.count },
        yelp: { rating: reviews.yelp.rating, count: reviews.yelp.count },
      })} />

      <HeroSection />

      <TrustBar />

      {/* Our Services — Bento Grid */}
      <section className="bg-white dark:bg-gray-900 section-spacing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HomeAnimations type="section-header">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                Our Services
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-400">
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
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors group"
              >
                View all services
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </HomeAnimations>
        </div>
      </section>

      {/* Why Choose Us — 3 items with dividers */}
      <section className="bg-gray-50 dark:bg-gray-950 section-spacing">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <HomeAnimations type="section-header">
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                Why Choose {businessInfo.name}?
              </h2>
            </div>
          </HomeAnimations>

          <HomeAnimations
            type="stagger-grid"
            className="mt-14 grid gap-0 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0 divide-gray-200 dark:divide-gray-800"
          >
            {differentiators.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="px-6 py-8 text-center sm:py-0 sm:first:pl-0 sm:last:pr-0">
                  <Icon className="mx-auto h-8 w-8 text-brand-600" />
                  <h3 className="mt-4 font-display text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </HomeAnimations>
        </div>
      </section>

      {/* Meet the Team */}
      {teamData.members.length > 0 && (
        <section className="bg-white dark:bg-gray-900 section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeAnimations type="section-header">
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                  Meet the Team
                </h2>
                {teamData.aboutText && (
                  <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-400">
                    {teamData.aboutText}
                  </p>
                )}
              </div>
            </HomeAnimations>

            <HomeAnimations type="stagger-grid" className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {teamData.members.map((member, i) => {
                const initials = member.name
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2);

                return (
                  <div key={i} className="text-center">
                    <div className="mx-auto h-32 w-32 overflow-hidden rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                      {member.photoUrl ? (
                        <img
                          src={member.photoUrl}
                          alt={member.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-3xl font-bold text-white">
                          {initials}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-4 font-display text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {member.name}
                    </h3>
                    <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                      {member.role}
                    </p>
                    {member.bio && (
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {member.bio}
                      </p>
                    )}
                  </div>
                );
              })}
            </HomeAnimations>

            {teamData.credentials.length > 0 && (
              <HomeAnimations type="section-header">
                <div className="mt-12 border-t border-gray-200 dark:border-gray-800 pt-8">
                  <div className="flex flex-wrap justify-center gap-8 items-center">
                    {teamData.credentials.map((cred, i) => (
                      <div key={i} className="flex items-center gap-3 text-center">
                        {cred.imageUrl && (
                          <img
                            src={cred.imageUrl}
                            alt={cred.title}
                            className="h-12 w-auto object-contain"
                          />
                        )}
                        <div className="text-left">
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {cred.title}
                          </p>
                          {cred.description && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
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

      {/* Google Review Cards */}
      {reviews.google.reviews.length > 0 && (
        <section className="bg-white dark:bg-gray-900 section-spacing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeAnimations type="section-header">
              <div className="text-center">
                <h2 className="font-display text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
                  What Our Customers Say
                </h2>
              </div>
            </HomeAnimations>

            <HomeAnimations type="stagger-grid" className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.google.reviews.slice(0, 3).map((review, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-7 ring-1 ring-gray-100 dark:ring-gray-700"
                >
                  <div className="flex items-center gap-1">
                    {Array.from({ length: review.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 line-clamp-4">
                    &ldquo;{review.text}&rdquo;
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {review.author}
                    </span>
                    <span className="text-xs text-gray-400">{review.relativeTime}</span>
                  </div>
                </div>
              ))}
            </HomeAnimations>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
              <a
                href={`https://search.google.com/local/reviews?placeid=ChIJf7qNDhW1woAROX-FX8CScGE`}
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

      <CtaSection />
    </>
  );
}
