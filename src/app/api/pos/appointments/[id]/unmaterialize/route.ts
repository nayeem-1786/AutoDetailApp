import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { getRequestIp } from '@/lib/services/audit';
import { executeUnMaterialize } from '@/lib/appointments/lifecycle-sync';

const bodySchema = z.object({
  confirmString: z.string().optional(),
  dryRun: z.boolean().optional(),
});

/**
 * POST /api/pos/appointments/[id]/unmaterialize
 *
 * POS-side un-materialize (Item 15e Phase 2C): hard-delete the job linked to
 * this appointment and revert the appointment to `pending`. Thin wrapper over
 * the canonical `executeUnMaterialize` seam — all logic (guards, ordering, the
 * re-materialization invariant, Storage cleanup, audit) lives there.
 *
 * Auth: HMAC `authenticatePosRequest` + `checkPosPermission('appointments.cancel')`
 * (Phase 2C Decision 2 — no new permission key). Fires NO webhooks/notifications
 * (Decision 5 — silent revert).
 *
 * Status codes: 401 auth · 403 permission · 404 missing appt/job · 409
 * transaction-linked or terminal · 422 confirm-required (body carries the data
 * enumeration so the UI can render the type-to-confirm modal) · 200 success.
 */
export async function POST(
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
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const allowed = await checkPosPermission(
      supabase,
      posEmployee.role,
      posEmployee.employee_id,
      'appointments.cancel'
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "You don't have permission to revert appointments" },
        { status: 403 }
      );
    }

    const result = await executeUnMaterialize(supabase, id, {
      confirmString: parsed.data.confirmString,
      dryRun: parsed.data.dryRun,
      actor: {
        userId: posEmployee.auth_user_id,
        userEmail: posEmployee.email,
        employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      },
      source: 'pos',
      ipAddress: getRequestIp(request),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, data: result.data },
        { status: result.httpStatus }
      );
    }

    return NextResponse.json(
      {
        data: result.data,
        deletedPhotos: result.deletedPhotos,
        deletedAddons: result.deletedAddons,
        storageFilesDeleted: result.storageFilesDeleted,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('POS un-materialize route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
