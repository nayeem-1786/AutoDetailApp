import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';
import { getZoneGroup } from '@/lib/utils/job-zones';

/**
 * Admin gallery preview — shows what the public gallery will look like.
 * Bypasses the PHOTO_GALLERY feature flag so admins can preview before enabling.
 */
export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.manage');
    if (denied) return denied;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '48', 10), 100);

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

    if (error) throw error;

    // Group by (job_id, zone) — zone-level pairing
    interface PairEntry {
      job_id: string;
      zone: string;
      vehicle: { make: string; model: string; year: number | null } | null;
      service_names: string[];
      date: string;
      intake: (typeof photos)[0] | null;
      completion: (typeof photos)[0] | null;
      manual_tags: string[];
    }

    const pairMap = new Map<string, PairEntry>();

    for (const photo of photos || []) {
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
      if (photo.phase === 'intake' && !entry.intake) {
        entry.intake = photo;
      } else if (photo.phase === 'completion' && !entry.completion) {
        entry.completion = photo;
      }
      const photoTags = (photo.tags as string[]) || [];
      for (const t of photoTags) {
        if (!entry.manual_tags.includes(t)) entry.manual_tags.push(t);
      }
    }

    // Only keep pairs with BOTH intake + completion
    const allPairs = [...pairMap.values()]
      .filter((p): p is PairEntry & { intake: NonNullable<PairEntry['intake']>; completion: NonNullable<PairEntry['completion']> } =>
        p.intake !== null && p.completion !== null
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);

    // Build filter options
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

    const results = allPairs.map((pair) => ({
      job_id: pair.job_id,
      zone: pair.zone,
      vehicle: pair.vehicle
        ? { make: pair.vehicle.make, model: pair.vehicle.model, year: pair.vehicle.year }
        : null,
      service_names: pair.service_names,
      before_image: pair.intake.image_url,
      after_image: pair.completion.image_url,
      before_thumbnail: pair.intake.thumbnail_url,
      after_thumbnail: pair.completion.thumbnail_url,
      tags: pair.manual_tags,
    }));

    return NextResponse.json({
      data: results,
      total: allPairs.length,
      filter_options: [...filterOptionSet].sort(),
    });
  } catch (err) {
    console.error('[admin/photos/gallery-preview] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
