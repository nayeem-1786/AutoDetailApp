import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { requirePermission } from '@/lib/auth/require-permission';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import { logAudit, getRequestIp } from '@/lib/services/audit';
import { notifyTransactionVoided } from '@/lib/email/send-void-notification';

/**
 * Authenticate request via POS HMAC token or admin session.
 * Returns the employee_id if authenticated, null otherwise.
 */
async function authenticate(request: NextRequest): Promise<string | null> {
  const posEmployee = await authenticatePosRequest(request);
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
        payments(*),
        refunds(*, refund_items(*)),
        jobs(id, status)
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
    const posEmployee = await authenticatePosRequest(request);
    const supabase = createAdminClient();

    const body = await request.json();
    const { action } = body;

    if (action === 'void') {
      const denied = await requirePermission(employeeId, 'pos.void_transactions');
      if (denied) return denied;

      const reason = typeof body.reason === 'string' ? body.reason : null;

      const { data: rpcResult, error: rpcError } = await supabase.rpc('void_transaction', {
        p_transaction_id: id,
        p_user_id: employeeId,
        p_reason: reason,
      });

      if (rpcError) {
        console.error('void_transaction RPC error:', rpcError);
        return NextResponse.json(
          { error: 'Failed to void transaction' },
          { status: 500 }
        );
      }

      const result = rpcResult as {
        status: 'success' | 'error';
        error_code?: string;
        current_status?: string;
        transaction_id?: string;
        items_restored?: number;
        units_restored?: number;
        loyalty_restored?: number;
        loyalty_clawed?: number;
        coupon_reversed?: boolean;
        campaign_reversed?: boolean;
        job_cancelled?: boolean;
        job_id?: string | null;
        customer_id?: string | null;
      } | null;

      if (!result || result.status === 'error') {
        if (result?.error_code === 'NOT_FOUND') {
          return NextResponse.json(
            { error: 'Transaction not found' },
            { status: 404 }
          );
        }
        if (result?.error_code === 'NOT_VOIDABLE') {
          return NextResponse.json(
            {
              error: `Transaction cannot be voided (status: ${result.current_status ?? 'unknown'})`,
              current_status: result?.current_status,
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: 'Failed to void transaction' },
          { status: 500 }
        );
      }

      // Fire-and-forget customer notification when a job was cancelled
      // by the cascade. Walk-in / no-customer voids skip this.
      if (result.customer_id && result.job_cancelled) {
        notifyTransactionVoided({
          customerId: result.customer_id,
          transactionId: id,
          jobCancelled: true,
          reason,
        }).catch((err) =>
          console.error('[void notification] failed:', err)
        );
      }

      logAudit({
        userId: posEmployee?.auth_user_id ?? null,
        userEmail: posEmployee?.email ?? null,
        employeeName: posEmployee ? `${posEmployee.first_name} ${posEmployee.last_name}` : null,
        action: 'void',
        entityType: 'transaction',
        entityId: id,
        entityLabel: `Transaction #${id.slice(0, 8)}`,
        details: {
          reason: reason ?? undefined,
          items_restored: result.items_restored,
          units_restored: result.units_restored,
          loyalty_restored: result.loyalty_restored,
          loyalty_clawed: result.loyalty_clawed,
          coupon_reversed: result.coupon_reversed,
          campaign_reversed: result.campaign_reversed,
          job_cancelled: result.job_cancelled,
        },
        ipAddress: getRequestIp(request),
        source: 'pos',
      });

      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .single();

      return NextResponse.json({
        data: transaction,
        void_result: {
          items_restored: result.items_restored ?? 0,
          units_restored: result.units_restored ?? 0,
          loyalty_restored: result.loyalty_restored ?? 0,
          loyalty_clawed: result.loyalty_clawed ?? 0,
          coupon_reversed: result.coupon_reversed ?? false,
          campaign_reversed: result.campaign_reversed ?? false,
          job_cancelled: result.job_cancelled ?? false,
        },
      });
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
