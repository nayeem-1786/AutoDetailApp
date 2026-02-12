import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';

/**
 * PATCH /api/pos/jobs/[id]/timer
 * Pause or resume the job timer.
 *
 * Body: { action: 'pause' | 'resume' }
 *
 * Pause: calculates elapsed seconds since work_started_at, adds to timer_seconds,
 *        sets timer_paused_at, clears work_started_at.
 * Resume: sets work_started_at to now, clears timer_paused_at.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (!action || !['pause', 'resume'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "pause" or "resume".' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch current job state
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, status, work_started_at, timer_seconds, timer_paused_at')
      .eq('id', id)
      .single();

    if (fetchError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (job.status !== 'in_progress') {
      return NextResponse.json(
        { error: `Timer can only be controlled for in_progress jobs (current: "${job.status}")` },
        { status: 400 }
      );
    }

    const now = new Date();
    const nowIso = now.toISOString();

    if (action === 'pause') {
      if (job.timer_paused_at) {
        return NextResponse.json(
          { error: 'Timer is already paused' },
          { status: 400 }
        );
      }

      if (!job.work_started_at) {
        return NextResponse.json(
          { error: 'Timer is not running (no work_started_at)' },
          { status: 400 }
        );
      }

      // Calculate elapsed seconds since work_started_at
      const startedAt = new Date(job.work_started_at);
      const elapsedSeconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
      const newTimerSeconds = (job.timer_seconds || 0) + elapsedSeconds;

      const { data: updated, error: updateError } = await supabase
        .from('jobs')
        .update({
          timer_seconds: newTimerSeconds,
          timer_paused_at: nowIso,
          work_started_at: null,
          updated_at: nowIso,
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
        console.error('Timer pause error:', updateError);
        return NextResponse.json({ error: 'Failed to pause timer' }, { status: 500 });
      }

      return NextResponse.json({ data: updated });
    }

    // action === 'resume'
    if (!job.timer_paused_at) {
      return NextResponse.json(
        { error: 'Timer is not paused' },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('jobs')
      .update({
        work_started_at: nowIso,
        timer_paused_at: null,
        updated_at: nowIso,
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
      console.error('Timer resume error:', updateError);
      return NextResponse.json({ error: 'Failed to resume timer' }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('Timer route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
