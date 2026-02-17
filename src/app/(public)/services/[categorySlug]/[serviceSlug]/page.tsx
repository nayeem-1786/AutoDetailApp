import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, Truck, Tag, ArrowRight, CalendarDays } from 'lucide-react';
import {
  getServiceBySlug,
  getServicesByCategory,
  getAllServicesForSitemap,
} from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { generateServiceMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { generateServiceSchema, generateServiceFaqSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL, CLASSIFICATION_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { ServicePricingDisplay } from '@/components/public/service-pricing-display';
import { ServiceCard } from '@/components/public/service-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';
import { AdZone } from '@/components/public/cms/ad-zone';

export const revalidate = 300;

interface PageProps {
  params: Promise<{ categorySlug: string; serviceSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug, serviceSlug } = await params;
  const result = await getServiceBySlug(categorySlug, serviceSlug);

  if (!result) {
    return { title: 'Service Not Found' };
  }

  const [businessInfo, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo(`/services/${categorySlug}/${serviceSlug}`),
  ]);
  return mergeMetadata(
    generateServiceMetadata(result.service, result.category, businessInfo.name),
    seoOverrides
  );
}

export async function generateStaticParams() {
  const services = await getAllServicesForSitemap();
  return services.map((svc) => ({
    categorySlug: svc.categorySlug,
    serviceSlug: svc.serviceSlug,
  }));
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { categorySlug, serviceSlug } = await params;
  const result = await getServiceBySlug(categorySlug, serviceSlug);

  if (!result) {
    notFound();
  }

  const { service, category } = result;
  const [businessInfo, categoryResult] = await Promise.all([
    getBusinessInfo(),
    getServicesByCategory(categorySlug),
  ]);
  const addonSuggestions = service.service_addon_suggestions ?? [];

  // Get related services from the same category, excluding the current service
  const relatedServices = (categoryResult?.services ?? [])
    .filter((s) => s.id !== service.id)
    .slice(0, 3);

  const serviceWithPricing = {
    ...service,
    pricing: service.service_pricing,
  };

  const breadcrumbItems = [
    { name: 'Home', url: SITE_URL },
    { name: 'Services', url: `${SITE_URL}/services` },
    { name: category.name, url: `${SITE_URL}/services/${category.slug}` },
    {
      name: service.name,
      url: `${SITE_URL}/services/${category.slug}/${service.slug}`,
    },
  ];

  return (
    <>
      <JsonLd data={generateServiceSchema(service, category, businessInfo)} />
      <JsonLd data={generateServiceFaqSchema(service, category.name, businessInfo.name)} />
      <JsonLd data={generateBreadcrumbSchema(breadcrumbItems)} />

      {/* Service Header */}
      <section className="bg-brand-black py-14 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Services', href: '/services' },
              { label: category.name, href: `/services/${category.slug}` },
              { label: service.name },
            ]}
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {service.name}
          </h1>
          {service.description && (
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-400">
              {service.description}
            </p>
          )}
        </div>
      </section>

      <article className="bg-brand-dark py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Two-column layout: pricing + details */}
          <div className="grid gap-10 lg:grid-cols-3">
            {/* Left column: pricing */}
            <div className="lg:col-span-2">
              <h2 className="font-display text-xl font-semibold text-white">
                Pricing
              </h2>
              <div className="mt-4">
                <ServicePricingDisplay service={serviceWithPricing} />
              </div>
            </div>

            {/* Right column: service details sidebar */}
            <aside className="lg:col-span-1 space-y-6">
              <div className="sticky top-24 rounded-2xl bg-brand-surface border border-white/10 p-6">
                <h2 className="font-display text-lg font-semibold text-white">
                  Service Details
                </h2>
                <dl className="mt-4 space-y-4">
                  {service.base_duration_minutes > 0 && (
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lime/5">
                        <Clock className="h-4 w-4 text-lime" />
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-400">
                          Estimated Duration
                        </dt>
                        <dd className="mt-0.5 text-sm font-medium text-white">
                          {service.base_duration_minutes >= 60
                            ? `${Math.floor(service.base_duration_minutes / 60)}h ${service.base_duration_minutes % 60 > 0 ? `${service.base_duration_minutes % 60}m` : ''}`
                            : `${service.base_duration_minutes} minutes`}
                        </dd>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lime/5">
                      <Truck className="h-4 w-4 text-lime" />
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-400">
                        Mobile Service
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-white">
                        {service.mobile_eligible
                          ? 'Available — we come to you'
                          : 'In-shop only'}
                      </dd>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-lime/5">
                      <Tag className="h-4 w-4 text-lime" />
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-400">
                        Service Type
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-white">
                        {CLASSIFICATION_LABELS[service.classification] ??
                          service.classification}
                      </dd>
                    </div>
                  </div>

                  {service.special_requirements && (
                    <div className="border-t border-white/10 pt-4">
                      <dt className="text-sm font-medium text-gray-400">
                        Special Requirements
                      </dt>
                      <dd className="mt-1 text-sm text-white">
                        {service.special_requirements}
                      </dd>
                    </div>
                  )}

                  {service.online_bookable && (
                    <div className="border-t border-white/10 pt-4">
                      <Link
                        href={`/book?service=${service.slug}`}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-lime px-4 py-3 text-sm font-bold text-black shadow-sm hover:shadow-lime-lg hover:scale-[1.03] transition-all btn-lime-glow"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Book This Service
                      </Link>
                    </div>
                  )}
                </dl>
              </div>
              <Suspense fallback={null}><AdZone zoneId="sidebar" pagePath={`/services/${categorySlug}/${serviceSlug}`} /></Suspense>
            </aside>
          </div>

          {/* Suggested Add-Ons */}
          {addonSuggestions.length > 0 && (
            <section className="mt-16">
              <h2 className="font-display text-xl font-semibold text-white">
                Recommended Add-Ons
              </h2>
              <p className="mt-2 text-gray-400">
                Enhance your {service.name.toLowerCase()} with these popular add-on services.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {addonSuggestions.map((suggestion) => {
                  const addon = suggestion.addon_service;
                  if (!addon) return null;

                  const addonHref = `/services/${categorySlug}/${addon.slug}`;

                  let priceLabel: string | null = null;
                  if (suggestion.combo_price != null) {
                    priceLabel = `Add for ${formatCurrency(suggestion.combo_price)}`;
                  } else if (addon.flat_price != null) {
                    priceLabel = formatCurrency(addon.flat_price);
                  } else if (addon.custom_starting_price != null) {
                    priceLabel = `From ${formatCurrency(addon.custom_starting_price)}`;
                  }

                  return (
                    <Link
                      key={suggestion.id}
                      href={addonHref}
                      className="group flex items-center justify-between rounded-2xl bg-brand-surface p-4 border border-white/10 transition-all duration-300 hover:border-lime/30 hover:-translate-y-0.5"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-white group-hover:text-lime transition-colors">
                          {addon.name}
                        </h3>
                        {addon.description && (
                          <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                            {addon.description}
                          </p>
                        )}
                        {priceLabel && (
                          <p className="mt-1 text-sm font-bold text-lime">
                            {priceLabel}
                          </p>
                        )}
                      </div>
                      <div className="ml-3 flex-shrink-0 text-gray-500 group-hover:text-lime transition-colors">
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </article>

      {/* You May Also Like */}
      {relatedServices.length > 0 && (
        <section className="bg-brand-surface py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-bold text-white">
              You May Also Like
            </h2>
            <p className="mt-2 text-gray-400">
              Explore other {category.name.toLowerCase()} services we offer.
            </p>
            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedServices.map((related) => (
                <ServiceCard
                  key={related.id}
                  service={{
                    ...related,
                    pricing: related.service_pricing,
                  }}
                  categorySlug={categorySlug}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaSection />
    </>
  );
}
