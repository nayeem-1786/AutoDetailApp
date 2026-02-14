import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { getPageSeo, mergeMetadata } from '@/lib/seo/page-seo';
import { GalleryClient } from './gallery-client';

export async function generateMetadata(): Promise<Metadata> {
  const [biz, seoOverrides] = await Promise.all([
    getBusinessInfo(),
    getPageSeo('/gallery'),
  ]);
  const auto: Metadata = {
    title: `${biz.name} — Before & After Gallery | Auto Detailing Results`,
    description: `See the incredible transformations at ${biz.name}. Browse our before and after photos of ceramic coating, paint correction, and full detail services.`,
    openGraph: {
      title: `${biz.name} — Before & After Gallery`,
      description: `See the incredible transformations at ${biz.name}. Browse our before and after photos.`,
      type: 'website',
    },
  };
  return mergeMetadata(auto, seoOverrides);
}

interface GalleryPair {
  job_id: string;
  vehicle: { make: string; model: string; year: number | null } | null;
  service_names: string[];
  before_image: string;
  after_image: string;
  zone: string;
}

async function getGalleryData(): Promise<{
  pairs: GalleryPair[];
  serviceOptions: string[];
}> {
  const supabase = createAdminClient();

  const { data: photos, error } = await supabase
    .from('job_photos')
    .select(
      `id, job_id, zone, phase, image_url, thumbnail_url, created_at,
       jobs!inner(
         id, services, created_at,
         vehicles(make, model, year)
       )`
    )
    .eq('is_featured', true)
    .eq('is_internal', false)
    .order('created_at', { ascending: false });

  if (error || !photos) return { pairs: [], serviceOptions: [] };

  const jobMap = new Map<string, {
    job_id: string;
    vehicle: { make: string; model: string; year: number | null } | null;
    services: { id: string; name: string; price: number }[];
    date: string;
    intakePhotos: typeof photos;
    completionPhotos: typeof photos;
  }>();

  for (const photo of photos) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const job = photo.jobs as any;
    const jobId = job.id as string;

    if (!jobMap.has(jobId)) {
      jobMap.set(jobId, {
        job_id: jobId,
        vehicle: (Array.isArray(job.vehicles) ? job.vehicles[0] : job.vehicles) as { make: string; model: string; year: number | null } | null,
        services: (job.services ?? []) as { id: string; name: string; price: number }[],
        date: job.created_at as string,
        intakePhotos: [],
        completionPhotos: [],
      });
    }

    const entry = jobMap.get(jobId)!;
    if (photo.phase === 'intake') entry.intakePhotos.push(photo);
    else if (photo.phase === 'completion') entry.completionPhotos.push(photo);
  }

  const validPairs = [...jobMap.values()]
    .filter((j) => j.intakePhotos.length > 0 && j.completionPhotos.length > 0)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const pairs: GalleryPair[] = validPairs.map((pair) => ({
    job_id: pair.job_id,
    vehicle: pair.vehicle,
    service_names: pair.services.map((s) => s.name),
    before_image: pair.intakePhotos[0].image_url,
    after_image: pair.completionPhotos[0].image_url,
    zone: pair.intakePhotos[0].zone,
  }));

  const serviceOptions = [...new Set(
    validPairs.flatMap((j) => j.services.map((s) => s.name))
  )].sort();

  return { pairs, serviceOptions };
}

export default async function GalleryPage() {
  const enabled = await isFeatureEnabled(FEATURE_FLAGS.PHOTO_GALLERY);
  const biz = await getBusinessInfo();

  if (!enabled) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold text-gray-900">Gallery Coming Soon</h1>
        <p className="mt-4 text-lg text-gray-600">
          We&apos;re building a showcase of our best work at {biz.name}.
          Check back soon to see incredible before and after transformations!
        </p>
      </div>
    );
  }

  const { pairs, serviceOptions } = await getGalleryData();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: `${biz.name} — Before & After Gallery`,
    description: `Professional auto detailing before and after photos from ${biz.name}.`,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/gallery`,
    numberOfItems: pairs.length,
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
      <section className="bg-gradient-hero">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 text-center">
          <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Our Work
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-blue-100/60">
            See the difference professional detailing makes. Browse our before and after gallery
            featuring ceramic coatings, paint corrections, and premium detail services.
          </p>
          {pairs.length > 0 && (
            <p className="mt-2 text-sm text-blue-100/40">{pairs.length} featured transformations</p>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <GalleryClient initialPairs={pairs} serviceOptions={serviceOptions} />
      </div>
    </>
  );
}
