import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageBySlug, getPageBySlugForPreview, getPublishedPages } from '@/lib/data/website-pages';
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
  searchParams: Promise<{ preview?: string; token?: string }>;
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

export default async function CustomPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const slugPath = slug.join('/');
  const sp = await searchParams;

  const isPreviewRequest = sp.preview === 'true' && !!sp.token;

  let page;
  let isPreview = false;

  if (isPreviewRequest) {
    // Preview mode: fetch without published filter, validate token
    page = await getPageBySlugForPreview(slugPath);

    if (
      !page ||
      page.preview_token !== sp.token ||
      !page.preview_token_expires_at ||
      new Date(page.preview_token_expires_at) < new Date()
    ) {
      notFound();
    }

    isPreview = true;
  } else {
    // Normal mode: published only
    page = await getPageBySlug(slugPath);
    if (!page) {
      notFound();
    }
  }

  const contentBlocks = await getPageContentBlocks(`/p/${slugPath}`);

  // Preview banner component
  const previewBanner = isPreview ? (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-center py-2 text-sm font-medium shadow-md">
      Preview Mode — This page is not published.
      <a href={`/admin/website/pages/${page.id}`} className="underline ml-2">
        Back to Editor
      </a>
    </div>
  ) : null;

  // Wrapper to add top padding when preview banner is shown
  const previewPadding = isPreview ? 'pt-10' : '';

  // Template: content — standard page with container + prose
  if (page.page_template === 'content') {
    return (
      <div className={previewPadding}>
        {previewBanner}
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
      </div>
    );
  }

  // Template: landing — full width, no container
  if (page.page_template === 'landing') {
    return (
      <div className={previewPadding}>
        {previewBanner}
        {page.content && (
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <div
              className="prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </div>
        )}
        <ContentBlocks blocks={contentBlocks} />
      </div>
    );
  }

  // Template: blank — raw content blocks only
  return (
    <div className={previewPadding}>
      {previewBanner}
      <ContentBlocks blocks={contentBlocks} />
    </div>
  );
}
