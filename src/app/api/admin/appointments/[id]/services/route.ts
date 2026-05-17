import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { getRequestIp } from '@/lib/services/audit';
import {
  editAppointmentServices,
  ServiceEditError,
} from '@/lib/appointments/service-edit';

/**
 * PUT /api/admin/appointments/[id]/services — Item 15a (Wave 1.5)
 *
 * Replace the full `appointment_services` row set for an appointment with
 * the supplied list, recompute totals, and (if a `jobs` row is linked via
 * `jobs.appointment_id`) sync the `jobs.services` JSONB snapshot so the
 * detailer sees the up-to-date list at intake. Closes lifecycle-audit
 * gaps §10 #1 and #11.
 *
 * Permission: `appointments.reschedule` — same role distribution that
 * gates date/time/detailer changes (granted to admin/cashier/super_admin;
 * detailer denied). Service edits are conceptually a "scope mutation"
 * adjacent to reschedule; reusing the key keeps role-defaults aligned
 * without a migration.
 *
 * Notification suppression: this endpoint never sends SMS/email and
 * never fires the `appointment_rescheduled` webhook (consistent with the
 * Item 12 POS reschedule path; operator manages customer comms manually).
 *
 * Item 15f Phase 1 Layer 8a: cascade body extracted to
 * `src/lib/appointments/service-edit.ts:editAppointmentServices`. This
 * route is now a thin auth + actor-build + helper-call + error-mapping
 * wrapper. The POS-authed sibling
 * `/api/pos/appointments/[id]/services` calls the same helper with
 * `source: 'pos'` and `pos.jobs.manage` permission gating.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(
      employee.id,
      'appointments.reschedule'
    );
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const supabase = createAdminClient();

    const result = await editAppointmentServices(supabase, {
      appointmentId: id,
      body,
      actor: {
        employeeId: employee.id,
        authUserId: employee.auth_user_id,
        email: employee.email,
        name:
          [employee.first_name, employee.last_name]
            .filter(Boolean)
            .join(' ') || null,
      },
      source: 'admin',
      ipAddress: getRequestIp(request),
    });

    return NextResponse.json({
      data: result.data,
      cascaded_to_job_id: result.cascadedToJobId,
    });
  } catch (err) {
    if (err instanceof ServiceEditError) {
      return NextResponse.json(
        err.details !== undefined
          ? { error: err.message, details: err.details }
          : { error: err.message },
        { status: err.httpStatus }
      );
    }
    console.error('Appointment services PUT error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
