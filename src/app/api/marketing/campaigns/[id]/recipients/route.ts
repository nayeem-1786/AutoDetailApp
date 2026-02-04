import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: employee } = await supabase
      .from('employees')
      .select('role')
      .eq('auth_user_id', user.id)
      .single();
    if (!employee || !['super_admin', 'admin'].includes(employee.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    const { data, count, error } = await supabase
      .from('campaign_recipients')
      .select(
        'id, customer_id, channel, coupon_code, delivered, opened_at, clicked_at, sent_at, customers(first_name, last_name, phone, email)',
        { count: 'exact' }
      )
      .eq('campaign_id', id)
      .order('sent_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipients = (data ?? []).map((r: any) => {
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      return {
        id: r.id,
        customer_id: r.customer_id,
        name: cust ? `${cust.first_name} ${cust.last_name}` : 'Unknown',
        phone: cust?.phone ?? null,
        email: cust?.email ?? null,
        channel: r.channel,
        coupon_code: r.coupon_code,
        delivered: r.delivered,
        opened_at: r.opened_at ?? null,
        clicked_at: r.clicked_at ?? null,
        sent_at: r.sent_at,
      };
    });

    return NextResponse.json({ data: recipients, total: count ?? 0, page, limit });
  } catch (err) {
    console.error('List recipients error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
