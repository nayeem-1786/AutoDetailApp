import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { requirePermission } from '@/lib/auth/require-permission';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import { logAudit, getRequestIp } from '@/lib/services/audit';

/**
 * Authenticate request via POS HMAC token or admin session.
 * Returns the employee_id if authenticated, null otherwise.
 */
async function authenticate(request: NextRequest): Promise<string | null> {
  const posEmployee = authenticatePosRequest(request);
  if (posEmployee) return posEmployee.employee_id;

  const supabaseSession = await createClient();
  const { data: { user } } = await supabaseSession.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: employee } = await admin
    .from('employees')
    .select('id')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .single();

  return employee?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const employeeId = await authenticate(request);
    if (!employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(id, first_name, last_name, phone, email, customer_type, created_at),
        vehicle:vehicles(id, vehicle_type, year, make, model, color, size_class),
        employee:employees(id, first_name, last_name),
        items:transaction_items(*),
        payments(*)
      `)
      .eq('id', id)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Fetch receipt config so callers can render branded receipts
    const { merged: receipt_config } = await fetchReceiptConfig(supabase);

    // Fetch review URLs for QR shortcode rendering in previews
    const { data: reviewUrlRows } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['google_review_url', 'yelp_review_url']);

    const review_urls: Record<string, string> = {};
    for (const r of reviewUrlRows ?? []) {
      if (typeof r.value === 'string') review_urls[r.key] = r.value;
    }

    return NextResponse.json({ data: transaction, receipt_config, review_urls });
  } catch (err) {
    console.error('Transaction GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const employeeId = await authenticate(request);
    if (!employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const posEmployee = authenticatePosRequest(request);
    const supabase = createAdminClient();

    const body = await request.json();
    const { action } = body;

    if (action === 'void') {
      const denied = await requirePermission(employeeId, 'pos.void_transactions');
      if (denied) return denied;
      const { data: transaction, error } = await supabase
        .from('transactions')
        .update({ status: 'voided' })
        .eq('id', id)
        .eq('status', 'completed')
        .select('*')
        .single();

      if (error || !transaction) {
        return NextResponse.json(
          { error: 'Transaction not found or already voided' },
          { status: 400 }
        );
      }

      // Restore loyalty points on void
      if (transaction.customer_id) {
        const { data: custForLoyalty } = await supabase
          .from('customers')
          .select('loyalty_points_balance')
          .eq('id', transaction.customer_id)
          .single();

        if (custForLoyalty) {
          let currentBalance = custForLoyalty.loyalty_points_balance ?? 0;

          // Restore redeemed points
          if (transaction.loyalty_points_redeemed > 0) {
            currentBalance += transaction.loyalty_points_redeemed;
            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: id,
              action: 'adjusted',
              points_change: transaction.loyalty_points_redeemed,
              points_balance: currentBalance,
              description: `Void: restored ${transaction.loyalty_points_redeemed} redeemed pts`,
            });
          }

          // Reverse earned points
          if (transaction.loyalty_points_earned > 0) {
            currentBalance = Math.max(0, currentBalance - transaction.loyalty_points_earned);
            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: id,
              action: 'adjusted',
              points_change: -transaction.loyalty_points_earned,
              points_balance: currentBalance,
              description: `Void: reversed ${transaction.loyalty_points_earned} earned pts`,
            });
          }

          // Update customer balance
          if (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0) {
            await supabase
              .from('customers')
              .update({ loyalty_points_balance: currentBalance })
              .eq('id', transaction.customer_id);
          }
        }
      }

      logAudit({
        userId: posEmployee?.auth_user_id ?? null,
        userEmail: posEmployee?.email ?? null,
        employeeName: posEmployee ? `${posEmployee.first_name} ${posEmployee.last_name}` : null,
        action: 'void',
        entityType: 'transaction',
        entityId: id,
        entityLabel: `Transaction #${id.slice(0, 8)}`,
        details: body.reason ? { reason: body.reason } : undefined,
        ipAddress: getRequestIp(request),
        source: 'pos',
      });

      return NextResponse.json({ data: transaction });
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (err) {
    console.error('Transaction PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
