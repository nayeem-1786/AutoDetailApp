import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { materializeJobFromAppointment } from '@/lib/appointments/lifecycle-sync';
import { getRequestIp } from '@/lib/services/audit';

/**
 * POST /api/pos/jobs/start-intake — operator-initiated job materialization
 * (Session 2.1, AC-3 server primitive).
 *
 * The canonical materialization event: operator pressing "Start Intake" on a
 * confirmed (or in_progress) appointment creates the linked `jobs` row at
 * `status='intake'` with `work_started_at=NOW()` and advances the appointment
 * to `status='in_progress'`. Phase 2's replacement for the implicit
 * `populate`-on-Today-scope-mount behavior (which will be retired in Session
 * 2.5 per AC-3's commitment).
 *
 * Walk-in atomic create at `pos/jobs/route.ts:147-536` is the parallel path
 * and stays inline — it creates the appointment AND the job in one shot
 * (structurally different from this endpoint's "appointment already exists"
 * shape). Both paths converge at the `jobs.appointment_id` UNIQUE constraint.
 *
 * Request: `{ appointment_id: string }`.
 *
 * Response (200 / 201):
 *  - `{ job_id, appointment_id, already_materialized: boolean }`
 *  - 201 on first materialization (a new job row was created)
 *  - 200 on the idempotent re-call path (job already existed; same `job_id`)
 *
 * Errors:
 *  - 401 Unauthorized — invalid POS session
 *  - 403 — missing `appointments.update_status` permission
 *  - 400 — missing/invalid `appointment_id` in body
 *  - 404 not_found — appointment does not exist
 *  - 422 future_date — appointment's scheduled_date > today (PST). Response
 *    body includes `appointment_date` so the client can render the
 *    "Move appointment to today and start now?" popup (Session 2.2 UI).
 *  - 422 invalid_status — appointment.status NOT IN (confirmed, in_progress).
 *    Response body includes `appointment_status` for client-side messaging.
 *
 * Permission: `appointments.update_status` (same key as state-machine
 * transitions in PATCH; Start Intake conceptually advances the appointment
 * lifecycle to in_progress, so the same gate applies).
 *
 * Idempotency: two concurrent operators pressing Start Intake on the same
 * appointment must result in ONE job. The endpoint relies on the
 * `jobs.appointment_id` UNIQUE constraint (migration 20260329000002) +
 * `upsert(ignoreDuplicates: true)` in the helper. See
 * `materializeJobFromAppointment` for the ordering rationale.
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { appointment_id?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const appointmentId = body.appointment_id;
    if (typeof appointmentId !== 'string' || appointmentId.length === 0) {
      return NextResponse.json(
        { error: 'appointment_id is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const canUpdate = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.update_status'
    );
    if (!canUpdate) {
      return NextResponse.json(
        { error: "You don't have permission to start intake on this appointment" },
        { status: 403 }
      );
    }

    const result = await materializeJobFromAppointment(supabase, appointmentId, {
      trigger: 'start_intake',
      actor: {
        userId: posEmployee.auth_user_id,
        userEmail: posEmployee.email,
        employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
        employeeId: posEmployee.employee_id,
      },
      source: 'pos',
      ipAddress: getRequestIp(request),
    });

    if (!result.ok) {
      // Shape the error payload to expose only the contract-relevant fields per
      // error code. The helper carries appointmentDate / appointmentStatus
      // selectively; pass them through so the client can render specific UI.
      const payload: Record<string, unknown> = { error: result.error };
      if (result.error === 'future_date' && result.appointmentDate) {
        payload.appointment_date = result.appointmentDate;
      }
      if (result.error === 'invalid_status' && result.appointmentStatus) {
        payload.appointment_status = result.appointmentStatus;
      }
      return NextResponse.json(payload, { status: result.httpStatus });
    }

    return NextResponse.json(
      {
        job_id: result.jobId,
        appointment_id: result.appointmentId,
        already_materialized: result.alreadyMaterialized === true,
      },
      { status: result.alreadyMaterialized ? 200 : 201 }
    );
  } catch (err) {
    console.error('Start intake route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
