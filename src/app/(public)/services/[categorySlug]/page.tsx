import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getServiceCategories, getServicesByCategory } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { generateCategoryMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { getCmsToggles } from '@/lib/data/cms';
import { ServiceCard } from '@/components/public/service-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { SectionTickerSlot } from '@/components/public/cms/section-ticker-slot';
import { AdZone } from '@/components/public/cms/ad-zone';
import AnimatedSection, { AnimatedItem } from '@/components/public/animated-section';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ categorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const result = await getServicesByCategory(categorySlug);

  if (!result) {
    return { title: 'Category Not Found' };
  }

  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo(`/services/${categorySlug}`),
  ]);
  return mergeMetadata(
    generateCategoryMetadata(result.category, 'service', businessInfo.name),
    seoOverrides
  );
}

export async function generateStaticParams() {
  const categories = await getServiceCategories();
  return categories.map((cat) => ({
    categorySlug: cat.slug,
  }));
}

export default async function ServiceCategoryPage({ params }: PageProps) {
  const { categorySlug } = await params;
  const result = await getServicesByCategory(categorySlug);

  if (!result) {
    notFound();
  }

  const { category, services } = result;

  // Fetch all categories to show "Explore Other Services" section
  const [allCategories, cmsToggles] = await Promise.all([
    getServiceCategories(),
    getCmsToggles(),
  ]);
  const otherCategories = allCategories.filter((cat) => cat.slug !== categorySlug);

  return (
    <>
      {/* Category Hero */}
      <section className="bg-brand-black py-14 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Services', href: '/services' },
              { label: category.name },
            ]}
          />
          <AnimatedSection>
            <h1 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
              {category.name}
            </h1>
            {category.description && (
              <p className="mt-4 max-w-3xl text-lg text-site-text-muted">
                {category.description}
              </p>
            )}
          </AnimatedSection>
        </div>
      </section>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="below_hero" pagePath={`/services/${categorySlug}`} /></Suspense>}

      <section className="bg-brand-dark py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {services.length > 0 ? (
            <AnimatedSection stagger className="grid gap-6 sm:grid-cols-2">
              {services.map((service) => (
                <AnimatedItem key={service.id}>
                  <ServiceCard
                    service={{
                      ...service,
                      pricing: service.service_pricing,
                    }}
                    categorySlug={categorySlug}
                  />
                </AnimatedItem>
              ))}
            </AnimatedSection>
          ) : (
            <p className="text-site-text-muted">
              No services are currently available in this category. Please check back soon.
            </p>
          )}
        </div>
      </section>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="above_cta" pagePath={`/services/${categorySlug}`} /></Suspense>}

      {/* Explore Other Services */}
      {otherCategories.length > 0 && (
        <section className="bg-brand-surface py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-bold text-site-text">
              Explore Our Other Services
            </h2>
            <p className="mt-2 text-site-text-muted">
              Browse our full range of professional auto care services.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/services/${cat.slug}`}
                  className="group flex items-center justify-between rounded-2xl bg-brand-dark p-5 border border-site-border transition-all duration-300 hover:border-accent-ui/30 hover:bg-site-border-light"
                >
                  <div>
                    <h3 className="font-display text-base font-semibold text-site-text group-hover:text-accent-ui transition-colors">
                      {cat.name}
                    </h3>
                    {cat.description && (
                      <p className="mt-1 text-sm text-site-text-muted line-clamp-2">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="ml-3 h-4 w-4 flex-shrink-0 text-site-text-dim group-hover:text-accent-ui transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SectionTickerSlot position="before_cta" pageType="services" />

      <CtaSection />
    </>
  );
}
