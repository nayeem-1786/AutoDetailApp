import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * POST /api/pos/jobs/[id]/start-work
 * Transitions job from intake (with completed intake) to in_progress
 * and starts the timer by setting work_started_at.
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

    // Verify job exists and is in correct state
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, status, intake_completed_at')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'intake') {
      return NextResponse.json(
        { error: `Cannot start work on job with status "${job.status}"` },
        { status: 400 }
      );
    }

    if (!job.intake_completed_at) {
      return NextResponse.json(
        { error: 'Intake must be completed before starting work' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('jobs')
      .update({
        status: 'in_progress',
        work_started_at: now,
        updated_at: now,
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
      console.error('Start work error:', updateError);
      return NextResponse.json({ error: 'Failed to start work' }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Start work route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
