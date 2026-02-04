import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import Stripe from 'stripe';
import { LOYALTY, WATER_SKU } from '@/lib/utils/constants';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const { stripe_payment_intent_id, transaction_id, customer_id } = body;

    if (!stripe_payment_intent_id || !transaction_id) {
      return NextResponse.json(
        { error: 'stripe_payment_intent_id and transaction_id are required' },
        { status: 400 }
      );
    }

    // 1. Retrieve PaymentIntent with charge details
    const paymentIntent = await stripe.paymentIntents.retrieve(
      stripe_payment_intent_id,
      { expand: ['latest_charge'] }
    );

    const charge = paymentIntent.latest_charge;
    if (!charge || typeof charge === 'string') {
      return NextResponse.json(
        { error: 'No charge found on payment intent' },
        { status: 400 }
      );
    }

    const cardPresent = charge.payment_method_details?.card_present;
    if (!cardPresent?.fingerprint) {
      return NextResponse.json(
        { error: 'No card fingerprint available' },
        { status: 400 }
      );
    }

    const fingerprint = cardPresent.fingerprint;
    const brand = cardPresent.brand ?? null;
    const last4 = cardPresent.last4 ?? null;

    // 2. Update the payments row with card fingerprint for audit trail
    await supabase
      .from('payments')
      .update({
        card_fingerprint: fingerprint,
        card_brand: brand,
        card_last_four: last4,
      })
      .eq('transaction_id', transaction_id)
      .eq('stripe_payment_intent_id', stripe_payment_intent_id);

    // 3. Handle card-to-customer mapping
    if (customer_id) {
      // Customer on ticket — save mapping only if this card is new (never overwrite)
      await supabase
        .from('customer_payment_methods')
        .upsert(
          {
            customer_id,
            card_fingerprint: fingerprint,
            card_brand: brand,
            card_last_four: last4,
          },
          { onConflict: 'card_fingerprint', ignoreDuplicates: true }
        );

      return NextResponse.json({
        card_fingerprint: fingerprint,
        card_brand: brand,
        card_last_four: last4,
      });
    }

    // 4. No customer on ticket — look up by fingerprint
    const { data: mapping } = await supabase
      .from('customer_payment_methods')
      .select('customer_id')
      .eq('card_fingerprint', fingerprint)
      .maybeSingle();

    if (!mapping) {
      // Unknown card, no match
      return NextResponse.json({
        card_fingerprint: fingerprint,
        card_brand: brand,
        card_last_four: last4,
      });
    }

    // 5. Match found — attach customer to transaction
    const matchedCustomerId = mapping.customer_id;

    await supabase
      .from('transactions')
      .update({ customer_id: matchedCustomerId })
      .eq('id', transaction_id);

    // 6. Update customer visit stats
    const { data: cust } = await supabase
      .from('customers')
      .select('id, first_name, last_name, email, phone, visit_count, lifetime_spend, loyalty_points_balance')
      .eq('id', matchedCustomerId)
      .single();

    if (cust) {
      // Get the transaction total for stats
      const { data: tx } = await supabase
        .from('transactions')
        .select('total_amount, receipt_number, id')
        .eq('id', transaction_id)
        .single();

      const totalAmount = tx?.total_amount ?? 0;

      await supabase
        .from('customers')
        .update({
          visit_count: cust.visit_count + 1,
          lifetime_spend: Math.round((cust.lifetime_spend + totalAmount) * 100) / 100,
          last_visit_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', matchedCustomerId);

      // 7. Loyalty points earn
      // Get transaction items for earnable spend calculation
      const { data: txItems } = await supabase
        .from('transaction_items')
        .select('item_type, product_id, total_price')
        .eq('transaction_id', transaction_id);

      if (txItems && txItems.length > 0) {
        const { data: waterProduct } = await supabase
          .from('products')
          .select('id')
          .eq('sku', WATER_SKU)
          .maybeSingle();

        const waterProductId = waterProduct?.id ?? null;

        const earnableSpend = txItems.reduce((sum, item) => {
          if (item.item_type === 'product' && item.product_id === waterProductId) {
            return sum;
          }
          return sum + item.total_price;
        }, 0);

        const pointsEarned = Math.floor(earnableSpend * LOYALTY.EARN_RATE);

        if (pointsEarned > 0) {
          const newBalance = cust.loyalty_points_balance + pointsEarned;

          await supabase.from('loyalty_ledger').insert({
            customer_id: matchedCustomerId,
            transaction_id,
            action: 'earned',
            points_change: pointsEarned,
            points_balance: newBalance,
            description: `Earned from auto-matched transaction #${tx?.receipt_number || transaction_id.slice(0, 8)}`,
          });

          await supabase
            .from('customers')
            .update({ loyalty_points_balance: newBalance })
            .eq('id', matchedCustomerId);

          await supabase
            .from('transactions')
            .update({ loyalty_points_earned: pointsEarned })
            .eq('id', transaction_id);
        }
      }

      return NextResponse.json({
        card_fingerprint: fingerprint,
        card_brand: brand,
        card_last_four: last4,
        matched_customer: {
          id: cust.id,
          first_name: cust.first_name,
          last_name: cust.last_name,
          email: cust.email,
          phone: cust.phone,
        },
      });
    }

    return NextResponse.json({
      card_fingerprint: fingerprint,
      card_brand: brand,
      card_last_four: last4,
    });
  } catch (err) {
    console.error('Card-customer matching error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
