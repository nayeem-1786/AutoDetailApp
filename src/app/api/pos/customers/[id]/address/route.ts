// Phase Mobile-1.1 — PATCH /api/pos/customers/[id]/address
//
// Save a free-text address string into the customer's structured profile
// columns (best-effort parse via parseAddressString; low-confidence input
// is preserved as address_line_1 with other fields nulled).
//
// Called by the SaveAddressDialog after a POS staff member confirms the
// diff prompt. Idempotent — re-running with the same input is a no-op.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { parseAddressString } from '@/lib/utils/format-address';
import { logAudit, getRequestIp } from '@/lib/services/audit';

// Auth: authenticatePosRequest only — mirrors the existing
// /api/pos/customers/[id]/route.ts PATCH (which edits name/email/type) and
// avoids inconsistent UX where the cashier can edit name but not address.
// A dedicated permission-gating cleanup is deferred to a future staff
// permissions audit session.

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    const { id } = await params;
    const body = await request.json();
    const enteredAddress = typeof body?.entered_address === 'string'
      ? body.entered_address
      : '';
    const trimmed = enteredAddress.trim();

    if (!trimmed) {
      return NextResponse.json(
        { error: 'entered_address is required' },
        { status: 400 }
      );
    }
    if (trimmed.length > 200) {
      return NextResponse.json(
        { error: 'entered_address must be 200 characters or fewer' },
        { status: 400 }
      );
    }

    const parsed = parseAddressString(trimmed);
    const updates = {
      address_line_1: parsed.address_line_1 || trimmed.slice(0, 200),
      address_line_2: parsed.address_line_2,
      city: parsed.city,
      state: parsed.state,
      zip: parsed.zip,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select(
        'id, first_name, last_name, phone, email, address_line_1, address_line_2, city, state, zip'
      )
      .single();

    if (error) {
      console.error('POS customer address update error:', error);
      return NextResponse.json(
        { error: 'Failed to update address' },
        { status: 500 }
      );
    }
    if (!updated) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    logAudit({
      userId: posEmployee.auth_user_id ?? null,
      userEmail: posEmployee.email ?? null,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'customer',
      entityId: id,
      entityLabel: `${updated.first_name} ${updated.last_name}`.trim() || `Customer #${id.slice(0, 8)}`,
      details: {
        field: 'address',
        confidence: parsed.confidence,
        entered_address: trimmed,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ customer: updated });
  } catch (err) {
    console.error('POS customer address PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
