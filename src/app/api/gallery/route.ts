import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isFeatureEnabled } from '@/lib/utils/feature-flags';
import { FEATURE_FLAGS } from '@/lib/utils/constants';

export async function GET(request: NextRequest) {
  try {
    // Check feature flag
    const enabled = await isFeatureEnabled(FEATURE_FLAGS.PHOTO_GALLERY);
    if (!enabled) {
      return NextResponse.json({ error: 'Gallery not available' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const serviceFilter = searchParams.get('service');
    const limit = parseInt(searchParams.get('limit') || '12', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const supabase = createAdminClient();

    // Get featured, non-internal photos grouped by job
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

    if (error) throw error;

    // Group by job to form before/after pairs
    const jobMap = new Map<
      string,
      {
        job_id: string;
        vehicle: { make: string; model: string; year: number | null } | null;
        services: { id: string; name: string; price: number }[];
        date: string;
        intakePhotos: typeof photos;
        completionPhotos: typeof photos;
      }
    >();

    for (const photo of photos || []) {
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
      if (photo.phase === 'intake') {
        entry.intakePhotos.push(photo);
      } else if (photo.phase === 'completion') {
        entry.completionPhotos.push(photo);
      }
    }

    // Only include jobs that have BOTH intake and completion photos
    let pairs = [...jobMap.values()]
      .filter((j) => j.intakePhotos.length > 0 && j.completionPhotos.length > 0)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Service filter
    if (serviceFilter) {
      pairs = pairs.filter((p) =>
        p.services.some((s) => s.name.toLowerCase().includes(serviceFilter.toLowerCase()))
      );
    }

    const total = pairs.length;
    const paginated = pairs.slice(offset, offset + limit);

    // Build response — NO customer info
    const results = paginated.map((pair) => ({
      job_id: pair.job_id,
      vehicle: pair.vehicle
        ? { make: pair.vehicle.make, model: pair.vehicle.model, year: pair.vehicle.year }
        : null,
      service_names: pair.services.map((s) => s.name),
      before_image: pair.intakePhotos[0].image_url,
      after_image: pair.completionPhotos[0].image_url,
      before_thumbnail: pair.intakePhotos[0].thumbnail_url,
      after_thumbnail: pair.completionPhotos[0].thumbnail_url,
      zone: pair.intakePhotos[0].zone,
    }));

    // Get unique service names for filter options
    const allServiceNames = [...new Set(
      [...jobMap.values()].flatMap((j) => j.services.map((s) => s.name))
    )].sort();

    return NextResponse.json({
      data: results,
      total,
      service_options: allServiceNames,
    });
  } catch (err) {
    console.error('[gallery] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
