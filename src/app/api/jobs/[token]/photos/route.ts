import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/jobs/[token]/photos
 * Public endpoint — returns job photos for customer gallery.
 * Excludes is_internal photos. No auth required.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createAdminClient();

    // Look up job by gallery_token
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id, status, services, timer_seconds, created_at,
        work_completed_at,
        customer:customers!jobs_customer_id_fkey(first_name),
        vehicle:vehicles!jobs_vehicle_id_fkey(year, make, model, color)
      `)
      .eq('gallery_token', token)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (job.status === 'cancelled') {
      return NextResponse.json({ error: 'This job has been cancelled' }, { status: 410 });
    }

    // Get non-internal photos
    const { data: photos } = await supabase
      .from('job_photos')
      .select('id, zone, phase, image_url, thumbnail_url, notes, is_featured, sort_order')
      .eq('job_id', job.id)
      .eq('is_internal', false)
      .order('zone')
      .order('phase')
      .order('sort_order', { ascending: true });

    return NextResponse.json({
      data: {
        job: {
          services: job.services,
          timer_seconds: job.timer_seconds,
          completed_at: job.work_completed_at,
          created_at: job.created_at,
          status: job.status,
        },
        customer_first_name: (job.customer as unknown as { first_name: string } | null)?.first_name || null,
        vehicle: job.vehicle,
        photos: photos || [],
      },
    });
  } catch (err) {
    console.error('Public gallery API error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
