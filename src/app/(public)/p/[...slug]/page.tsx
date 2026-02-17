import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPageBySlug } from '@/lib/data/website-pages';
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

/**
 * Simple markdown → HTML converter (matches the one in content-block-renderer).
 */
function markdownToHtml(md: string): string {
  let html = md;

  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-lime hover:underline">$1</a>');

  // Unordered lists
  html = html.replace(
    /^(?:- (.+)\n?)+/gm,
    (match) => {
      const items = match
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => `<li>${line.slice(2)}</li>`)
        .join('');
      return `<ul class="list-disc pl-6 space-y-1">${items}</ul>`;
    }
  );

  // Paragraphs
  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<')) return trimmed;
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .join('\n');

  return html;
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
            dangerouslySetInnerHTML={{ __html: markdownToHtml(page.content) }}
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
              dangerouslySetInnerHTML={{ __html: markdownToHtml(page.content) }}
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
