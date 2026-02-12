import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * POST /api/pos/jobs/[id]/pickup
 * Records customer pickup with timestamp and optional notes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();
    const body = await request.json().catch(() => ({}));

    // Verify job exists and is completed
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, status')
      .eq('id', id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'completed') {
      return NextResponse.json(
        { error: `Cannot mark pickup for job in "${job.status}" status` },
        { status: 400 }
      );
    }

    // Update job
    const { data: updatedJob, error: updateError } = await supabase
      .from('jobs')
      .update({
        actual_pickup_at: new Date().toISOString(),
        pickup_notes: body.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone, email),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color, size_class),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
        addons:job_addons(*)
      `)
      .single();

    if (updateError) {
      console.error('Job pickup update error:', updateError);
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
    }

    return NextResponse.json({ data: updatedJob });
  } catch (err) {
    console.error('Job pickup route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
