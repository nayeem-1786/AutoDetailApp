import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: customer } = await admin
      .from('customers')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10', 10)));

    const from = (page - 1) * limit;
    const { data: orders, count, error } = await admin
      .from('orders')
      .select('*, order_items(id, product_name, quantity, line_total)', { count: 'exact' })
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;

    const mappedOrders = (orders || []).map((order) => ({
      id: order.id,
      order_number: order.order_number,
      created_at: order.created_at,
      total: order.total,
      payment_status: order.payment_status,
      fulfillment_status: order.fulfillment_status,
      fulfillment_method: order.fulfillment_method,
      item_count: Array.isArray(order.order_items) ? order.order_items.length : 0,
    }));

    return NextResponse.json({
      orders: mappedOrders,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[account/orders] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
