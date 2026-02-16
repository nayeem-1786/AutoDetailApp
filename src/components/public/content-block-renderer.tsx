import Link from 'next/link';
import { ArrowRight, CheckCircle, Star, Quote } from 'lucide-react';
import type { PageContentBlock } from '@/lib/supabase/types';

// ---------------------------------------------------------------------------
// ContentBlockRenderer — renders content blocks on public pages
// Server Component — no 'use client' needed
// ---------------------------------------------------------------------------

interface FaqItem {
  question: string;
  answer: string;
}

interface FeatureItem {
  title: string;
  description: string;
}

interface CtaData {
  heading: string;
  description: string;
  button_text: string;
  button_url: string;
}

interface TestimonialData {
  quote: string;
  author: string;
  rating: number;
  source: string;
}

function parseJsonContent<T>(content: string): T | null {
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rich Text Block
// ---------------------------------------------------------------------------

function RichTextBlock({ block }: { block: PageContentBlock }) {
  // Simple markdown-to-HTML conversion for headings, bold, italic, links, lists
  const html = markdownToHtml(block.content);

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl mb-6">
          {block.title}
        </h2>
      )}
      <div
        className="prose prose-gray dark:prose-invert max-w-none prose-headings:font-display prose-h2:text-2xl prose-h3:text-xl prose-p:text-gray-600 dark:prose-p:text-gray-400 prose-p:leading-relaxed prose-a:text-brand-600 hover:prose-a:text-brand-700 prose-li:text-gray-600 dark:prose-li:text-gray-400"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ Block — with schema markup
// ---------------------------------------------------------------------------

function FaqBlock({ block }: { block: PageContentBlock }) {
  const items = parseJsonContent<FaqItem[]>(block.content);
  if (!items || items.length === 0) return null;

  // FAQ structured data
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <div className="content-block">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer items-center justify-between px-6 py-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
              <span className="text-base font-medium text-gray-900 dark:text-gray-100 pr-4">
                {item.question}
              </span>
              <ArrowRight className="h-5 w-5 flex-shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-6 pb-5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {item.answer}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Features List Block
// ---------------------------------------------------------------------------

function FeaturesListBlock({ block }: { block: PageContentBlock }) {
  const items = parseJsonContent<FeatureItem[]>(block.content);
  if (!items || items.length === 0) return null;

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 flex-shrink-0 text-brand-500 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {item.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CTA Block
// ---------------------------------------------------------------------------

function CtaBlock({ block }: { block: PageContentBlock }) {
  const data = parseJsonContent<CtaData>(block.content);
  if (!data) return null;

  return (
    <div className="content-block">
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-8 py-12 text-center sm:px-12 sm:py-16">
        <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {data.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-brand-100">
          {data.description}
        </p>
        <div className="mt-8">
          <Link
            href={data.button_url || '/book'}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white text-navy font-semibold text-base h-13 px-8 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
          >
            {data.button_text || 'Book Now'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testimonial Highlight Block
// ---------------------------------------------------------------------------

function TestimonialBlock({ block }: { block: PageContentBlock }) {
  const data = parseJsonContent<TestimonialData>(block.content);
  if (!data) return null;

  return (
    <div className="content-block">
      <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-8 sm:p-10">
        <Quote className="h-8 w-8 text-brand-400 mb-4" />
        <blockquote className="text-lg leading-relaxed text-gray-800 dark:text-gray-200 italic">
          &ldquo;{data.quote}&rdquo;
        </blockquote>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {data.author}
            </p>
            {data.source && (
              <p className="text-xs text-gray-500">{data.source}</p>
            )}
          </div>
          {data.rating > 0 && (
            <div className="flex items-center gap-0.5">
              {Array.from({ length: data.rating }).map((_, j) => (
                <Star
                  key={j}
                  className="h-4 w-4 fill-amber-400 text-amber-400"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Master Renderer
// ---------------------------------------------------------------------------

export function ContentBlockRenderer({ block }: { block: PageContentBlock }) {
  switch (block.block_type) {
    case 'rich_text':
      return <RichTextBlock block={block} />;
    case 'faq':
      return <FaqBlock block={block} />;
    case 'features_list':
      return <FeaturesListBlock block={block} />;
    case 'cta':
      return <CtaBlock block={block} />;
    case 'testimonial_highlight':
      return <TestimonialBlock block={block} />;
    default:
      return null;
  }
}

/**
 * Render a list of content blocks with proper spacing.
 */
export function ContentBlocks({ blocks }: { blocks: PageContentBlock[] }) {
  if (blocks.length === 0) return null;

  return (
    <section className="bg-white dark:bg-gray-900 section-spacing">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-12">
        {blocks.map((block) => (
          <ContentBlockRenderer key={block.id} block={block} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Simple Markdown → HTML converter (no heavy dependencies)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities first
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
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists
  html = html.replace(
    /^(?:- (.+)\n?)+/gm,
    (match) => {
      const items = match
        .split('\n')
        .filter((line) => line.startsWith('- '))
        .map((line) => `<li>${line.slice(2)}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    }
  );

  // Ordered lists
  html = html.replace(
    /^(?:\d+\. (.+)\n?)+/gm,
    (match) => {
      const items = match
        .split('\n')
        .filter((line) => /^\d+\. /.test(line))
        .map((line) => `<li>${line.replace(/^\d+\. /, '')}</li>`)
        .join('');
      return `<ol>${items}</ol>`;
    }
  );

  // Paragraphs — wrap remaining text blocks
  html = html
    .split('\n\n')
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<ol')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  return html;
}
