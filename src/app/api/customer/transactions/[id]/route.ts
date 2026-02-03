import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const { data: transaction, error } = await admin
      .from('transactions')
      .select(
        `id, receipt_number, status, subtotal, tax_amount, tip_amount,
         discount_amount, total_amount, payment_method, loyalty_points_earned,
         loyalty_points_redeemed, loyalty_discount, transaction_date, notes,
         created_at,
         transaction_items(
           id, item_type, item_name, quantity, unit_price, total_price,
           tax_amount, tier_name, vehicle_size_class
         ),
         payments(
           id, method, amount, tip_amount, card_brand, card_last_four
         ),
         vehicles(year, make, model, color)`
      )
      .eq('id', id)
      .eq('customer_id', customer.id)
      .single();

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({ data: transaction });
  } catch (err) {
    console.error('Transaction detail GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
