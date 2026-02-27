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
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-6">
          {block.title}
        </h2>
      )}
      <div
        className="prose prose-invert max-w-none prose-headings:font-display prose-h2:text-2xl prose-h3:text-xl prose-p:text-site-text-muted prose-p:leading-relaxed prose-a:text-lime hover:prose-a:text-lime-400 prose-li:text-site-text-muted"
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
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <div className="divide-y divide-site-border rounded-2xl border border-site-border overflow-hidden">
        {items.map((item, i) => (
          <details key={i} className="group">
            <summary className="flex cursor-pointer items-center justify-between px-6 py-5 text-left hover:bg-site-border-light transition-colors">
              <span className="text-base font-medium text-site-text pr-4">
                {item.question}
              </span>
              <ArrowRight className="h-5 w-5 flex-shrink-0 text-site-text-muted transition-transform group-open:rotate-90" />
            </summary>
            <div className="px-6 pb-5 text-sm leading-relaxed text-site-text-muted">
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
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        {items.map((item, i) => (
          <div
            key={i}
            className="rounded-xl border border-site-border bg-brand-surface p-6"
          >
            <div className="flex items-start gap-3">
              <CheckCircle className="h-6 w-6 flex-shrink-0 text-lime mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-site-text">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-site-text-muted">
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
      <div className="rounded-2xl bg-gradient-to-br from-brand-grey to-black border border-site-border px-8 py-12 text-center sm:px-12 sm:py-16 relative overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-hidden="true">
          <div className="w-64 h-64 bg-lime/5 rounded-full blur-3xl" />
        </div>
        <div className="relative">
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl">
          {data.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-site-text-muted">
          {data.description}
        </p>
        <div className="mt-8">
          <Link
            href={data.button_url || '/book'}
            className="inline-flex items-center justify-center gap-2 site-btn-cta btn-lime-glow font-semibold text-base h-13 px-8 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
          >
            {data.button_text || 'Book Now'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
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
      <div className="rounded-2xl bg-brand-surface p-8 sm:p-10">
        <Quote className="h-8 w-8 text-lime mb-4" />
        <blockquote className="text-lg leading-relaxed text-site-text-secondary italic">
          &ldquo;{data.quote}&rdquo;
        </blockquote>
        <div className="mt-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-site-text">
              {data.author}
            </p>
            {data.source && (
              <p className="text-xs text-site-text-dim">{data.source}</p>
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
// Placeholder Block — stub for block types awaiting full renderers
// ---------------------------------------------------------------------------

function PlaceholderBlock({ block }: { block: PageContentBlock }) {
  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-6">
          {block.title}
        </h2>
      )}
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
    case 'team_grid':
    case 'credentials':
    case 'terms_sections':
    case 'gallery':
      return <PlaceholderBlock block={block} />;
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
    <section className="bg-brand-dark section-spacing">
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
