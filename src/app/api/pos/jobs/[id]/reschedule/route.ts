import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { logAudit, getRequestIp } from '@/lib/services/audit';

const DRAGGABLE_STATUSES = ['scheduled', 'intake', 'in_progress'];

/**
 * PATCH /api/pos/jobs/[id]/reschedule — Reschedule a job's time and/or detailer
 * Used by the timeline drag-and-drop.
 *
 * Body: {
 *   scheduled_start_time?: string (HH:MM or HH:MM:SS),
 *   assigned_staff_id?: string | null,
 *   unschedule?: boolean (remove time, move to unscheduled)
 * }
 *
 * - Updates appointments.scheduled_start_time if job has an appointment
 * - Updates jobs.assigned_staff_id
 * - Walk-in jobs with no appointment: stores time in estimated_pickup_at as a proxy
 *   (no scheduled_start_time column on jobs table; the appointment is the source of truth)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const {
      scheduled_start_time,
      assigned_staff_id,
      unschedule,
    } = body as {
      scheduled_start_time?: string;
      assigned_staff_id?: string | null;
      unschedule?: boolean;
    };

    const supabase = createAdminClient();

    // Fetch current job
    const { data: job, error: fetchErr } = await supabase
      .from('jobs')
      .select('id, status, appointment_id, assigned_staff_id')
      .eq('id', id)
      .single();

    if (fetchErr || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    if (!DRAGGABLE_STATUSES.includes(job.status)) {
      return NextResponse.json(
        { error: `Cannot reschedule a job with status "${job.status}"` },
        { status: 400 }
      );
    }

    const changes: string[] = [];

    // Update assigned_staff_id on the job
    if (assigned_staff_id !== undefined) {
      await supabase
        .from('jobs')
        .update({
          assigned_staff_id: assigned_staff_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // Also sync to appointment if it exists
      if (job.appointment_id && assigned_staff_id !== undefined) {
        await supabase
          .from('appointments')
          .update({ employee_id: assigned_staff_id })
          .eq('id', job.appointment_id);
      }

      changes.push(`detailer: ${job.assigned_staff_id || 'none'} → ${assigned_staff_id || 'none'}`);
    }

    // Update scheduled time
    if (scheduled_start_time && job.appointment_id) {
      // Appointment-based job: update the appointment's scheduled_start_time
      const { data: currentApt } = await supabase
        .from('appointments')
        .select('scheduled_start_time, scheduled_end_time')
        .eq('id', job.appointment_id)
        .single();

      if (currentApt) {
        // Calculate new end time by preserving the original duration
        const oldStart = timeToMinutes(currentApt.scheduled_start_time);
        const oldEnd = timeToMinutes(currentApt.scheduled_end_time);
        const duration = oldEnd - oldStart;
        const newStart = timeToMinutes(scheduled_start_time);
        const newEnd = newStart + duration;
        const newEndStr = minutesToTime(newEnd);

        await supabase
          .from('appointments')
          .update({
            scheduled_start_time: normalizeTime(scheduled_start_time),
            scheduled_end_time: newEndStr,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.appointment_id);

        changes.push(`time: ${currentApt.scheduled_start_time} → ${scheduled_start_time}`);
      }
    } else if (scheduled_start_time && !job.appointment_id) {
      // Walk-in job: no appointment record — store time in estimated_pickup_at
      // The timeline reads this as a fallback when appointment.scheduled_start_time is null
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date());
      const isoTime = `${today}T${normalizeTime(scheduled_start_time)}`;
      // Convert PST to UTC for TIMESTAMPTZ storage
      const pstDate = new Date(isoTime + '-07:00');

      await supabase
        .from('jobs')
        .update({
          estimated_pickup_at: pstDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      changes.push(`time set to ${scheduled_start_time} (walk-in)`);
    }

    // Unschedule: clear time (move back to unscheduled section)
    if (unschedule && job.appointment_id) {
      // Don't actually delete the appointment — just note that this is a no-op
      // for timeline display since removing an appointment time would break the booking.
      // Instead, this action is prevented in the UI for appointment-based jobs.
      changes.push('unschedule requested (appointment-based — no-op)');
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'job',
      entityId: id,
      entityLabel: `Rescheduled job`,
      details: { changes },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    // Return updated job with relations
    const { data: updatedJob } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers!jobs_customer_id_fkey(id, first_name, last_name, phone),
        vehicle:vehicles!jobs_vehicle_id_fkey(id, year, make, model, color),
        assigned_staff:employees!jobs_assigned_staff_id_fkey(id, first_name, last_name),
        appointment:appointments!jobs_appointment_id_fkey(scheduled_start_time)
      `)
      .eq('id', id)
      .single();

    return NextResponse.json({ data: updatedJob });
  } catch (err) {
    console.error('Job reschedule error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || '0', 10);
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

function normalizeTime(time: string): string {
  const parts = time.split(':');
  const h = String(parseInt(parts[0], 10)).padStart(2, '0');
  const m = String(parseInt(parts[1] || '0', 10)).padStart(2, '0');
  return `${h}:${m}:00`;
}
