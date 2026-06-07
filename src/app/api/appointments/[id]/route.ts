import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { appointmentUpdateSchema } from '@/lib/utils/validation';
import { APPOINTMENT } from '@/lib/utils/constants';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp, buildChangeDetails } from '@/lib/services/audit';
import { STATUS_TRANSITIONS } from '@/lib/appointments/status-transitions';
import { executeUnMaterialize } from '@/lib/appointments/lifecycle-sync';
import type { AppointmentStatus } from '@/lib/supabase/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = appointmentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Permission check: reschedule requires appointments.reschedule.
    // Session 1.2.1 — Drift #5 fix (surfaced during Session 1.2 at `412a404b`
    // as Memory #29 finding, deferred per that session's locked 4-drift scope).
    // `employee_id` now gates under `appointments.reschedule` — mirrors POS
    // PATCH at `/api/pos/appointments/[id]/route.ts:160-164` whose in-source
    // comment had already promised this grouping ("mirrors admin route's
    // grouping; employee_id is gated under reschedule") but admin diverged.
    // Pre-fix, an admin user without reschedule permission could reassign a
    // detailer via this endpoint; POS correctly blocked the same operation.
    const isReschedule = data.scheduled_date !== undefined ||
      data.scheduled_start_time !== undefined ||
      data.scheduled_end_time !== undefined ||
      data.employee_id !== undefined;
    if (isReschedule) {
      const denied = await requirePermission(employee.id, 'appointments.reschedule');
      if (denied) return denied;
    }

    // Permission check: status changes require appointments.update_status
    if (data.status !== undefined) {
      const denied = await requirePermission(employee.id, 'appointments.update_status');
      if (denied) return denied;
    }

    // Permission check: notes changes require appointments.add_notes
    const isNotesChange = data.job_notes !== undefined || data.internal_notes !== undefined;
    if (isNotesChange) {
      const denied = await requirePermission(employee.id, 'appointments.add_notes');
      if (denied) return denied;
    }

    const supabase = createAdminClient();

    // Fetch current appointment
    // Session 1.2 — Drift #9 fix (parity audit b346d34b Target C): `employee_id`
    // added to the SELECT so buildChangeDetails can record from→to detailer
    // reassignments in the admin audit_log. POS PATCH at
    // `/api/pos/appointments/[id]/route.ts:225` already selects it.
    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, status, scheduled_date, scheduled_start_time, scheduled_end_time, employee_id, job_notes, internal_notes')
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Session 1.5 — STATUS_TRANSITIONS enforcement on the admin PATCH (was
    // previously absent — admin/POS asymmetry per state machine audit b0efd95f).
    // AC-5 commits both endpoints to the shared map; this closes that gap. The
    // backward-revert cascade below uses the same canonical seam the POS PATCH
    // uses; the only differences between the two endpoints are auth surface
    // (cookie vs HMAC) and the audit's `source` label.
    let cascadeRan = false;
    if (data.status && data.status !== current.status) {
      const allowed =
        STATUS_TRANSITIONS[current.status as AppointmentStatus] ?? [];
      if (!allowed.includes(data.status)) {
        return NextResponse.json(
          { error: `Cannot change status from "${current.status}" to "${data.status}"` },
          { status: 400 }
        );
      }

      // Un-materialize cascade for backward reverts (`confirmed → pending` and
      // `in_progress → pending`). See the matching block in POS PATCH for the
      // full rationale + ordering invariant citation. Callers requiring
      // `confirmString` for at-or-above-threshold jobs should use the dedicated
      // `/api/appointments/[id]/unmaterialize` endpoint.
      const isBackwardRevert =
        data.status === 'pending' &&
        (current.status === 'confirmed' || current.status === 'in_progress');
      if (isBackwardRevert) {
        const { data: linkedJob } = await supabase
          .from('jobs')
          .select('id')
          .eq('appointment_id', id)
          .maybeSingle();

        if (linkedJob) {
          const cascadeResult = await executeUnMaterialize(supabase, id, {
            actor: {
              userId: employee.auth_user_id,
              userEmail: employee.email,
              employeeName:
                [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
            },
            source: 'admin',
            ipAddress: getRequestIp(request),
          });

          if (!cascadeResult.ok) {
            return NextResponse.json(
              { error: cascadeResult.error, data: cascadeResult.data },
              { status: cascadeResult.httpStatus }
            );
          }
          cascadeRan = true;
        }
      }
    }

    // Overlap check if date/time is changing
    const newDate = data.scheduled_date || current.scheduled_date;
    const newStart = data.scheduled_start_time || current.scheduled_start_time;
    const newEnd = data.scheduled_end_time || current.scheduled_end_time;

    const dateChanged = newDate !== current.scheduled_date;
    const timeChanged =
      newStart !== current.scheduled_start_time ||
      newEnd !== current.scheduled_end_time;

    if (dateChanged || timeChanged) {
      // Add buffer to end time for overlap check
      const endWithBuffer = addMinutesToTime(newEnd, APPOINTMENT.BUFFER_MINUTES);

      const { data: overlapping } = await supabase
        .from('appointments')
        .select('id')
        .eq('scheduled_date', newDate)
        .neq('id', id)
        .neq('status', 'cancelled')
        .lt('scheduled_start_time', endWithBuffer)
        .gt('scheduled_end_time', newStart)
        .limit(1);

      if (overlapping && overlapping.length > 0) {
        return NextResponse.json(
          { error: 'This time slot conflicts with another appointment' },
          { status: 409 }
        );
      }
    }

    // Build update payload (only include provided fields)
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Session 1.5 — cascade already set status='pending'; skip the status field
    // in this UPDATE so the appointment row isn't re-written for the status axis.
    if (data.status !== undefined && !cascadeRan) update.status = data.status;
    if (data.scheduled_date !== undefined) update.scheduled_date = data.scheduled_date;
    if (data.scheduled_start_time !== undefined) update.scheduled_start_time = data.scheduled_start_time;
    if (data.scheduled_end_time !== undefined) update.scheduled_end_time = data.scheduled_end_time;
    // Session 1.2 — Drift #11 fix (parity audit b346d34b Target C): empty-string
    // `employee_id` normalized to NULL before write. The page-level `handleSave`
    // at `src/app/admin/appointments/page.tsx` already pre-normalizes for this
    // surface's submit path, but the server is the canonical defense layer —
    // any direct PATCH caller (scripts, tests, future API consumers) that sends
    // `employee_id=''` would otherwise write an empty string to a UUID FK column.
    // Mirrors POS PATCH at `/api/pos/appointments/[id]/route.ts:358`.
    if (data.employee_id !== undefined)
      update.employee_id = data.employee_id === '' ? null : data.employee_id;
    if (data.job_notes !== undefined) update.job_notes = data.job_notes;
    if (data.internal_notes !== undefined) update.internal_notes = data.internal_notes;

    const { data: updated, error: updateErr } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id)
      .select('id, status')
      .single();

    if (updateErr) {
      console.error('Appointment update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update appointment' },
        { status: 500 }
      );
    }

    // Session 1.2 — Drift #10 fix (parity audit b346d34b Target C): keep
    // `jobs.assigned_staff_id` in sync on a detailer reassignment. Without this
    // cascade, an admin-side reassignment leaves the linked job's
    // `assigned_staff_id` stale until the next populate run (or never, if the
    // job was walk-in-created). Mirrors POS PATCH at
    // `/api/pos/appointments/[id]/route.ts:377-383` byte-for-byte. The cascade
    // is unconditional on employee_id presence — graceful no-op when no linked
    // jobs row exists (the `.eq('appointment_id', id)` filter matches 0 rows
    // and Supabase returns `{ error: null, count: 0 }`).
    if (data.employee_id !== undefined) {
      const newEmployeeId = data.employee_id === '' ? null : data.employee_id;
      await supabase
        .from('jobs')
        .update({ assigned_staff_id: newEmployeeId })
        .eq('appointment_id', id);
    }

    // Theme G — outbound webhook fires removed (status-change confirmed/completed
    // + date/time-change rescheduled). Smart Details has no n8n receiver wired
    // (audit f5e714a8); customer-facing dispatch for these transitions is
    // already covered by inline SMS/email + audit_log writes.

    // Session 1.5 — feed a synthetic payload to buildChangeDetails when cascade
    // ran so the audit row records the operator's intent. The cascade itself
    // writes a separate job-delete audit row; the two together describe the
    // full PATCH effect.
    const auditPayload = cascadeRan ? { ...update, status: data.status } : update;
    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'update',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      // Session 1.2 — Drift #9 fix: `employee_id` added to the audit-log diff
      // field list. Detailer reassignments via admin now surface in audit
      // history. Mirrors POS PATCH's field list at
      // `/api/pos/appointments/[id]/route.ts:444-452`.
      details: buildChangeDetails(current, auditPayload, ['status', 'scheduled_date', 'scheduled_start_time', 'scheduled_end_time', 'employee_id', 'job_notes', 'internal_notes']),
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true, appointment: updated });
  } catch (err) {
    console.error('Appointment PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

