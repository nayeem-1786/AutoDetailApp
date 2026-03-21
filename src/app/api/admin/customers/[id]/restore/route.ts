import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { sendWelcomeEmail } from '@/lib/email/send-welcome-email';

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
      .select('id, first_name, last_name, email, deleted_at, deactivated_auth_user_id')
      .eq('id', id)
      .not('deleted_at', 'is', null)
      .single();

    if (fetchError || !customer) {
      return NextResponse.json({ error: 'Customer not found or not archived' }, { status: 404 });
    }

    // Clear deleted_at and reset loyalty points balance
    const { error: restoreError } = await supabase
      .from('customers')
      .update({ deleted_at: null, loyalty_points_balance: 0 })
      .eq('id', id);

    if (restoreError) {
      console.error('Failed to restore customer:', restoreError);
      return NextResponse.json({ error: 'Failed to restore customer' }, { status: 500 });
    }

    // Zero loyalty points via ledger entry (preserves history)
    const { data: lastLedger } = await supabase
      .from('loyalty_ledger')
      .select('points_balance')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLedger && lastLedger.points_balance > 0) {
      await supabase
        .from('loyalty_ledger')
        .insert({
          customer_id: id,
          action: 'adjusted',
          points_change: -lastLedger.points_balance,
          points_balance: 0,
          description: `Points reset on account reactivation (previous balance: ${lastLedger.points_balance})`,
        });
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

    // Send welcome email for reactivated customer (non-blocking)
    if (customer.email) {
      sendWelcomeEmail({
        email: customer.email,
        first_name: customer.first_name,
        last_name: customer.last_name,
      }).catch(err => console.error('Welcome email failed (non-blocking):', err));
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
