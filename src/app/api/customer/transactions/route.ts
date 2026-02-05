import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

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

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    // Get total count
    const { count } = await admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'refunded']);

    // Get paginated transactions with vehicle info
    const { data: transactions, error } = await admin
      .from('transactions')
      .select(
        `id, receipt_number, status, subtotal, tax_amount, tip_amount,
         discount_amount, total_amount, payment_method, loyalty_points_earned,
         loyalty_points_redeemed, loyalty_discount, transaction_date, created_at,
         vehicles(year, make, model, color)`
      )
      .eq('customer_id', customer.id)
      .in('status', ['completed', 'refunded'])
      .order('transaction_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Fetch transactions error:', error.message);
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    // Get customer stats for summary cards
    const { data: customerData } = await admin
      .from('customers')
      .select('loyalty_points_balance, lifetime_spend, first_visit_date')
      .eq('id', customer.id)
      .single();

    return NextResponse.json({
      data: transactions,
      total: count ?? 0,
      page,
      limit,
      stats: {
        total_visits: count ?? 0,
        lifetime_spend: customerData?.lifetime_spend ?? 0,
        loyalty_balance: customerData?.loyalty_points_balance ?? 0,
        member_since: customerData?.first_visit_date ?? null,
      },
    });
  } catch (err) {
    console.error('Transactions GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
