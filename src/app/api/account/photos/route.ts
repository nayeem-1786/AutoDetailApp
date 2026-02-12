import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
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

    // Get all jobs for this customer
    const { data: jobs, error: jobsError } = await admin
      .from('jobs')
      .select('id, status, services, vehicle_id, created_at, vehicles(id, year, make, model, color)')
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'closed', 'pending_approval'])
      .order('created_at', { ascending: false });

    if (jobsError) throw jobsError;

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const jobIds = jobs.map((j) => j.id);

    // Get ONLY non-internal photos — CRITICAL for customer privacy
    const { data: photos, error: photosError } = await admin
      .from('job_photos')
      .select('id, job_id, zone, phase, image_url, thumbnail_url, notes, annotation_data, is_featured, created_at')
      .in('job_id', jobIds)
      .eq('is_internal', false)
      .order('created_at', { ascending: false });

    if (photosError) throw photosError;

    // Group photos by job
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
    console.error('[account/photos] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
