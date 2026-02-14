import { cache } from 'react';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createAnonClient } from '@/lib/supabase/anon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BeforeAfterPair {
  beforeUrl: string;
  afterUrl: string;
  vehicleInfo: string | null;
  serviceName: string | null;
  zone: string;
  jobId: string;
}

interface FeaturedPhotoOptions {
  limit?: number;
  zone?: string;
}

// ---------------------------------------------------------------------------
// Helper: get Supabase client that works in both request and build contexts
// ---------------------------------------------------------------------------

async function getClient() {
  try {
    return await createServerClient();
  } catch {
    return createAnonClient();
  }
}

// ---------------------------------------------------------------------------
// getFeaturedBeforeAfter
// Queries job_photos for featured before/after pairs.
// A pair needs both intake AND completion phase for the same (job_id, zone).
// ---------------------------------------------------------------------------

async function fetchFeaturedBeforeAfter(
  options?: FeaturedPhotoOptions
): Promise<BeforeAfterPair[]> {
  const supabase = await getClient();
  const limit = options?.limit ?? 6;

  // Query featured, non-internal photos that have intake or completion phase
  let query = supabase
    .from('job_photos')
    .select(
      `id, job_id, zone, phase, image_url,
       jobs!inner(
         id, services,
         vehicles(make, model, year)
       )`
    )
    .eq('is_featured', true)
    .eq('is_internal', false)
    .in('phase', ['intake', 'completion'])
    .order('created_at', { ascending: false });

  if (options?.zone) {
    query = query.eq('zone', options.zone);
  }

  const { data: photos, error } = await query.limit(200);

  if (error || !photos || photos.length === 0) {
    return [];
  }

  // Group by (job_id, zone) and find pairs with both intake + completion
  const groups = new Map<
    string,
    { intake: string | null; completion: string | null; photo: (typeof photos)[0] }
  >();

  for (const photo of photos) {
    const key = `${photo.job_id}:${photo.zone}`;
    if (!groups.has(key)) {
      groups.set(key, { intake: null, completion: null, photo });
    }
    const group = groups.get(key)!;
    if (photo.phase === 'intake' && !group.intake) {
      group.intake = photo.image_url;
    } else if (photo.phase === 'completion' && !group.completion) {
      group.completion = photo.image_url;
    }
  }

  // Build pairs from groups that have both before and after
  const pairs: BeforeAfterPair[] = [];

  // Prioritize exterior zones
  const exteriorZones = [
    'front',
    'rear',
    'driver_side',
    'passenger_side',
    'hood',
    'roof',
    'trunk',
    'wheels',
  ];

  const sortedEntries = [...groups.entries()].sort(([keyA], [keyB]) => {
    const zoneA = keyA.split(':')[1];
    const zoneB = keyB.split(':')[1];
    const aIsExterior = exteriorZones.includes(zoneA);
    const bIsExterior = exteriorZones.includes(zoneB);
    if (aIsExterior && !bIsExterior) return -1;
    if (!aIsExterior && bIsExterior) return 1;
    return 0;
  });

  for (const [key, group] of sortedEntries) {
    if (group.intake && group.completion) {
      const job = group.photo.jobs as unknown as {
        id: string;
        services: { name: string }[] | null;
        vehicles: { make: string; model: string; year: number } | null;
      };

      const vehicle = job.vehicles;
      const vehicleInfo = vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : null;

      const serviceName =
        Array.isArray(job.services) && job.services.length > 0
          ? job.services[0].name
          : null;

      pairs.push({
        beforeUrl: group.intake,
        afterUrl: group.completion,
        vehicleInfo,
        serviceName,
        zone: key.split(':')[1],
        jobId: job.id,
      });

      if (pairs.length >= limit) break;
    }
  }

  return pairs;
}

// ---------------------------------------------------------------------------
// getHeroBeforeAfter
// Returns the single best before/after pair for the hero section.
// Prioritizes exterior zones, most recent jobs.
// ---------------------------------------------------------------------------

async function fetchHeroBeforeAfter(): Promise<BeforeAfterPair | null> {
  const pairs = await fetchFeaturedBeforeAfter({ limit: 1 });
  return pairs[0] ?? null;
}

export const getFeaturedBeforeAfter = cache(fetchFeaturedBeforeAfter);
export const getHeroBeforeAfter = cache(fetchHeroBeforeAfter);
