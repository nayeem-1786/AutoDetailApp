import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'admin.photos.view');
    if (denied) return denied;

    const { id: customerId } = await params;
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicle_id');

    const supabase = createAdminClient();

    // Get all jobs for this customer
    let jobsQuery = supabase
      .from('jobs')
      .select('id, status, services, vehicle_id, created_at, vehicles(id, year, make, model, color)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (vehicleId) {
      jobsQuery = jobsQuery.eq('vehicle_id', vehicleId);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;
    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const jobIds = jobs.map((j) => j.id);

    // Get all non-internal photos for those jobs
    const { data: photos, error: photosError } = await supabase
      .from('job_photos')
      .select('id, job_id, zone, phase, image_url, thumbnail_url, notes, annotation_data, is_featured, is_internal, created_at')
      .in('job_id', jobIds)
      .eq('is_internal', false)
      .order('created_at', { ascending: false });

    if (photosError) throw photosError;

    // Group photos by job with job metadata
    const grouped = jobs
      .filter((job) => (photos || []).some((p) => p.job_id === job.id))
      .map((job) => ({
        job_id: job.id,
        status: job.status,
        services: job.services,
        vehicle: job.vehicles,
        date: job.created_at,
        photos: (photos || []).filter((p) => p.job_id === job.id),
      }));

    return NextResponse.json({ data: grouped });
  } catch (err) {
    console.error('[admin/customers/[id]/photos] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
