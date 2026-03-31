import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

interface DeleteResult {
  table: string;
  deleted: number;
}

interface DeleteError {
  table: string;
  error: string;
}

export async function POST(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.manage');
    if (denied) return denied;

    const body = await request.json();
    const { customerIds } = body as { customerIds: string[] };

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ error: 'customerIds array required' }, { status: 400 });
    }

    if (customerIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 customers per purge' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Validate all customers exist and get their phone numbers
    const { data: customers, error: custErr } = await supabase
      .from('customers')
      .select('id, phone, first_name, last_name')
      .in('id', customerIds);

    if (custErr) {
      return NextResponse.json({ error: 'Failed to look up customers' }, { status: 500 });
    }

    if (!customers || customers.length !== customerIds.length) {
      const foundIds = new Set(customers?.map((c) => c.id) || []);
      const missing = customerIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        { error: `Customer(s) not found: ${missing.join(', ')}` },
        { status: 400 }
      );
    }

    const phones = customers.map((c) => c.phone).filter(Boolean) as string[];
    const details: DeleteResult[] = [];
    const errors: DeleteError[] = [];

    // Helper: delete with error capture, continue on failure
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function safeDelete(table: string, deleteFn: () => PromiseLike<any>) {
      try {
        const result = await deleteFn();
        if (result?.error) {
          console.error(`[Purge] ${table} error:`, result.error.message);
          errors.push({ table, error: result.error.message });
        } else {
          details.push({ table, deleted: result?.count ?? 0 });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[Purge] ${table} exception:`, msg);
        errors.push({ table, error: msg });
      }
    }

    // -----------------------------------------------------------------------
    // Pre-capture IDs needed for transitive lookups
    // -----------------------------------------------------------------------

    const { data: appointmentRows } = await supabase
      .from('appointments')
      .select('id')
      .in('customer_id', customerIds);
    const appointmentIds = appointmentRows?.map((r) => r.id) || [];

    const { data: jobRows } = await supabase
      .from('jobs')
      .select('id')
      .in('customer_id', customerIds);
    const jobIds = jobRows?.map((r) => r.id) || [];

    const { data: quoteRows } = await supabase
      .from('quotes')
      .select('id')
      .in('customer_id', customerIds);
    const quoteIds = quoteRows?.map((r) => r.id) || [];

    // Transactions by customer_id OR appointment_id (catches NULL customer_id)
    let transactionIds: string[] = [];
    {
      const { data: txByCustomer } = await supabase
        .from('transactions')
        .select('id')
        .in('customer_id', customerIds);
      const txIds1 = new Set((txByCustomer || []).map((r) => r.id));

      if (appointmentIds.length > 0) {
        const { data: txByAppt } = await supabase
          .from('transactions')
          .select('id')
          .in('appointment_id', appointmentIds);
        for (const r of txByAppt || []) txIds1.add(r.id);
      }
      transactionIds = [...txIds1];
    }

    const { data: orderRows } = await supabase
      .from('orders')
      .select('id')
      .in('customer_id', customerIds);
    const orderIds = orderRows?.map((r) => r.id) || [];

    // Conversations by phone OR customer_id
    let conversationIds: string[] = [];
    {
      const convIds = new Set<string>();
      if (phones.length > 0) {
        const { data: convByPhone } = await supabase
          .from('conversations')
          .select('id')
          .in('phone_number', phones);
        for (const r of convByPhone || []) convIds.add(r.id);
      }
      const { data: convByCust } = await supabase
        .from('conversations')
        .select('id')
        .in('customer_id', customerIds);
      for (const r of convByCust || []) convIds.add(r.id);
      conversationIds = [...convIds];
    }

    console.log(
      `[Purge] Starting purge for ${customerIds.length} customer(s) by ${employee.first_name} ${employee.last_name}` +
      ` | appointments: ${appointmentIds.length}, jobs: ${jobIds.length}, quotes: ${quoteIds.length}` +
      `, transactions: ${transactionIds.length}, orders: ${orderIds.length}` +
      `, conversations: ${conversationIds.length}`
    );

    // -----------------------------------------------------------------------
    // Step 1 — Transitive children blocking via RESTRICT chain
    // refund_items → refunds → transactions
    // -----------------------------------------------------------------------

    if (transactionIds.length > 0) {
      // Get refund IDs for these transactions
      const { data: refundRows } = await supabase
        .from('refunds')
        .select('id')
        .in('transaction_id', transactionIds);
      const refundIds = refundRows?.map((r) => r.id) || [];

      if (refundIds.length > 0) {
        await safeDelete('refund_items', () =>
          supabase.from('refund_items').delete({ count: 'exact' }).in('refund_id', refundIds)
        );
        await safeDelete('refunds', () =>
          supabase.from('refunds').delete({ count: 'exact' }).in('id', refundIds)
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 2 — RESTRICT parents blocking customer deletion
    // -----------------------------------------------------------------------

    if (appointmentIds.length > 0) {
      await safeDelete('appointment_services', () =>
        supabase.from('appointment_services').delete({ count: 'exact' }).in('appointment_id', appointmentIds)
      );
      await safeDelete('appointments', () =>
        supabase.from('appointments').delete({ count: 'exact' }).in('id', appointmentIds)
      );
    }

    // Jobs reference quotes via quote_id (default RESTRICT) — must delete before quotes.
    // job_photos and job_addons cascade from jobs automatically.
    if (jobIds.length > 0) {
      await safeDelete('jobs', () =>
        supabase.from('jobs').delete({ count: 'exact' }).in('id', jobIds)
      );
    }

    if (quoteIds.length > 0) {
      await safeDelete('quote_items', () =>
        supabase.from('quote_items').delete({ count: 'exact' }).in('quote_id', quoteIds)
      );
      await safeDelete('quote_communications', () =>
        supabase.from('quote_communications').delete({ count: 'exact' }).in('quote_id', quoteIds)
      );
      await safeDelete('quotes', () =>
        supabase.from('quotes').delete({ count: 'exact' }).in('id', quoteIds)
      );
    }

    // -----------------------------------------------------------------------
    // Step 3 — SET NULL tables (won't block but remove orphan data)
    // -----------------------------------------------------------------------

    if (transactionIds.length > 0) {
      await safeDelete('transactions', () =>
        supabase.from('transactions').delete({ count: 'exact' }).in('id', transactionIds)
      );
    }

    if (conversationIds.length > 0) {
      await safeDelete('messages', () =>
        supabase.from('messages').delete({ count: 'exact' }).in('conversation_id', conversationIds)
      );
      await safeDelete('conversations', () =>
        supabase.from('conversations').delete({ count: 'exact' }).in('id', conversationIds)
      );
    }

    // -----------------------------------------------------------------------
    // Step 4 — No-constraint / nullable FK tables (prevent orphans)
    // -----------------------------------------------------------------------

    if (orderIds.length > 0) {
      await safeDelete('order_items', () =>
        supabase.from('order_items').delete({ count: 'exact' }).in('order_id', orderIds)
      );
      await safeDelete('orders', () =>
        supabase.from('orders').delete({ count: 'exact' }).in('id', orderIds)
      );
    }

    await safeDelete('link_clicks', () =>
      supabase.from('link_clicks').delete({ count: 'exact' }).in('customer_id', customerIds)
    );
    await safeDelete('tracked_links', () =>
      supabase.from('tracked_links').delete({ count: 'exact' }).in('customer_id', customerIds)
    );
    await safeDelete('sms_delivery_log', () =>
      supabase.from('sms_delivery_log').delete({ count: 'exact' }).in('customer_id', customerIds)
    );
    await safeDelete('email_delivery_log', () =>
      supabase.from('email_delivery_log').delete({ count: 'exact' }).in('customer_id', customerIds)
    );
    await safeDelete('lifecycle_executions', () =>
      supabase.from('lifecycle_executions').delete({ count: 'exact' }).in('customer_id', customerIds)
    );

    // waitlist_entries — may or may not exist, safe to attempt
    await safeDelete('waitlist_entries', () =>
      supabase.from('waitlist_entries').delete({ count: 'exact' }).in('customer_id', customerIds)
    );

    // -----------------------------------------------------------------------
    // Step 5 — Phone-based tables (no customer_id FK)
    // -----------------------------------------------------------------------

    if (phones.length > 0) {
      await safeDelete('voice_call_log', () =>
        supabase.from('voice_call_log').delete({ count: 'exact' }).in('phone', phones)
      );
    }

    // -----------------------------------------------------------------------
    // Step 6 — Customer records (CASCADE handles: vehicles, loyalty_ledger,
    // customer_payment_methods, marketing_consent_log, sms_consent_log,
    // campaign_recipients, drip_enrollments, drip_send_log)
    // Note: jobs deleted explicitly in Step 2 (before quotes) due to jobs.quote_id RESTRICT FK
    // -----------------------------------------------------------------------

    await safeDelete('customers', () =>
      supabase.from('customers').delete({ count: 'exact' }).in('id', customerIds)
    );

    const customerNames = customers.map((c) => `${c.first_name} ${c.last_name} (${c.phone || 'no phone'})`).join(', ');
    console.log(
      `[Purge] Completed: ${customerIds.length} customer(s) purged by ${employee.first_name} ${employee.last_name}` +
      ` | customers: ${customerNames}` +
      ` | tables: ${details.length} succeeded, ${errors.length} failed`
    );

    return NextResponse.json({
      success: errors.length === 0,
      purgedCount: customerIds.length,
      details,
      errors,
    });
  } catch (err) {
    console.error('Customer purge error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
