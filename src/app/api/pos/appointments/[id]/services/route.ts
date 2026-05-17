import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getRequestIp } from '@/lib/services/audit';
import {
  editAppointmentServices,
  ServiceEditError,
} from '@/lib/appointments/service-edit';

/**
 * PUT /api/pos/appointments/[id]/services — Item 15f Phase 1 Layer 8a
 *
 * POS-authed sibling of the admin cascade endpoint
 * (`/api/admin/appointments/[id]/services`). Same cascade behavior — same
 * Zod schema, same totals recompute, same modifier-preservation contract
 * (Item 15g Layer 15g-iii), same rollback strategy, same audit log shape
 * (tagged `source: 'pos'`), same notification-suppression contract. Both
 * routes call `editAppointmentServices` from
 * `src/lib/appointments/service-edit.ts`.
 *
 * Permission: `pos.jobs.manage` — per audit
 * (`docs/dev/QUOTE_TO_POS_EDIT_AUDIT_2026-05-16.md` §6) this key already
 * gates job-level edits in the POS surface (admin / detailer / super_admin
 * granted; cashier denied). Phase 1's edit-via-POS pivot routes Jobs-card
 * "Edit Services" through this endpoint when Layer 8d wires up the
 * affordance.
 *
 * Server-side only this layer. No UI surface mounts this endpoint yet;
 * frontend wiring lands in Phase 1 Layer 8b (`<TicketContext>` deep-link
 * drain) + Layer 8d (Jobs-card affordance).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const canManage = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'pos.jobs.manage'
    );
    if (!canManage) {
      return NextResponse.json(
        { error: "You don't have permission to edit job services" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));

    const fullName = [posEmployee.first_name, posEmployee.last_name]
      .filter(Boolean)
      .join(' ');

    const result = await editAppointmentServices(supabase, {
      appointmentId: id,
      body,
      actor: {
        employeeId: posEmployee.employee_id,
        authUserId: posEmployee.auth_user_id,
        email: posEmployee.email,
        name: fullName.length > 0 ? fullName : null,
      },
      source: 'pos',
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
    console.error('POS appointment services PUT error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
