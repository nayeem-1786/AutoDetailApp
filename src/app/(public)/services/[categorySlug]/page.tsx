import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getServiceCategories, getServicesByCategory } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { generateCategoryMetadata } from '@/lib/seo/metadata';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { ServiceCard } from '@/components/public/service-card';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import { CtaSection } from '@/components/public/cta-section';

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
  const allCategories = await getServiceCategories();
  const otherCategories = allCategories.filter((cat) => cat.slug !== categorySlug);

  return (
    <>
      {/* Category Hero */}
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Services', href: '/services' },
              { label: category.name },
            ]}
            variant="light"
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-4 max-w-3xl text-lg text-blue-100/60">
              {category.description}
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {services.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {services.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={{
                    ...service,
                    pricing: service.service_pricing,
                  }}
                  categorySlug={categorySlug}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">
              No services are currently available in this category. Please check back soon.
            </p>
          )}
        </div>
      </section>

      {/* Explore Other Services */}
      {otherCategories.length > 0 && (
        <section className="bg-white dark:bg-gray-800 py-12 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-gray-100">
              Explore Our Other Services
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Browse our full range of professional auto care services.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherCategories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/services/${cat.slug}`}
                  className="group flex items-center justify-between rounded-2xl bg-gray-50 dark:bg-gray-700/50 p-5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <div>
                    <h3 className="font-display text-base font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-600 transition-colors">
                      {cat.name}
                    </h3>
                    {cat.description && (
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                        {cat.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="ml-3 h-4 w-4 flex-shrink-0 text-gray-400 group-hover:text-brand-600 transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <CtaSection />
    </>
  );
}
