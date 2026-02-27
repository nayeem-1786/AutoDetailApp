import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft } from 'lucide-react';
import { getBusinessInfo } from '@/lib/data/business';
import { getActiveTeamMembers, getTeamMemberBySlug } from '@/lib/data/team-members';
import { SITE_URL } from '@/lib/utils/constants';

export const revalidate = 300;

// ---------------------------------------------------------------------------
// /team/[memberSlug] — Team member detail page
// Data source: team_members table
// ---------------------------------------------------------------------------

type PageProps = {
  params: Promise<{ memberSlug: string }>;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Static params — pre-render all member slugs
// ---------------------------------------------------------------------------

export async function generateStaticParams() {
  const members = await getActiveTeamMembers();
  return members.map((m) => ({ memberSlug: m.slug }));
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { memberSlug } = await params;
  const member = await getTeamMemberBySlug(memberSlug);
  if (!member) return {};

  const biz = await getBusinessInfo();
  const bioText = member.bio ? stripHtml(member.bio) : '';
  const description = bioText
    ? bioText.slice(0, 160) + (bioText.length > 160 ? '...' : '')
    : `${member.name} is a ${member.role} at ${biz.name}.`;

  return {
    title: `${member.name} — ${member.role} | ${biz.name}`,
    description,
    openGraph: {
      title: `${member.name} — ${member.role} | ${biz.name}`,
      description,
      url: `${SITE_URL}/team/${member.slug}`,
      ...(member.photo_url ? { images: [{ url: member.photo_url }] } : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default async function TeamMemberPage({ params }: PageProps) {
  const { memberSlug } = await params;
  const member = await getTeamMemberBySlug(memberSlug);

  if (!member) {
    notFound();
  }

  const biz = await getBusinessInfo();

  // JSON-LD Person schema
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: member.name,
    jobTitle: member.role,
    ...(member.photo_url ? { image: member.photo_url } : {}),
    worksFor: {
      '@type': 'LocalBusiness',
      name: biz.name,
      url: SITE_URL,
    },
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />

      {/* Back link */}
      <Link
        href="/p/about"
        className="inline-flex items-center gap-1.5 text-sm text-site-text-muted hover:text-lime transition-colors mb-8"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to About
      </Link>

      {/* Header section */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:text-left sm:items-start gap-8">
        {/* Photo */}
        {member.photo_url ? (
          <div className="relative h-[300px] w-[300px] flex-shrink-0 overflow-hidden rounded-full sm:rounded-2xl">
            <Image
              src={member.photo_url}
              alt={member.name}
              fill
              className="object-cover"
              sizes="300px"
              priority
            />
          </div>
        ) : (
          <div className="flex h-[300px] w-[300px] flex-shrink-0 items-center justify-center rounded-full sm:rounded-2xl bg-lime/10 text-lime text-6xl font-bold">
            {getInitials(member.name)}
          </div>
        )}

        {/* Info */}
        <div className="flex-1">
          <h1 className="font-display text-3xl font-bold tracking-tight text-site-text sm:text-4xl">
            {member.name}
          </h1>
          <p className="mt-2 text-lg font-medium text-lime">
            {member.role}
          </p>

          {/* Years of service */}
          {member.years_of_service != null && member.years_of_service > 0 && (
            <p className="mt-3 text-sm text-site-text-muted">
              {member.years_of_service} year{member.years_of_service !== 1 ? 's' : ''} of service
            </p>
          )}

          {/* Certifications */}
          {member.certifications.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 justify-center sm:justify-start">
              {member.certifications.map((cert) => (
                <span
                  key={cert}
                  className="inline-block rounded-full bg-lime/10 border border-lime/20 px-3 py-1 text-xs font-medium text-lime"
                >
                  {cert}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full bio */}
      {member.bio && (
        <div className="mt-12">
          <div
            className="prose prose-invert max-w-none prose-headings:font-display prose-p:text-site-text-muted prose-p:leading-relaxed prose-a:text-lime hover:prose-a:text-lime-400 prose-li:text-site-text-muted"
            dangerouslySetInnerHTML={{ __html: member.bio }}
          />
        </div>
      )}
    </div>
  );
}
