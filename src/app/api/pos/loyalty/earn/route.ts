import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { LOYALTY, WATER_SKU } from '@/lib/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { transaction_id, customer_id } = body;

    if (!transaction_id || !customer_id) {
      return NextResponse.json(
        { error: 'transaction_id and customer_id are required' },
        { status: 400 }
      );
    }

    // Fetch transaction items to calculate eligible spend
    const { data: items, error: itemsError } = await supabase
      .from('transaction_items')
      .select('total_price, product_id')
      .eq('transaction_id', transaction_id);

    if (itemsError) {
      console.error('Loyalty earn items fetch error:', itemsError);
      return NextResponse.json(
        { error: 'Failed to fetch transaction items' },
        { status: 500 }
      );
    }

    // Look up water product to exclude
    const { data: waterProduct } = await supabase
      .from('products')
      .select('id')
      .eq('sku', WATER_SKU)
      .maybeSingle();

    const waterProductId = waterProduct?.id;

    // Calculate eligible spend (exclude water SKU)
    const eligibleSpend = (items ?? [])
      .filter((i) => i.product_id !== waterProductId)
      .reduce((sum, i) => sum + i.total_price, 0);

    // Calculate points: 1 point per $1 spent (floor)
    const pointsEarned = Math.floor(eligibleSpend * LOYALTY.EARN_RATE);

    if (pointsEarned <= 0) {
      return NextResponse.json({
        data: { points_earned: 0, new_balance: 0 },
      });
    }

    // Get current balance
    const { data: customer } = await supabase
      .from('customers')
      .select('loyalty_points_balance')
      .eq('id', customer_id)
      .single();

    const currentBalance = customer?.loyalty_points_balance ?? 0;
    const newBalance = currentBalance + pointsEarned;

    // Insert ledger entry
    const { error: ledgerError } = await supabase
      .from('loyalty_ledger')
      .insert({
        customer_id,
        transaction_id,
        action: 'earned',
        points_change: pointsEarned,
        points_balance: newBalance,
        description: `Earned ${pointsEarned} points from purchase`,
      });

    if (ledgerError) {
      console.error('Loyalty ledger insert error:', ledgerError);
      return NextResponse.json(
        { error: 'Failed to record loyalty points' },
        { status: 500 }
      );
    }

    // Update customer balance
    await supabase
      .from('customers')
      .update({ loyalty_points_balance: newBalance })
      .eq('id', customer_id);

    // Update transaction with points earned
    await supabase
      .from('transactions')
      .update({ loyalty_points_earned: pointsEarned })
      .eq('id', transaction_id);

    return NextResponse.json({
      data: {
        points_earned: pointsEarned,
        new_balance: newBalance,
      },
    });
  } catch (err) {
    console.error('Loyalty earn error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
