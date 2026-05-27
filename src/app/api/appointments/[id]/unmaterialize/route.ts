import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { getRequestIp } from '@/lib/services/audit';
import { executeUnMaterialize } from '@/lib/appointments/lifecycle-sync';

const bodySchema = z.object({
  confirmString: z.string().optional(),
});

/**
 * POST /api/appointments/[id]/unmaterialize
 *
 * Admin-side un-materialize (Item 15e Phase 2C). Identical behavior to the POS
 * endpoint — both call the canonical `executeUnMaterialize` seam — but with the
 * admin auth surface (cookie Supabase session + `requirePermission`). The audit
 * established that admin's cookie auth and POS's HMAC auth cannot share one
 * route, hence the two thin parallel endpoints over one shared executor.
 *
 * Auth: `getEmployeeFromSession` + `requirePermission('appointments.cancel')`
 * (no new permission key). Fires NO webhooks/notifications (silent revert).
 *
 * Status codes mirror the POS endpoint: 401/403/404/409/422/200.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.cancel');
    if (denied) return denied;

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

    const result = await executeUnMaterialize(supabase, id, {
      confirmString: parsed.data.confirmString,
      actor: {
        userId: employee.auth_user_id,
        userEmail: employee.email,
        employeeName:
          [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      },
      source: 'admin',
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
    console.error('Admin un-materialize route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
