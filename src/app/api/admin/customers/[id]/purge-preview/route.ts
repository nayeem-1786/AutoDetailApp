import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession(request);
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const denied = await requirePermission(employee.id, 'settings.manage');
    if (denied) return denied;

    const { id } = await params;
    const supabase = createAdminClient();

    // Verify customer exists and get phone
    const { data: customer, error: custErr } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('id', id)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const phone = customer.phone;

    // Run count queries in parallel
    const [
      appointments,
      quotes,
      jobs,
      vehicles,
      transactions,
      orders,
      conversations,
      voiceCalls,
    ] = await Promise.all([
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('quotes').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('customer_id', id),
      phone
        ? supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('phone_number', phone)
        : Promise.resolve({ count: 0 }),
      phone
        ? supabase.from('voice_call_log').select('*', { count: 'exact', head: true }).eq('phone', phone)
        : Promise.resolve({ count: 0 }),
    ]);

    // Get message count from conversations
    let messageCount = 0;
    if (phone) {
      const { data: convIds } = await supabase
        .from('conversations')
        .select('id')
        .or(`phone_number.eq.${phone},customer_id.eq.${id}`);
      if (convIds && convIds.length > 0) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .in('conversation_id', convIds.map((c) => c.id));
        messageCount = count || 0;
      }
    }

    return NextResponse.json({
      counts: {
        appointments: appointments.count || 0,
        quotes: quotes.count || 0,
        jobs: jobs.count || 0,
        vehicles: vehicles.count || 0,
        transactions: transactions.count || 0,
        orders: orders.count || 0,
        messages: messageCount,
        calls: voiceCalls.count || 0,
      },
    });
  } catch (err) {
    console.error('Purge preview error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
