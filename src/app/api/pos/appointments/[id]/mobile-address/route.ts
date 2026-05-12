import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { checkPosPermission } from '@/lib/pos/check-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';

const MAX_ADDRESS_LENGTH = 200;

/**
 * PATCH /api/pos/appointments/[id]/mobile-address
 *
 * Update the mobile_address text on a mobile appointment. Phase Mobile-1.6
 * surfaced this field for cashier edit (the detailer needs to see where to
 * drive, and typos need to be fixable). Body: `{ mobile_address: string }`,
 * trimmed, ≤200 chars, non-empty.
 *
 * Permission: pos.jobs.manage (mirrors the cashier-edit-job pattern on the
 * same surface — same surface the cashier uses for vehicle / services /
 * notes edits).
 *
 * Scope (LOCKED-C/D in Phase Mobile-1.6):
 *  - Only writes appointments.mobile_address. No other appointment field is
 *    touched (mobile_zone_id, mobile_surcharge, mobile_zone_name_snapshot
 *    are historically locked at job creation per Phase Mobile-1 design).
 *  - No save-to-customer prompt. Cashier can update customer profile
 *    separately if needed.
 *  - Rejects updates on appointments where is_mobile=false (defense in
 *    depth — the UI doesn't expose this on non-mobile jobs).
 */
export async function PATCH(
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
        { error: "You don't have permission to edit job details" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const raw = typeof body?.mobile_address === 'string' ? body.mobile_address : '';
    const next = raw.trim();
    if (!next) {
      return NextResponse.json(
        { error: 'Address is required for mobile service' },
        { status: 400 }
      );
    }
    if (next.length > MAX_ADDRESS_LENGTH) {
      return NextResponse.json(
        { error: `Address is too long (max ${MAX_ADDRESS_LENGTH} characters)` },
        { status: 400 }
      );
    }

    const { data: current, error: fetchErr } = await supabase
      .from('appointments')
      .select('id, is_mobile, mobile_address')
      .eq('id', id)
      .single();
    if (fetchErr || !current) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 });
    }
    if (!current.is_mobile) {
      return NextResponse.json(
        { error: 'Appointment is not a mobile service' },
        { status: 400 }
      );
    }

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        mobile_address: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (updateErr) {
      console.error('Mobile address update failed:', updateErr.message);
      return NextResponse.json(
        { error: 'Failed to update mobile address' },
        { status: 500 }
      );
    }

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'booking',
      entityId: id,
      entityLabel: `Appointment #${id.slice(0, 8)}`,
      details: {
        field: 'mobile_address',
        before: current.mobile_address,
        after: next,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: { mobile_address: next } });
  } catch (err) {
    console.error('Mobile address PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
