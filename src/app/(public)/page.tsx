import type { Metadata } from 'next';
import { Shield, Truck, ShoppingBag, DollarSign } from 'lucide-react';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION } from '@/lib/utils/constants';
import { getServiceCategories } from '@/lib/data/services';
import { getBusinessInfo } from '@/lib/data/business';
import { generateLocalBusinessSchema } from '@/lib/seo/json-ld';
import { HeroSection } from '@/components/public/hero-section';
import { ServiceCategoryCard } from '@/components/public/service-category-card';
import { CtaSection } from '@/components/public/cta-section';
import { JsonLd } from '@/components/public/json-ld';

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

const features = [
  {
    icon: Shield,
    title: 'Expert Ceramic Coatings',
    description:
      'Professional-grade ceramic coatings for lasting protection against the elements.',
  },
  {
    icon: Truck,
    title: 'Mobile Detailing',
    description:
      'We come to you. Available throughout the South Bay area for your convenience.',
  },
  {
    icon: ShoppingBag,
    title: 'Premium Products',
    description:
      'Top-quality car care products available for purchase in-store and online.',
  },
  {
    icon: DollarSign,
    title: 'Transparent Pricing',
    description:
      'Clear, upfront pricing for all services. No hidden fees or surprises.',
  },
] as const;

export default async function HomePage() {
  const [categories, businessInfo] = await Promise.all([
    getServiceCategories(),
    getBusinessInfo(),
  ]);

  return (
    <>
      <JsonLd data={generateLocalBusinessSchema(businessInfo)} />

      <HeroSection />

      {/* Our Services */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Our Services
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-gray-600">
              From basic washes to full ceramic coating packages, we offer a
              comprehensive range of auto detailing services tailored to your
              vehicle&apos;s needs.
            </p>
          </div>

          {categories.length > 0 && (
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <ServiceCategoryCard key={category.id} category={category} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              Why Choose {SITE_NAME}?
            </h2>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-900 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-600">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <CtaSection />
    </>
  );
}
