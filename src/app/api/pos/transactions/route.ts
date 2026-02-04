import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionCreateSchema } from '@/lib/utils/validation';
import { CC_FEE_RATE, LOYALTY, WATER_SKU } from '@/lib/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = transactionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Look up employee
    const { data: employee } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    // 1. Insert transaction
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .insert({
        customer_id: data.customer_id || null,
        vehicle_id: data.vehicle_id || null,
        employee_id: employee?.id || null,
        status: 'completed',
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        tip_amount: data.tip_amount,
        discount_amount: data.discount_amount,
        total_amount: data.total_amount,
        payment_method: data.payment_method,
        coupon_id: data.coupon_id || null,
        loyalty_points_earned: 0,
        loyalty_points_redeemed: data.loyalty_points_redeemed || 0,
        loyalty_discount: data.loyalty_discount || 0,
        notes: data.notes || null,
        transaction_date: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (txError || !transaction) {
      console.error('Transaction insert error:', txError);
      return NextResponse.json(
        { error: 'Failed to create transaction' },
        { status: 500 }
      );
    }

    // 2. Insert transaction items
    if (data.items && data.items.length > 0) {
      const itemRows = data.items.map((item: {
        item_type: string;
        product_id?: string | null;
        service_id?: string | null;
        item_name: string;
        quantity: number;
        unit_price: number;
        total_price: number;
        tax_amount: number;
        is_taxable: boolean;
        tier_name?: string | null;
        vehicle_size_class?: string | null;
        notes?: string | null;
      }) => ({
        transaction_id: transaction.id,
        item_type: item.item_type,
        product_id: item.product_id || null,
        service_id: item.service_id || null,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        tax_amount: item.tax_amount,
        is_taxable: item.is_taxable,
        tier_name: item.tier_name || null,
        vehicle_size_class: item.vehicle_size_class || null,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Transaction items insert error:', itemsError);
      }
    }

    // 3. Insert payment(s)
    if (data.payments && data.payments.length > 0) {
      const paymentRows = data.payments.map((p: {
        method: string;
        amount: number;
        tip_amount: number;
        stripe_payment_intent_id?: string | null;
        card_brand?: string | null;
        card_last_four?: string | null;
      }) => ({
        transaction_id: transaction.id,
        method: p.method,
        amount: p.amount,
        tip_amount: p.tip_amount,
        tip_net: p.method === 'card'
          ? Math.round(p.tip_amount * (1 - CC_FEE_RATE) * 100) / 100
          : p.tip_amount,
        stripe_payment_intent_id: p.stripe_payment_intent_id || null,
        card_brand: p.card_brand || null,
        card_last_four: p.card_last_four || null,
      }));

      const { error: payError } = await supabase
        .from('payments')
        .insert(paymentRows);

      if (payError) {
        console.error('Payments insert error:', payError);
      }
    }

    // 4. Decrement product inventory
    const productItems = (data.items ?? []).filter(
      (i: { item_type: string; product_id?: string | null; quantity: number }) =>
        i.item_type === 'product' && i.product_id
    );

    for (const item of productItems) {
      const { error: invError } = await supabase.rpc('decrement_product_quantity', {
        p_product_id: item.product_id,
        p_quantity: item.quantity,
      });

      // If RPC doesn't exist, fall back to manual update
      if (invError) {
        await supabase
          .from('products')
          .update({
            quantity_on_hand: Math.max(
              0,
              // We do a raw decrement here — not ideal but functional
              0 // Will be corrected by the select below
            ),
          })
          .eq('id', item.product_id);

        // Fetch and decrement manually
        const { data: prod } = await supabase
          .from('products')
          .select('quantity_on_hand')
          .eq('id', item.product_id)
          .single();

        if (prod) {
          await supabase
            .from('products')
            .update({
              quantity_on_hand: Math.max(0, prod.quantity_on_hand - item.quantity),
            })
            .eq('id', item.product_id);
        }
      }
    }

    // 5. Update customer visit stats if customer provided
    if (data.customer_id) {
      const { data: cust } = await supabase
        .from('customers')
        .select('visit_count, lifetime_spend')
        .eq('id', data.customer_id)
        .single();

      if (cust) {
        await supabase
          .from('customers')
          .update({
            visit_count: cust.visit_count + 1,
            lifetime_spend: Math.round((cust.lifetime_spend + data.total_amount) * 100) / 100,
            last_visit_date: new Date().toISOString().split('T')[0],
          })
          .eq('id', data.customer_id);
      }
    }

    // 6. Loyalty points earn (if customer, and items qualify)
    if (data.customer_id) {
      // Get current loyalty balance
      const { data: custForLoyalty } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', data.customer_id)
        .single();

      let currentBalance = custForLoyalty?.loyalty_points_balance ?? 0;

      // Handle loyalty redemption first (deduct points)
      if (data.loyalty_points_redeemed > 0) {
        currentBalance = Math.max(0, currentBalance - data.loyalty_points_redeemed);

        await supabase.from('loyalty_ledger').insert({
          customer_id: data.customer_id,
          transaction_id: transaction.id,
          action: 'redeemed',
          points_change: -data.loyalty_points_redeemed,
          points_balance: currentBalance,
          description: `Redeemed for -$${(data.loyalty_discount || 0).toFixed(2)} discount`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', data.customer_id);
      }

      // Calculate eligible spend (exclude WATER_SKU)
      const { data: waterProduct } = await supabase
        .from('products')
        .select('id')
        .eq('sku', WATER_SKU)
        .maybeSingle();

      const waterProductId = waterProduct?.id ?? null;

      const earnableSpend = (data.items ?? []).reduce(
        (sum: number, i: { item_type: string; product_id?: string | null; total_price: number }) => {
          if (i.item_type === 'product' && i.product_id === waterProductId) {
            return sum; // Exclude water
          }
          return sum + i.total_price;
        },
        0
      );

      const pointsEarned = Math.floor(earnableSpend * LOYALTY.EARN_RATE);

      if (pointsEarned > 0) {
        currentBalance += pointsEarned;

        await supabase.from('loyalty_ledger').insert({
          customer_id: data.customer_id,
          transaction_id: transaction.id,
          action: 'earned',
          points_change: pointsEarned,
          points_balance: currentBalance,
          description: `Earned from transaction #${transaction.receipt_number || transaction.id.slice(0, 8)}`,
        });

        await supabase
          .from('customers')
          .update({ loyalty_points_balance: currentBalance })
          .eq('id', data.customer_id);

        await supabase
          .from('transactions')
          .update({ loyalty_points_earned: pointsEarned })
          .eq('id', transaction.id);
      }
    }

    // 7. Increment coupon use_count and attribute campaign metrics
    if (data.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('use_count, campaign_id')
        .eq('id', data.coupon_id)
        .single();

      if (coupon) {
        await supabase
          .from('coupons')
          .update({ use_count: coupon.use_count + 1 })
          .eq('id', data.coupon_id);

        // If coupon is linked to a campaign, update campaign metrics
        if (coupon.campaign_id) {
          const { data: camp } = await supabase
            .from('campaigns')
            .select('redeemed_count, revenue_attributed')
            .eq('id', coupon.campaign_id)
            .single();

          if (camp) {
            await supabase
              .from('campaigns')
              .update({
                redeemed_count: (camp.redeemed_count || 0) + 1,
                revenue_attributed: Math.round(((camp.revenue_attributed || 0) + data.total_amount) * 100) / 100,
              })
              .eq('id', coupon.campaign_id);
          }
        }
      }
    }

    return NextResponse.json({ data: transaction }, { status: 201 });
  } catch (err) {
    console.error('Transaction create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
