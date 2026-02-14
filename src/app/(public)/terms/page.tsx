import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { createClient } from '@/lib/supabase/server';
import { Breadcrumbs } from '@/components/public/breadcrumbs';

export async function generateMetadata(): Promise<Metadata> {
  const [biz, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/terms'),
  ]);
  const auto: Metadata = {
    title: `Terms & Conditions — ${biz.name}`,
    description: `Terms and conditions for services provided by ${biz.name}. Covers service agreements, cancellation policy, SMS consent, and more.`,
    alternates: { canonical: `${SITE_URL}/terms` },
  };
  return mergeMetadata(auto, seoOverrides);
}

interface TcSection {
  title: string;
  content: string;
  is_active: boolean;
}

async function getTermsContent(): Promise<{ sections: TcSection[]; effectiveDate: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['terms_and_conditions', 'terms_effective_date']);

  const settings: Record<string, unknown> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  const sections = (settings.terms_and_conditions as TcSection[]) ?? getDefaultSections();
  const effectiveDate = (settings.terms_effective_date as string) ?? null;

  return { sections: sections.filter((s) => s.is_active), effectiveDate };
}

function getDefaultSections(): TcSection[] {
  return [
    {
      title: 'Service Agreement & Liability',
      content:
        'We exercise professional care during all services. However, we are not responsible for pre-existing scratches, swirl marks, paint chips, or clear coat failure. Items left in vehicles are not our responsibility. Vehicle condition is documented via photo inspection at intake. Claims must be reported within 24 hours of service completion with supporting evidence.',
      is_active: true,
    },
    {
      title: 'Payment Terms',
      content:
        'Payment is due upon completion of service. We accept cash, credit/debit cards, and checks. Deposits for ceramic coating services are non-refundable.',
      is_active: true,
    },
    {
      title: 'Cancellation & No-Show Policy',
      content:
        '24-hour notice is required for cancellation without fee. Late cancellations and no-shows may be charged a cancellation fee. Repeated no-shows may require a deposit for future bookings.',
      is_active: true,
    },
    {
      title: 'SMS & Text Message Consent',
      content:
        'By providing your phone number, you consent to receive service-related messages (appointment confirmations, reminders, completion notifications). Marketing messages (promotions, special offers) are optional. Message and data rates may apply. Message frequency varies. Reply STOP to opt out of marketing messages at any time. Reply HELP for assistance. Opting out of marketing does not affect service-related messages.',
      is_active: true,
    },
    {
      title: 'Email Communications',
      content:
        'By providing your email, you may receive transactional emails (booking confirmations, receipts, quote notifications). Marketing emails (promotions, newsletters) require separate opt-in. An unsubscribe link is provided in every marketing email.',
      is_active: true,
    },
    {
      title: 'Photo Documentation & Usage',
      content:
        'Service photos are taken for quality documentation purposes. Photos may be used for marketing (website gallery, social media) unless you opt out. Internal-only photos are never shared publicly. You may request photo removal at any time.',
      is_active: true,
    },
    {
      title: 'Warranty & Service Guarantees',
      content:
        'Ceramic coating warranty terms vary by product tier (1-year, 3-year, 5-year). Warranty requires adherence to the recommended maintenance schedule. Warranty is void if the vehicle is subjected to improper washing, chemical damage, physical damage, or unauthorized touch-ups. Standard services include a satisfaction guarantee within 24 hours.',
      is_active: true,
    },
    {
      title: 'Mobile / On-Location Service',
      content:
        'For mobile services, you must provide adequate workspace (shade preferred, flat surface). Water and electrical access may be required for certain services. You are responsible for ensuring the location is safe and accessible. We reserve the right to refuse service if the location is deemed unsafe or inadequate.',
      is_active: true,
    },
    {
      title: 'General Terms',
      content:
        'We reserve the right to refuse service. Pricing is subject to change without notice. Service estimates are approximations — the final price may vary based on vehicle condition. These terms are governed by the laws of the State of California.',
      is_active: true,
    },
  ];
}

export default async function TermsPage() {
  const biz = await getBusinessInfo();
  const { sections, effectiveDate } = await getTermsContent();

  return (
    <>
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
          <Breadcrumbs items={[{ label: 'Terms & Conditions' }]} variant="light" />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Terms &amp; Conditions
          </h1>
          {effectiveDate && (
            <p className="mt-3 text-sm text-blue-100/60">
              Effective Date: {new Date(effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface dark:bg-gray-900 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-10">
            {sections.map((section, idx) => (
              <div key={idx}>
                <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {idx + 1}. {section.title}
                </h2>
                <div className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400 whitespace-pre-line">
                  {section.content}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-16 border-t border-gray-200 dark:border-gray-700 pt-8">
            <p className="text-xs text-gray-400">
              If you have questions about these terms, please contact us at{' '}
              {biz.email ? (
                <a href={`mailto:${biz.email}`} className="text-brand-600 hover:underline">
                  {biz.email}
                </a>
              ) : (
                <a href={`tel:${biz.phone}`} className="text-brand-600 hover:underline">
                  {biz.phone}
                </a>
              )}
              .
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
