import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServiceCategories, getServicesByCategory } from '@/lib/data/services';
import { generateCategoryMetadata } from '@/lib/seo/metadata';
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

  return generateCategoryMetadata(result.category, 'service');
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

  return (
    <>
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs
            items={[
              { label: 'Services', href: '/services' },
              { label: category.name },
            ]}
          />

          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {category.name}
          </h1>
          {category.description && (
            <p className="mt-4 max-w-3xl text-lg text-gray-600">
              {category.description}
            </p>
          )}

          {services.length > 0 ? (
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
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
            <p className="mt-12 text-gray-500">
              No services are currently available in this category. Please check
              back soon.
            </p>
          )}
        </div>
      </section>

      <CtaSection />
    </>
  );
}
