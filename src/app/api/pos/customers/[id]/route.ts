import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { logAudit, getRequestIp } from '@/lib/services/audit';

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

    const body = await request.json();
    const { first_name, last_name, email, customer_type } = body as {
      first_name?: string;
      last_name?: string;
      email?: string | null;
      customer_type?: string | null;
    };

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (first_name !== undefined) updates.first_name = first_name.trim();
    if (last_name !== undefined) updates.last_name = last_name.trim();
    if (email !== undefined) updates.email = email?.trim() || null;
    if (customer_type !== undefined) {
      if (customer_type !== null && !['enthusiast', 'professional'].includes(customer_type)) {
        return NextResponse.json(
          { error: 'Invalid customer type' },
          { status: 400 }
        );
      }
      updates.customer_type = customer_type;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update(updates)
      .eq('id', id)
      .is('deleted_at', null)
      .select('id, first_name, last_name, phone, email, customer_type, loyalty_points_balance, visit_count, tags')
      .single();

    if (updateError) {
      console.error('Customer update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update customer' },
        { status: 500 }
      );
    }

    if (!updated) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const entityLabel = updated.first_name && updated.last_name
      ? `${updated.first_name} ${updated.last_name}`
      : `Customer #${id.slice(0, 8)}`;

    logAudit({
      userId: posEmployee.auth_user_id ?? null,
      userEmail: posEmployee.email ?? null,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'update',
      entityType: 'customer',
      entityId: id,
      entityLabel,
      details: updates,
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('POS customer update error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
