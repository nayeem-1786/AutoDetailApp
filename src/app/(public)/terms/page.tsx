import type { Metadata } from 'next';
import { SITE_URL } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { getPageBySlug } from '@/lib/data/website-pages';
import { getPageContentBlocks } from '@/lib/data/page-content';
import { Breadcrumbs } from '@/components/public/breadcrumbs';
import AnimatedSection from '@/components/public/animated-section';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [biz, seoOverrides, page] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/terms'),
    getPageBySlug('terms'),
  ]);

  const auto: Metadata = {
    title: page?.meta_title || `Terms & Conditions — ${biz.name}`,
    description: page?.meta_description || `Terms and conditions for services provided by ${biz.name}. Covers service agreements, cancellation policy, SMS consent, and more.`,
    alternates: { canonical: `${SITE_URL}/terms` },
  };
  return mergeMetadata(auto, seoOverrides);
}

interface TcSection {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}

interface TermsBlockData {
  effective_date: string | null;
  sections: TcSection[];
}

async function getTermsContent(): Promise<{ sections: TcSection[]; effectiveDate: string | null }> {
  // Read from the terms_sections content block on the Terms page
  const blocks = await getPageContentBlocks('/p/terms');
  const termsBlock = blocks.find((b) => b.block_type === 'terms_sections');

  if (!termsBlock) {
    return { sections: [], effectiveDate: null };
  }

  try {
    const parsed = JSON.parse(termsBlock.content) as TermsBlockData;
    const sections = (parsed.sections ?? [])
      .filter((s) => s.is_active)
      .sort((a, b) => a.sort_order - b.sort_order);
    return { sections, effectiveDate: parsed.effective_date ?? null };
  } catch {
    return { sections: [], effectiveDate: null };
  }
}

export default async function TermsPage() {
  const [biz, { sections, effectiveDate }] = await Promise.all([
    getBusinessInfo(),
    getTermsContent(),
  ]);

  return (
    <>
      <section className="bg-brand-black py-14 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Breadcrumbs items={[{ label: 'Terms & Conditions' }]} />
          <AnimatedSection>
            <h1 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
              Terms &amp; Conditions
            </h1>
            {effectiveDate && (
              <p className="mt-3 text-sm text-site-text-muted">
                Effective Date: {new Date(effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </AnimatedSection>
        </div>
      </section>

      <section className="bg-brand-dark py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-10">
            {sections.map((section, idx) => (
              <div key={section.id}>
                <h2 className="font-display text-xl font-semibold text-site-text">
                  {idx + 1}. {section.title}
                </h2>
                {section.content ? (
                  <div
                    className="mt-3 text-sm leading-relaxed text-site-text-muted prose prose-invert prose-sm max-w-none prose-p:text-site-text-muted prose-li:text-site-text-muted prose-a:text-lime"
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                ) : (
                  <p className="mt-3 text-sm leading-relaxed text-site-text-muted">
                    {section.title}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-16 border-t border-site-border pt-8">
            <p className="text-xs text-site-text-muted">
              If you have questions about these terms, please contact us at{' '}
              {biz.email ? (
                <a href={`mailto:${biz.email}`} className="text-lime hover:underline">
                  {biz.email}
                </a>
              ) : (
                <a href={`tel:${biz.phone}`} className="text-lime hover:underline">
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
