import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getZoneLabel } from '@/lib/utils/job-zones';

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user via cookie session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up customer record for this user
    const admin = createAdminClient();
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Parse query params
    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '5', 10)));
    const vehicleId = url.searchParams.get('vehicle_id') || null;

    // Build jobs query
    let jobsQuery = admin
      .from('jobs')
      .select('id, status, services, vehicle_id, created_at, gallery_token, vehicles(id, year, make, model, color)', { count: 'exact' })
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'closed', 'pending_approval'])
      .order('created_at', { ascending: false });

    if (vehicleId) {
      jobsQuery = jobsQuery.eq('vehicle_id', vehicleId);
    }

    // First, get total count of jobs with photos (for pagination)
    const { data: allJobs, error: allJobsError } = await jobsQuery;
    if (allJobsError) throw allJobsError;
    if (!allJobs || allJobs.length === 0) {
      return NextResponse.json({ visits: [], total_visits: 0, page, limit, vehicles: [] });
    }

    // Get ALL non-internal, non-progress photos for these jobs
    const allJobIds = allJobs.map((j) => j.id);
    const { data: allPhotos, error: photosError } = await admin
      .from('job_photos')
      .select('id, job_id, zone, phase, image_url, thumbnail_url, notes, annotation_data, is_featured, created_at')
      .in('job_id', allJobIds)
      .eq('is_internal', false)
      .neq('phase', 'progress')
      .order('zone')
      .order('sort_order', { ascending: true });

    if (photosError) throw photosError;

    // Filter to only jobs that actually have photos
    const jobIdsWithPhotos = new Set((allPhotos || []).map((p) => p.job_id));
    const jobsWithPhotos = allJobs.filter((j) => jobIdsWithPhotos.has(j.id));
    const totalVisits = jobsWithPhotos.length;

    // Paginate
    const start = (page - 1) * limit;
    const paginatedJobs = jobsWithPhotos.slice(start, start + limit);

    // Build visits response with photos grouped by phase
    const visits = paginatedJobs.map((job) => {
      const jobPhotos = (allPhotos || []).filter((p) => p.job_id === job.id);

      // Group by phase
      const intake = jobPhotos
        .filter((p) => p.phase === 'intake')
        .map((p) => ({
          id: p.id,
          zone: p.zone,
          zone_label: getZoneLabel(p.zone),
          image_url: p.image_url,
          thumbnail_url: p.thumbnail_url,
          notes: p.notes,
          annotation_data: p.annotation_data,
        }));

      const completion = jobPhotos
        .filter((p) => p.phase === 'completion')
        .map((p) => ({
          id: p.id,
          zone: p.zone,
          zone_label: getZoneLabel(p.zone),
          image_url: p.image_url,
          thumbnail_url: p.thumbnail_url,
          notes: p.notes,
          annotation_data: p.annotation_data,
        }));

      const vehicle = job.vehicles as unknown as {
        id: string; year: number; make: string; model: string; color: string | null;
      } | null;

      return {
        job_id: job.id,
        date: job.created_at,
        status: job.status,
        gallery_token: job.gallery_token,
        vehicle: vehicle ? {
          id: vehicle.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
        } : null,
        services: (job.services as Array<{ name: string; price: number }>) || [],
        photos: { intake, completion },
        photo_count: { intake: intake.length, completion: completion.length },
      };
    });

    // Get unique vehicles for filter dropdown
    const vehicleMap = new Map<string, { id: string; year: number; make: string; model: string; color: string | null }>();
    for (const job of jobsWithPhotos) {
      const v = job.vehicles as unknown as { id: string; year: number; make: string; model: string; color: string | null } | null;
      if (v && !vehicleMap.has(v.id)) {
        vehicleMap.set(v.id, v);
      }
    }

    return NextResponse.json({
      visits,
      total_visits: totalVisits,
      page,
      limit,
      vehicles: Array.from(vehicleMap.values()),
    });
  } catch (err) {
    console.error('[account/photos] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
