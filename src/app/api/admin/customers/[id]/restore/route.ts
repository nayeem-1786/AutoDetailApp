import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Same permission as archive — inverse operations
    const denied = await requirePermission(employee.id, 'customers.delete');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify customer exists and IS archived
    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('id, first_name, last_name, deleted_at, deactivated_auth_user_id')
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .single();

    if (fetchError || !customer) {
      return NextResponse.json({ error: 'Customer not found or not archived' }, { status: 404 });
    }

    // Clear deleted_at
    const { error: restoreError } = await supabase
      .from('customers')
      .update({ deleted_at: null })
      .eq('id', id);

    if (restoreError) {
      console.error('Failed to restore customer:', restoreError);
      return NextResponse.json({ error: 'Failed to restore customer' }, { status: 500 });
    }

    // Re-link portal access if it was disconnected during archive
    if (customer.deactivated_auth_user_id) {
      try {
        await supabase
          .from('customers')
          .update({
            auth_user_id: customer.deactivated_auth_user_id,
            deactivated_auth_user_id: null,
          })
          .eq('id', id);
      } catch (e) {
        console.error('Failed to restore portal access:', e);
      }
    }

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'update',
      entityType: 'customer',
      entityId: id,
      entityLabel: `Restored: ${customer.first_name} ${customer.last_name}`.trim(),
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Restore customer error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
