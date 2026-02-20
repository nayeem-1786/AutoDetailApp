import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageBySlug, getPublishedPages } from '@/lib/data/website-pages';
import { getPageContentBlocks } from '@/lib/data/page-content';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { ContentBlocks } from '@/components/public/content-block-renderer';
import { SITE_URL } from '@/lib/utils/constants';

export const revalidate = 300;

// ---------------------------------------------------------------------------
// /p/[...slug] — Custom page catch-all route
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ slug: string[] }>;
};

export async function generateStaticParams() {
  const pages = await getPublishedPages();
  return pages.map((page) => ({
    slug: page.slug.split('/'),
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const slugPath = slug.join('/');
  const page = await getPageBySlug(slugPath);

  if (!page) return {};

  const autoMeta: Metadata = {
    title: page.meta_title || page.title,
    description: page.meta_description || undefined,
    openGraph: {
      title: page.meta_title || page.title,
      description: page.meta_description || undefined,
      url: `${SITE_URL}/p/${page.slug}`,
      ...(page.og_image_url ? { images: [{ url: page.og_image_url }] } : {}),
    },
  };

  const seoOverrides = await getPageSeo(`/p/${slugPath}`);
  return mergeMetadata(autoMeta, seoOverrides);
}

export default async function CustomPage({ params }: PageProps) {
  const { slug } = await params;
  const slugPath = slug.join('/');
  const page = await getPageBySlug(slugPath);

  if (!page) {
    notFound();
  }

  const contentBlocks = await getPageContentBlocks(`/p/${slugPath}`);

  // Template: content — standard page with container + prose
  if (page.page_template === 'content') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold tracking-tight text-site-text sm:text-5xl">
          {page.title}
        </h1>
        {page.content && (
          <div
            className="mt-8 prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        )}
        {contentBlocks.length > 0 && (
          <div className="mt-12">
            <ContentBlocks blocks={contentBlocks} />
          </div>
        )}
      </div>
    );
  }

  // Template: landing — full width, no container
  if (page.page_template === 'landing') {
    return (
      <>
        {page.content && (
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </div>
        )}
        <ContentBlocks blocks={contentBlocks} />
      </>
    );
  }

  // Template: blank — raw content blocks only
  return <ContentBlocks blocks={contentBlocks} />;
}
