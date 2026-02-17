import { NextRequest, NextResponse } from 'next/server';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const denied = await requirePermission(employee.id, 'orders.view');
    if (denied) return denied;

    const admin = createAdminClient();
    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const search = url.searchParams.get('search')?.trim() || '';
    const paymentStatus = url.searchParams.get('payment_status') || '';
    const fulfillmentStatus = url.searchParams.get('fulfillment_status') || '';
    const dateRange = url.searchParams.get('date_range') || '';

    // Build query
    let query = admin
      .from('orders')
      .select('*, order_items(id)', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Search: order number, name, email
    if (search) {
      query = query.or(
        `order_number.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`
      );
    }

    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }
    if (fulfillmentStatus) {
      query = query.eq('fulfillment_status', fulfillmentStatus);
    }

    // Date range filter
    if (dateRange) {
      const now = new Date();
      let startDate: Date | null = null;
      if (dateRange === 'today') {
        startDate = new Date(now.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }));
      } else if (dateRange === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (dateRange === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else if (dateRange === '90d') {
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      }
      if (startDate) {
        query = query.gte('created_at', startDate.toISOString());
      }
    }

    // Paginate
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data: orders, count, error } = await query;
    if (error) throw error;

    // Compute stats (separate queries for accuracy)
    const [totalResult, revenueResult, pendingResult, todayResult] = await Promise.all([
      admin.from('orders').select('id', { count: 'exact', head: true }),
      admin
        .from('orders')
        .select('total')
        .eq('payment_status', 'paid'),
      admin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('fulfillment_status', 'unfulfilled')
        .eq('payment_status', 'paid'),
      (() => {
        // Today in PST
        const now = new Date();
        const pst = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const todayStart = new Date(pst.getFullYear(), pst.getMonth(), pst.getDate());
        return admin
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString());
      })(),
    ]);

    const revenue = (revenueResult.data || []).reduce(
      (sum: number, o: { total: number }) => sum + o.total,
      0
    );

    // Map orders with item count
    const mappedOrders = (orders || []).map((order) => ({
      ...order,
      item_count: Array.isArray(order.order_items) ? order.order_items.length : 0,
      order_items: undefined,
    }));

    return NextResponse.json({
      orders: mappedOrders,
      total: count ?? 0,
      page,
      limit,
      stats: {
        totalOrders: totalResult.count ?? 0,
        revenue,
        pendingFulfillment: pendingResult.count ?? 0,
        ordersToday: todayResult.count ?? 0,
      },
    });
  } catch (err) {
    console.error('[admin/orders] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
