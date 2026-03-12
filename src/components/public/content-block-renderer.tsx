import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Star, Quote } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { getActiveTeamMembers } from '@/lib/data/team-members';
import { getActiveCredentials } from '@/lib/data/credentials';
import { GalleryLightbox } from './gallery-lightbox';
import { TeamGridLayout } from './team-grid-layout';
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
  // Content is stored as HTML (after C.7 migration).
  // For legacy markdown content that wasn't migrated, do a simple fallback conversion.
  const content = block.content.trim();
  const isHtml = content.startsWith('<') || content.includes('</');
  const html = isHtml ? content : legacyMarkdownToHtml(content);

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-6">
          {block.title}
        </h2>
      )}
      <div
        className="prose prose-invert max-w-none prose-headings:font-display prose-h2:text-2xl prose-h3:text-xl prose-p:text-site-text-muted prose-p:leading-relaxed prose-a:text-accent-brand hover:prose-a:text-accent-ui prose-li:text-site-text-muted"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ Block — with schema markup
// ---------------------------------------------------------------------------

function FaqBlock({ block }: { block: PageContentBlock }) {
  const rawItems = parseJsonContent<FaqItem[]>(block.content);
  const items = rawItems?.filter((i) => i.question?.trim()) ?? [];
  if (items.length === 0) return null;

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
  const rawItems = parseJsonContent<FeatureItem[]>(block.content);
  const items = rawItems?.filter((i) => i.title?.trim()) ?? [];
  if (items.length === 0) return null;

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
              <CheckCircle className="h-6 w-6 flex-shrink-0 text-accent-brand mt-0.5" />
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
          <div className="w-64 h-64 bg-accent-brand/5 rounded-full blur-3xl" />
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
            className="inline-flex items-center justify-center gap-2 site-btn-cta btn-accent-glow font-semibold text-base h-13 px-8 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300"
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
        <Quote className="h-8 w-8 text-accent-ui mb-4" />
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
// Team Grid Block — reads from team_members table with config
// ---------------------------------------------------------------------------

interface TeamGridConfig {
  source?: string;
  columns?: 2 | 3 | 4;
  show_certifications?: boolean;
  show_excerpt?: boolean;
  max_members?: number;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function TeamGridBlock({ block }: { block: PageContentBlock }) {
  let config: TeamGridConfig = {};
  try {
    config = JSON.parse(block.content);
  } catch { /* use defaults */ }

  const showCertifications = config.show_certifications ?? true;
  const showExcerpt = config.show_excerpt ?? true;
  const maxMembers = config.max_members ?? 0;

  const allMembers = await getActiveTeamMembers();
  const visibleMembers = maxMembers > 0 ? allMembers.slice(0, maxMembers) : allMembers;

  if (visibleMembers.length === 0) return null;

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <TeamGridLayout
        items={visibleMembers}
        cardWidth="w-full sm:w-72"
        renderCard={(member) => (
          <Link
            href={`/team/${member.slug}`}
            className="group flex flex-col items-center text-center rounded-2xl border border-site-border bg-brand-surface p-6 hover:border-accent-ui/30 transition-colors"
          >
            {/* Photo or initials */}
            {member.photo_url ? (
              <div className="relative h-32 w-32 overflow-hidden rounded-full mb-4">
                <Image
                  src={member.photo_url}
                  alt={member.name}
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              </div>
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-accent-ui/10 text-accent-brand text-3xl font-bold mb-4">
                {getInitials(member.name)}
              </div>
            )}

            {/* Name */}
            <h3 className="text-base font-bold text-site-text group-hover:text-accent-ui transition-colors">
              {member.name}
            </h3>

            {/* Role */}
            <p className="mt-1 text-sm font-medium text-accent-brand">
              {member.role}
            </p>

            {/* Bio — excerpt (plain text) preferred, fallback to truncated HTML bio */}
            {showExcerpt && (member.excerpt || member.bio) && (
              member.excerpt ? (
                <p className="mt-3 text-sm leading-relaxed text-site-text-muted line-clamp-3">
                  {member.excerpt}
                </p>
              ) : (
                <div
                  className="mt-3 text-sm leading-relaxed text-site-text-muted line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: member.bio || '' }}
                />
              )
            )}

            {/* Certifications */}
            {showCertifications && member.certifications.length > 0 && (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                {member.certifications.map((cert) => (
                  <span
                    key={cert}
                    className="inline-block rounded-full bg-accent-ui/10 border border-accent-ui/20 px-2 py-0.5 text-[10px] font-medium text-accent-brand"
                  >
                    {cert}
                  </span>
                ))}
              </div>
            )}
          </Link>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Credentials Block — reads from credentials table with config
// ---------------------------------------------------------------------------

interface CredentialsBlockConfig {
  source?: string;
  layout?: 'grid' | 'list';
  show_descriptions?: boolean;
  max_items?: number;
}

async function CredentialsBlock({ block }: { block: PageContentBlock }) {
  let config: CredentialsBlockConfig = {};
  try {
    const parsed = JSON.parse(block.content);
    // New config format has source field; legacy format is an array
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      config = parsed;
    }
  } catch { /* use defaults */ }

  const showDescriptions = config.show_descriptions ?? true;
  const maxItems = config.max_items ?? 0;
  const layout = config.layout ?? 'grid';

  const allCredentials = await getActiveCredentials();
  const visibleCredentials = maxItems > 0 ? allCredentials.slice(0, maxItems) : allCredentials;

  if (visibleCredentials.length === 0) return null;

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      {layout === 'list' ? (
        <div className="space-y-4">
          {visibleCredentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center gap-4 rounded-xl border border-site-border bg-brand-surface p-4"
            >
              {cred.image_url && (
                <div className="relative h-16 w-16 flex-shrink-0">
                  <Image
                    src={cred.image_url}
                    alt={cred.title}
                    fill
                    className="object-contain"
                    sizes="64px"
                  />
                </div>
              )}
              <div>
                <h3 className="text-base font-semibold text-site-text">
                  {cred.title}
                </h3>
                {showDescriptions && cred.description && (
                  <div
                    className="mt-1 text-sm leading-relaxed text-site-text-muted"
                    dangerouslySetInnerHTML={{ __html: cred.description }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCredentials.map((cred) => (
            <div
              key={cred.id}
              className="flex flex-col items-center text-center rounded-2xl border border-site-border bg-brand-surface p-6"
            >
              {cred.image_url && (
                <div className="relative h-20 w-20 mb-4 flex-shrink-0">
                  <Image
                    src={cred.image_url}
                    alt={cred.title}
                    fill
                    className="object-contain"
                    sizes="80px"
                  />
                </div>
              )}
              <h3 className="text-base font-semibold text-site-text">
                {cred.title}
              </h3>
              {showDescriptions && cred.description && (
                <div
                  className="mt-2 text-sm leading-relaxed text-site-text-muted"
                  dangerouslySetInnerHTML={{ __html: cred.description }}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Terms Sections Block
// ---------------------------------------------------------------------------

interface TermsSection {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  sort_order: number;
}

interface TermsSectionsData {
  effective_date: string | null;
  sections: TermsSection[];
}

async function TermsSectionsBlock({ block }: { block: PageContentBlock }) {
  let data: TermsSectionsData;
  try {
    const parsed = JSON.parse(block.content);
    // Handle legacy array format
    if (Array.isArray(parsed)) {
      data = { effective_date: null, sections: parsed };
    } else {
      data = {
        effective_date: parsed.effective_date ?? null,
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      };
    }
  } catch {
    return null;
  }

  const activeSections = data.sections
    .filter((s) => s.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (activeSections.length === 0) return null;

  const biz = await getBusinessInfo();

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-6">
          {block.title}
        </h2>
      )}

      {data.effective_date && (
        <p className="text-sm text-site-text-muted mb-8">
          Effective Date:{' '}
          {new Date(data.effective_date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      )}

      <div className="space-y-10">
        {activeSections.map((section, idx) => (
          <div key={section.id}>
            <h3 className="font-display text-xl font-semibold text-site-text">
              {idx + 1}. {section.title}
            </h3>
            {section.content ? (
              <div
                className="mt-3 text-sm leading-relaxed text-site-text-muted prose prose-invert prose-sm max-w-none prose-p:text-site-text-muted prose-li:text-site-text-muted prose-a:text-accent-brand"
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
            <a href={`mailto:${biz.email}`} className="text-accent-brand hover:underline">
              {biz.email}
            </a>
          ) : (
            <a href={`tel:${biz.phone}`} className="text-accent-brand hover:underline">
              {biz.phone}
            </a>
          )}
          .
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gallery Block
// ---------------------------------------------------------------------------

interface GalleryImage {
  id: string;
  image_url: string;
  caption: string;
  alt_text: string;
  sort_order: number;
}

interface GalleryData {
  images: GalleryImage[];
}

function GalleryBlock({ block }: { block: PageContentBlock }) {
  let data: GalleryData;
  try {
    const parsed = JSON.parse(block.content);
    if (Array.isArray(parsed)) {
      data = { images: parsed };
    } else {
      data = { images: Array.isArray(parsed.images) ? parsed.images : [] };
    }
  } catch {
    return null;
  }

  const visibleImages = data.images
    .filter((img) => img.image_url)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (visibleImages.length === 0) return null;

  return (
    <div className="content-block">
      {block.title && (
        <h2 className="font-display text-2xl font-bold tracking-tight text-site-text sm:text-3xl mb-8">
          {block.title}
        </h2>
      )}
      <GalleryLightbox images={visibleImages} />
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
      return <TeamGridBlock block={block} />;
    case 'credentials':
      return <CredentialsBlock block={block} />;
    case 'terms_sections':
      return <TermsSectionsBlock block={block} />;
    case 'gallery':
      return <GalleryBlock block={block} />;
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
// Legacy Markdown → HTML converter (fallback for unmigrated content)
// ---------------------------------------------------------------------------

function legacyMarkdownToHtml(md: string): string {
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
