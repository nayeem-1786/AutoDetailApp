import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { appointmentUpdateSchema } from '@/lib/utils/validation';
import { STATUS_TRANSITIONS } from '@/lib/appointments/status-transitions';
import { executeUnMaterialize } from '@/lib/appointments/lifecycle-sync';
import { addMinutesToTime } from '@/lib/utils/assign-detailer';
import { APPOINTMENT } from '@/lib/utils/constants';
import { logAudit, getRequestIp, buildChangeDetails } from '@/lib/services/audit';
import type { AppointmentStatus } from '@/lib/supabase/types';

/**
 * GET /api/pos/appointments/[id]
 *
 * Single appointment lookup with the same joined shape (`PosAppointment`) the
 * list endpoint at `/api/pos/appointments` returns. Added in Roadmap Item 15c
 * so the Jobs card "Change Time" affordance can fetch the appointment by id
 * without depending on the list endpoint's date-range filter.
 *
 * Permission: `appointments.view_today` (mirrors the list endpoint — minimum
 * gate for read access to appointment data on the POS surface).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const canView = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.view_today'
    );
    if (!canView) {
      return NextResponse.json(
        { error: "You don't have permission to view appointments" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const { data, error } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color, size_class),
        employee:employees!employee_id(id, first_name, last_name, role),
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name)),
        jobs:jobs!appointment_id(id, status)
      `)
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // Item 15e Phase 2C-β-2: derive `has_active_job` (true if a non-terminal job
    // exists) and strip the raw `jobs` relation from the response. Mirrors the
    // canonical terminal set in lifecycle-sync.ts (TERMINAL_JOB_STATUSES).
    //
    // Session #110 corrective: `jobs.appointment_id` has a UNIQUE constraint
    // (migration 20260329000002), so Supabase/PostgREST infers 1:1 cardinality
    // and returns the embedded `jobs` relation as a SINGLE OBJECT `{id, status}`
    // (or null) — NOT an array. Normalize the legitimate shapes (object | null |
    // array) before `.some()`. See CLAUDE.md "Supabase relation cardinality".
    const { jobs, ...appointment } = data as Record<string, unknown> & {
      jobs?: Array<{ status: string }> | { status: string } | null;
    };
    const jobsArray: Array<{ status: string }> = Array.isArray(jobs)
      ? jobs
      : jobs
        ? [jobs]
        : [];
    const hasActiveJob = jobsArray.some(
      (j) => !['completed', 'closed', 'cancelled'].includes(j.status)
    );

    return NextResponse.json({ data: { ...appointment, has_active_job: hasActiveJob } });
  } catch (err) {
    console.error('POS appointment GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/pos/appointments/[id]
 *
 * Combined POS-side appointment edit — the single backing route for the
 * reused admin `AppointmentDetailDialog` when mounted in the POS Jobs
 * Schedule scope (Roadmap Item 15e Phase 2). The dialog's one `onSave` call
 * maps to this one endpoint. It mirrors the admin PATCH at
 * `/api/appointments/[id]` field-for-field, with three deliberate differences:
 *
 *  1. **Auth** — HMAC `authenticatePosRequest` + per-field `checkPosPermission`
 *     (the admin route uses cookie `getEmployeeFromSession` + `requirePermission`,
 *     which a POS HMAC request never satisfies → 401).
 *  2. **Webhooks FIRE** (Item 15e Phase 2 Decision 2) — unlike the narrower POS
 *     `reschedule`/`cancel` endpoints which suppress customer notifications by
 *     construction, this combined PATCH fires `appointment_confirmed` /
 *     `appointment_completed` / `appointment_rescheduled` exactly as the admin
 *     PATCH does. Status changes from the POS Schedule scope are intended to
 *     notify the customer.
 *  3. **STATUS_TRANSITIONS enforced server-side** — the admin route relies on the
 *     dialog's option grouping; the POS route additionally rejects any status
 *     change not allowed by the shared `STATUS_TRANSITIONS` matrix (e.g.
 *     `completed` → `pending` → 400). Same matrix, no POS narrowing (Decision 3).
 *
 * Permission keys (all already seeded for POS roles — no migration, Decision 4/5):
 *  - date/time/employee fields → `appointments.reschedule`
 *  - `status`                  → `appointments.update_status`
 *  - `job_notes`/`internal_notes` → `appointments.add_notes`
 *
 * Returns the full joined `PosAppointment` shape (same select as the POS
 * reschedule endpoint), so the dialog's parent can update its list in place.
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
    const body = await request.json().catch(() => ({}));
    const parsed = appointmentUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Field groups drive per-field permission gating (mirrors admin route's
    // grouping; employee_id is gated under reschedule like the POS reschedule
    // endpoint).
    const isReschedule =
      data.scheduled_date !== undefined ||
      data.scheduled_start_time !== undefined ||
      data.scheduled_end_time !== undefined ||
      data.employee_id !== undefined;
    const isStatusChange = data.status !== undefined;
    const isNotesChange =
      data.job_notes !== undefined || data.internal_notes !== undefined;

    if (!isReschedule && !isStatusChange && !isNotesChange) {
      return NextResponse.json(
        { error: 'No fields to update' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Per-field permission checks (403 on first denied group).
    if (isReschedule) {
      const ok = await checkPosPermission(
        supabase,
        posEmployee.role,
        posEmployee.employee_id,
        'appointments.reschedule'
      );
      if (!ok) {
        return NextResponse.json(
          { error: "You don't have permission to reschedule appointments" },
          { status: 403 }
        );
      }
    }
    if (isStatusChange) {
      const ok = await checkPosPermission(
        supabase,
        posEmployee.role,
        posEmployee.employee_id,
        'appointments.update_status'
      );
      if (!ok) {
        return NextResponse.json(
          { error: "You don't have permission to change appointment status" },
          { status: 403 }
        );
      }
    }
    if (isNotesChange) {
      const ok = await checkPosPermission(
        supabase,
        posEmployee.role,
        posEmployee.employee_id,
        'appointments.add_notes'
      );
      if (!ok) {
        return NextResponse.json(
          { error: "You don't have permission to edit appointment notes" },
          { status: 403 }
        );
      }
    }

    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select(
        'id, status, scheduled_date, scheduled_start_time, scheduled_end_time, employee_id, job_notes, internal_notes'
      )
      .eq('id', id)
      .single();

    if (fetchErr || !current) {
      return NextResponse.json(
        { error: 'Appointment not found' },
        { status: 404 }
      );
    }

    // STATUS_TRANSITIONS enforcement (POS hardening — Decision 3). A no-op
    // (status unchanged) is always allowed; otherwise the target must be in the
    // current status's allowed-next set. Terminal states (completed/cancelled/
    // no_show) have an empty set, so any change away from them is rejected.
    let cascadeRan = false;
    if (data.status && data.status !== current.status) {
      const allowed =
        STATUS_TRANSITIONS[current.status as AppointmentStatus] ?? [];
      if (!allowed.includes(data.status)) {
        return NextResponse.json(
          {
            error: `Cannot change status from "${current.status}" to "${data.status}"`,
          },
          { status: 400 }
        );
      }

      // Session 1.5 — Un-materialize cascade for the 2 backward-revert transitions
      // opened in this session: `confirmed → pending` and `in_progress → pending`.
      // The cascade is invoked ONLY when a job has been materialized for this
      // appointment (lazy populate or walk-in); otherwise the status flip is a
      // plain UPDATE with no cross-table work. Mirrors the canonical seam used
      // by the dedicated `/unmaterialize` endpoints — never reimplemented.
      // Trust `executeUnMaterialize`'s ordering invariant (appointment status →
      // `pending` FIRST, then DELETE job) and its guards (transaction_linked →
      // 409; terminal → 409; confirm_required → 422 with data enumeration).
      // Callers that need to pass `confirmString` for at-or-above-threshold jobs
      // (in_progress / pending_approval) should use the dedicated
      // `/api/pos/appointments/[id]/unmaterialize` endpoint — PATCH only carries
      // status + edit fields, not the un-materialize confirm protocol.
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
              userId: posEmployee.auth_user_id,
              userEmail: posEmployee.email,
              employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
            },
            source: 'pos',
            ipAddress: getRequestIp(request),
          });

          if (!cascadeResult.ok) {
            return NextResponse.json(
              { error: cascadeResult.error, data: cascadeResult.data },
              { status: cascadeResult.httpStatus }
            );
          }
          // Cascade already set appointments.status='pending' (Step 5a). Mark so
          // the subsequent UPDATE payload omits `status` and the change-details
          // builder still records the from-status for the audit row.
          cascadeRan = true;
        }
      }
    }

    // Overlap check if date/time is changing (mirrors admin + POS reschedule:
    // BUFFER_MINUTES added to the end time).
    const newDate = data.scheduled_date || current.scheduled_date;
    const newStart = data.scheduled_start_time || current.scheduled_start_time;
    const newEnd = data.scheduled_end_time || current.scheduled_end_time;

    const dateChanged = newDate !== current.scheduled_date;
    const timeChanged =
      newStart !== current.scheduled_start_time ||
      newEnd !== current.scheduled_end_time;

    if (dateChanged || timeChanged) {
      if (newEnd <= newStart) {
        return NextResponse.json(
          { error: 'End time must be after start time' },
          { status: 400 }
        );
      }

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

    // Build update payload (only provided fields). employee_id '' → null.
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // Session 1.5 — cascade already set status='pending'; skip the status field
    // in this UPDATE so the appointment row isn't re-written for the status axis.
    // Audit's buildChangeDetails(current, update, ['status', ...]) still records
    // the from→to status change because `current.status` was the pre-cascade
    // value and the canonical written value matches the requested data.status.
    if (data.status !== undefined && !cascadeRan) update.status = data.status;
    if (data.scheduled_date !== undefined) update.scheduled_date = data.scheduled_date;
    if (data.scheduled_start_time !== undefined)
      update.scheduled_start_time = data.scheduled_start_time;
    if (data.scheduled_end_time !== undefined)
      update.scheduled_end_time = data.scheduled_end_time;
    if (data.employee_id !== undefined)
      update.employee_id = data.employee_id === '' ? null : data.employee_id;
    if (data.job_notes !== undefined) update.job_notes = data.job_notes;
    if (data.internal_notes !== undefined) update.internal_notes = data.internal_notes;

    const { error: updateErr } = await supabase
      .from('appointments')
      .update(update)
      .eq('id', id);

    if (updateErr) {
      console.error('POS appointment PATCH update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update appointment' },
        { status: 500 }
      );
    }

    // Keep jobs.assigned_staff_id in sync on a detailer change (parity with the
    // POS reschedule endpoint, which does the same).
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

    // Session 1.5 — when cascade ran, the appointment.status was set by
    // executeUnMaterialize (it's now `pending`). `update.status` was
    // intentionally omitted to avoid a double-write, but the audit row should
    // still record the operator's intent + the actual state change, so feed a
    // synthetic payload that surfaces `status: data.status` into
    // buildChangeDetails. The cascade also writes its own job-delete audit row
    // (`action: 'delete'`, `entityType: 'job'`) — the two audits together
    // describe the full effect of this PATCH.
    const auditPayload = cascadeRan ? { ...update, status: data.status } : update;
    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: buildChangeDetails(current, auditPayload, [
        'status',
        'scheduled_date',
        'scheduled_start_time',
        'scheduled_end_time',
        'employee_id',
        'job_notes',
        'internal_notes',
      ]),
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    const { data: updated } = await supabase
      .from('appointments')
      .select(`
        *,
        customer:customers!customer_id(id, first_name, last_name, phone, email),
        vehicle:vehicles!vehicle_id(id, year, make, model, color, size_class),
        employee:employees!employee_id(id, first_name, last_name, role),
        appointment_services(id, service_id, price_at_booking, tier_name, service:services!service_id(id, name))
      `)
      .eq('id', id)
      .single();

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('POS appointment PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
