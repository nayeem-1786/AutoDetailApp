import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, Truck, Tag, ArrowRight, CalendarDays } from 'lucide-react';
import {
  getServiceBySlug,
  getAllServicesForSitemap,
} from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { generateServiceMetadata } from '@/lib/seo/metadata';
import { generateServiceSchema, generateBreadcrumbSchema } from '@/lib/seo/json-ld';
import { SITE_URL, CLASSIFICATION_LABELS } from '@/lib/utils/constants';
import { formatCurrency } from '@/lib/utils/format';
import { ServicePricingDisplay } from '@/components/public/service-pricing-display';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';

interface PageProps {
  params: Promise<{ categorySlug: string; serviceSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug, serviceSlug } = await params;
  const result = await getServiceBySlug(categorySlug, serviceSlug);

  if (!result) {
    return { title: 'Service Not Found' };
  }

  const businessInfo = await getBusinessInfo();
  return generateServiceMetadata(result.service, result.category, businessInfo.name);
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
  const businessInfo = await getBusinessInfo();
  const addonSuggestions = service.service_addon_suggestions ?? [];

  // Map service_pricing to the pricing field expected by ServicePricingDisplay
  const serviceWithPricing = {
    ...service,
    pricing: service.service_pricing,
  };

  // Build breadcrumb data for JSON-LD
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
      <JsonLd data={generateBreadcrumbSchema(breadcrumbItems)} />

      <article className="bg-white dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Services', href: '/services' },
              { label: category.name, href: `/services/${category.slug}` },
              { label: service.name },
            ]}
          />

          {/* Header */}
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl">
              {service.name}
            </h1>
            {service.description && (
              <p className="mt-4 text-lg leading-relaxed text-gray-600 dark:text-gray-400">
                {service.description}
              </p>
            )}
          </div>

          {/* Two-column layout: pricing + details */}
          <div className="mt-12 grid gap-10 lg:grid-cols-3">
            {/* Left column: pricing (takes 2/3 on large screens) */}
            <div className="lg:col-span-2">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Pricing</h2>
              <div className="mt-4">
                <ServicePricingDisplay service={serviceWithPricing} />
              </div>
            </div>

            {/* Right column: service details sidebar */}
            <aside className="lg:col-span-1">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Service Details
                </h2>
                <dl className="mt-4 space-y-4">
                  {/* Duration */}
                  {service.base_duration_minutes > 0 && (
                    <div className="flex items-start gap-3">
                      <Clock className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          Estimated Duration
                        </dt>
                        <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                          {service.base_duration_minutes >= 60
                            ? `${Math.floor(service.base_duration_minutes / 60)}h ${service.base_duration_minutes % 60 > 0 ? `${service.base_duration_minutes % 60}m` : ''}`
                            : `${service.base_duration_minutes} minutes`}
                        </dd>
                      </div>
                    </div>
                  )}

                  {/* Mobile eligibility */}
                  <div className="flex items-start gap-3">
                    <Truck className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Mobile Service
                      </dt>
                      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {service.mobile_eligible
                          ? 'Available — we come to you'
                          : 'In-shop only'}
                      </dd>
                    </div>
                  </div>

                  {/* Classification */}
                  <div className="flex items-start gap-3">
                    <Tag className="mt-0.5 h-5 w-5 flex-shrink-0 text-gray-400 dark:text-gray-500" />
                    <div>
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Service Type
                      </dt>
                      <dd className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
                        {CLASSIFICATION_LABELS[service.classification] ??
                          service.classification}
                      </dd>
                    </div>
                  </div>

                  {/* Special requirements */}
                  {service.special_requirements && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Special Requirements
                      </dt>
                      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                        {service.special_requirements}
                      </dd>
                    </div>
                  )}

                  {/* Book This Service CTA */}
                  {service.online_bookable && (
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <Link
                        href={`/book?service=${service.slug}`}
                        className="flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-200"
                      >
                        <CalendarDays className="h-4 w-4" />
                        Book This Service
                      </Link>
                    </div>
                  )}
                </dl>
              </div>
            </aside>
          </div>

          {/* Suggested Add-Ons */}
          {addonSuggestions.length > 0 && (
            <section className="mt-16">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Recommended Add-Ons
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Enhance your {service.name.toLowerCase()} with these popular
                add-on services.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {addonSuggestions.map((suggestion) => {
                  const addon = suggestion.addon_service;
                  if (!addon) return null;

                  // Build the addon link — it belongs to the same category context
                  const addonHref = `/services/${categorySlug}/${addon.slug}`;

                  // Display combo price if available, otherwise addon's own starting price
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
                      className="group flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-all hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm dark:hover:shadow-gray-900/50"
                    >
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                          {addon.name}
                        </h3>
                        {addon.description && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                            {addon.description}
                          </p>
                        )}
                        {priceLabel && (
                          <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {priceLabel}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="ml-3 h-4 w-4 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </article>

      <CtaSection />
    </>
  );
}
