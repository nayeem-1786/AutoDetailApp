import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
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

    // Get coupon details
    const { data: coupon, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !coupon) {
      return NextResponse.json({ error: 'Coupon not found' }, { status: 404 });
    }

    // Get transactions where this coupon was used
    const { data: transactions, count: usageCount } = await supabase
      .from('transactions')
      .select('id, customer_id, total_amount, discount_amount, transaction_date, customers(first_name, last_name)', { count: 'exact' })
      .eq('coupon_id', id)
      .order('transaction_date', { ascending: false })
      .limit(10);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (transactions ?? []) as any[];

    const revenueAttributed = rows.reduce(
      (sum: number, t: { total_amount: number }) => sum + t.total_amount,
      0
    );

    const topCustomers = rows
      .filter((t) => t.customers)
      .slice(0, 5)
      .map((t) => {
        const cust = Array.isArray(t.customers) ? t.customers[0] : t.customers;
        return {
          name: cust ? `${cust.first_name} ${cust.last_name}` : 'Guest',
          amount: t.total_amount,
        };
      });

    return NextResponse.json({
      data: {
        usage_count: usageCount ?? 0,
        redemption_count: coupon.use_count,
        revenue_attributed: revenueAttributed,
        top_customers: topCustomers,
      },
    });
  } catch (err) {
    console.error('Coupon stats error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
