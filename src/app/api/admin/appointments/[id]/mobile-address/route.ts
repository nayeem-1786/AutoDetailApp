import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';

const MAX_ADDRESS_LENGTH = 200;

/**
 * PATCH /api/admin/appointments/[id]/mobile-address
 *
 * Admin/staff counterpart to /api/pos/appointments/[id]/mobile-address.
 * Body: `{ mobile_address: string }`, trimmed, ≤200 chars, non-empty.
 *
 * Permission: appointments.add_notes (mirrors the existing edit-notes
 * pattern on the admin appointment detail dialog — same surface, same
 * gate, no new permission introduced).
 *
 * Scope (LOCKED-C/D in Phase Mobile-1.6):
 *  - Only writes appointments.mobile_address.
 *  - No save-to-customer prompt.
 *  - Rejects updates on appointments where is_mobile=false.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(employee.id, 'appointments.add_notes');
    if (denied) return denied;

    const { id } = await params;
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

    const supabase = createAdminClient();
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
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName:
        [employee.first_name, employee.last_name].filter(Boolean).join(' ') ||
        null,
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
      source: 'admin',
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
