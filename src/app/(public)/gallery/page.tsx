import { Suspense } from 'react';
import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { getCmsToggles } from '@/lib/data/cms';
import { getZoneGroup } from '@/lib/utils/job-zones';
import { AdZone } from '@/components/public/cms/ad-zone';
import { GalleryClient } from './gallery-client';
import AnimatedSection from '@/components/public/animated-section';

export const revalidate = 300;

interface GalleryPair {
  job_id: string;
  zone: string;
  vehicle: { make: string; model: string; year: number | null } | null;
  service_names: string[];
  before_image: string;
  after_image: string;
  tags: string[];
}

async function getGalleryData(tag?: string): Promise<{
  pairs: GalleryPair[];
  filterOptions: string[];
  total: number;
}> {
  const supabase = createAdminClient();

  const { data: photos, error } = await supabase
    .from('job_photos')
    .select(
      `id, job_id, zone, phase, image_url, thumbnail_url, tags, created_at,
       jobs!inner(
         id, services, created_at,
         vehicles(make, model, year)
       )`
    )
    .eq('is_featured', true)
    .eq('is_internal', false)
    .in('phase', ['intake', 'completion'])
    .order('created_at', { ascending: false });

  if (error || !photos) return { pairs: [], filterOptions: [], total: 0 };

  // Group by (job_id, zone) — zone-level pairing
  const pairMap = new Map<string, {
    job_id: string;
    zone: string;
    vehicle: { make: string; model: string; year: number | null } | null;
    service_names: string[];
    date: string;
    intake: (typeof photos)[0] | null;
    completion: (typeof photos)[0] | null;
    manual_tags: string[];
  }>();

  for (const photo of photos) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = photo.jobs as any;
    const key = `${photo.job_id}:${photo.zone}`;

    if (!pairMap.has(key)) {
      const services = (job.services ?? []) as { id: string; name: string; price: number }[];
      pairMap.set(key, {
        job_id: photo.job_id,
        zone: photo.zone,
        vehicle: (Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles) as {
          make: string; model: string; year: number | null;
        } | null,
        service_names: services.map((s) => s.name),
        date: job.created_at as string,
        intake: null,
        completion: null,
        manual_tags: [],
      });
    }

    const entry = pairMap.get(key)!;
    if (photo.phase === 'intake' && !entry.intake) entry.intake = photo;
    else if (photo.phase === 'completion' && !entry.completion) entry.completion = photo;

    const photoTags = (photo.tags as string[]) || [];
    for (const t of photoTags) {
      if (!entry.manual_tags.includes(t)) entry.manual_tags.push(t);
    }
  }

  const allPairs = [...pairMap.values()]
    .filter((p) => p.intake && p.completion)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Build filter options from all valid pairs
  const filterOptionSet = new Set<string>();
  for (const pair of allPairs) {
    const group = getZoneGroup(pair.zone);
    filterOptionSet.add(group === 'interior' ? 'Interior' : 'Exterior');
    for (const name of pair.service_names) {
      if (name) filterOptionSet.add(name);
    }
    for (const t of pair.manual_tags) {
      if (t) filterOptionSet.add(t);
    }
  }
  const filterOptions = [...filterOptionSet].sort();

  // Apply tag filter
  let filtered = allPairs;
  if (tag) {
    const tagLower = tag.toLowerCase();
    filtered = allPairs.filter((p) => {
      const group = getZoneGroup(p.zone);
      if (tagLower === 'interior' && group === 'interior') return true;
      if (tagLower === 'exterior' && group === 'exterior') return true;
      if (p.service_names.some((s) => s.toLowerCase() === tagLower)) return true;
      if (p.manual_tags.some((t) => t.toLowerCase() === tagLower)) return true;
      return false;
    });
  }

  const total = filtered.length;

  // Page 1: first 12 items
  const page1 = filtered.slice(0, 12);

  const pairs: GalleryPair[] = page1.map((pair) => ({
    job_id: pair.job_id,
    zone: pair.zone,
    vehicle: pair.vehicle,
    service_names: pair.service_names,
    before_image: pair.intake!.image_url,
    after_image: pair.completion!.image_url,
    tags: pair.manual_tags,
  }));

  return { pairs, filterOptions, total };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const [biz, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/gallery'),
  ]);

  const tagLabel = params.tag ? ` — ${params.tag}` : '';
  const auto: Metadata = {
    title: `${biz.name} — Before & After Gallery${tagLabel} | Auto Detailing Results`,
    description: `See the incredible transformations at ${biz.name}. Browse our before and after photos of ceramic coating, paint correction, and full detail services.`,
    openGraph: {
      title: `${biz.name} — Before & After Gallery${tagLabel}`,
      description: `See the incredible transformations at ${biz.name}. Browse our before and after photos.`,
      type: 'website',
    },
    alternates: {
      canonical: '/gallery',
    },
  };
  return mergeMetadata(auto, seoOverrides);
}

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string }>;
}) {
  const params = await searchParams;
  const [enabled, biz, galleryData, cmsToggles] = await Promise.all([
    isFeatureEnabled(FEATURE_FLAGS.PHOTO_GALLERY),
    getBusinessInfo(),
    getGalleryData(params.tag),
    getCmsToggles(),
  ]);

  if (!enabled) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-site-text">Gallery Coming Soon</h1>
        <p className="mt-4 text-lg text-site-text-muted">
          We&apos;re building a showcase of our best work at {biz.name}.
          Check back soon to see incredible before and after transformations!
        </p>
      </div>
    );
  }

  const { pairs, filterOptions, total } = galleryData;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: `${biz.name} — Before & After Gallery`,
    description: `Professional auto detailing before and after photos from ${biz.name}.`,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/gallery`,
    numberOfItems: total,
    provider: {
      '@type': 'LocalBusiness',
      name: biz.name,
      telephone: biz.phone,
      address: biz.address,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero */}
      <section className="bg-brand-black py-16 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <AnimatedSection>
            <h1 className="font-display text-4xl font-bold tracking-tight text-site-text sm:text-5xl">
              Our <span className="text-gradient-accent">Work</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-site-text-muted">
              See the difference professional detailing makes. Browse our before and after gallery
              featuring ceramic coatings, paint corrections, and premium detail services.
            </p>
            {total > 0 && (
              <p className="mt-2 text-sm text-site-text-dim">{total} featured transformations</p>
            )}
          </AnimatedSection>
        </div>
      </section>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="below_hero" pagePath="/gallery" /></Suspense>}

      <div className="bg-brand-dark">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
          <GalleryClient
            initialPairs={pairs}
            filterOptions={filterOptions}
            initialTag={params.tag || ''}
            total={total}
          />
        </div>
      </div>

      {cmsToggles.adPlacements && <Suspense fallback={null}><AdZone zoneId="between_rows" pagePath="/gallery" /></Suspense>}
    </>
  );
}
