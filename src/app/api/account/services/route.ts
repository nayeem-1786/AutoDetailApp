import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    // Auth: cookie-based customer session
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));
    const vehicleId = url.searchParams.get('vehicle_id') || null;

    // Build jobs query — only completed/closed
    let jobsQuery = admin
      .from('jobs')
      .select(
        'id, status, services, vehicle_id, created_at, gallery_token, vehicles(id, year, make, model, color)',
        { count: 'exact' }
      )
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'closed'])
      .order('created_at', { ascending: false });

    if (vehicleId) {
      jobsQuery = jobsQuery.eq('vehicle_id', vehicleId);
    }

    const { data: allJobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw jobsError;
    if (!allJobs || allJobs.length === 0) {
      return NextResponse.json({ visits: [], total: 0, page, limit, vehicles: [] });
    }

    const totalJobs = allJobs.length;

    // Paginate
    const start = (page - 1) * limit;
    const paginatedJobs = allJobs.slice(start, start + limit);
    const paginatedJobIds = paginatedJobs.map((j) => j.id);

    // Get addon counts and photo counts for paginated jobs in parallel
    const [addonsResult, photosResult] = await Promise.all([
      admin
        .from('job_addons')
        .select('job_id')
        .in('job_id', paginatedJobIds)
        .eq('status', 'approved'),
      admin
        .from('job_photos')
        .select('job_id')
        .in('job_id', paginatedJobIds)
        .eq('is_internal', false)
        .neq('phase', 'progress'),
    ]);

    // Count addons per job
    const addonCounts = new Map<string, number>();
    for (const a of addonsResult.data || []) {
      addonCounts.set(a.job_id, (addonCounts.get(a.job_id) || 0) + 1);
    }

    // Count photos per job
    const photoCounts = new Map<string, number>();
    for (const p of photosResult.data || []) {
      photoCounts.set(p.job_id, (photoCounts.get(p.job_id) || 0) + 1);
    }

    // Build visits response
    const visits = paginatedJobs.map((job) => {
      const vehicle = job.vehicles as unknown as {
        id: string; year: number; make: string; model: string; color: string | null;
      } | null;

      return {
        job_id: job.id,
        date: job.created_at,
        status: job.status,
        vehicle: vehicle ? {
          id: vehicle.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          color: vehicle.color,
        } : null,
        services: (job.services as Array<{ name: string; price: number }>) || [],
        addon_count: addonCounts.get(job.id) || 0,
        photo_count: photoCounts.get(job.id) || 0,
        gallery_token: job.gallery_token,
      };
    });

    // Get unique vehicles for filter dropdown
    const vehicleMap = new Map<string, { id: string; label: string }>();
    for (const job of allJobs) {
      const v = job.vehicles as unknown as {
        id: string; year: number; make: string; model: string; color: string | null;
      } | null;
      if (v && !vehicleMap.has(v.id)) {
        vehicleMap.set(v.id, {
          id: v.id,
          label: `${v.year} ${v.make} ${v.model}${v.color ? ` — ${v.color}` : ''}`,
        });
      }
    }

    return NextResponse.json({
      visits,
      total: totalJobs,
      page,
      limit,
      vehicles: Array.from(vehicleMap.values()),
    });
  } catch (err) {
    console.error('[account/services] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
