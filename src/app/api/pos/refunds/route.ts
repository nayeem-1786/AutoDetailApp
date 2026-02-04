import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { refundCreateSchema } from '@/lib/utils/validation';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const supabase = createAdminClient();

    const body = await request.json();
    const parsed = refundCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Fetch the transaction with payments
    const { data: transaction, error: txError } = await supabase
      .from('transactions')
      .select('*, payments(*)')
      .eq('id', data.transaction_id)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Verify transaction status allows refunds
    if (!['completed', 'partial_refund'].includes(transaction.status)) {
      return NextResponse.json(
        { error: 'Transaction cannot be refunded (status: ' + transaction.status + ')' },
        { status: 400 }
      );
    }

    // Calculate total refund amount
    const totalRefundAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

    if (totalRefundAmount <= 0) {
      return NextResponse.json(
        { error: 'Refund amount must be greater than zero' },
        { status: 400 }
      );
    }

    // 1. Insert refund record
    const { data: refund, error: refundError } = await supabase
      .from('refunds')
      .insert({
        transaction_id: data.transaction_id,
        status: 'processed',
        amount: totalRefundAmount,
        reason: data.reason,
        processed_by: posEmployee.employee_id,
      })
      .select('*')
      .single();

    if (refundError || !refund) {
      console.error('Refund insert error:', refundError);
      return NextResponse.json(
        { error: 'Failed to create refund' },
        { status: 500 }
      );
    }

    // 2. Insert refund items
    const refundItemRows = data.items.map((item) => ({
      refund_id: refund.id,
      transaction_item_id: item.transaction_item_id,
      quantity: item.quantity,
      amount: item.amount,
      restock: item.restock,
    }));

    const { error: refundItemsError } = await supabase
      .from('refund_items')
      .insert(refundItemRows);

    if (refundItemsError) {
      console.error('Refund items insert error:', refundItemsError);
    }

    // 3. If payment was card, issue Stripe refund
    const cardPayment = transaction.payments?.find(
      (p: { method: string }) => p.method === 'card'
    );

    if (cardPayment?.stripe_payment_intent_id) {
      try {
        const stripeRefund = await stripe.refunds.create({
          payment_intent: cardPayment.stripe_payment_intent_id,
          amount: Math.round(totalRefundAmount * 100),
        });

        // Update refund with stripe_refund_id
        await supabase
          .from('refunds')
          .update({ stripe_refund_id: stripeRefund.id })
          .eq('id', refund.id);

        refund.stripe_refund_id = stripeRefund.id;
      } catch (stripeErr) {
        console.error('Stripe refund error:', stripeErr);
        // Update refund status to failed if Stripe fails
        await supabase
          .from('refunds')
          .update({ status: 'failed' })
          .eq('id', refund.id);

        return NextResponse.json(
          { error: 'Stripe refund failed. Refund marked as failed.' },
          { status: 500 }
        );
      }
    }

    // 4. Restock products where applicable
    for (const item of data.items) {
      if (!item.restock) continue;

      // Fetch the transaction item to get product_id
      const { data: txItem } = await supabase
        .from('transaction_items')
        .select('product_id')
        .eq('id', item.transaction_item_id)
        .single();

      if (txItem?.product_id) {
        // Fetch current quantity and increment
        const { data: product } = await supabase
          .from('products')
          .select('quantity_on_hand')
          .eq('id', txItem.product_id)
          .single();

        if (product) {
          await supabase
            .from('products')
            .update({
              quantity_on_hand: product.quantity_on_hand + item.quantity,
            })
            .eq('id', txItem.product_id);
        }
      }
    }

    // 5. Adjust loyalty points if applicable
    if (transaction.customer_id && transaction.loyalty_points_earned > 0) {
      const proportionalPoints = Math.floor(
        transaction.loyalty_points_earned * (totalRefundAmount / transaction.total_amount)
      );

      if (proportionalPoints > 0) {
        // Get current customer balance
        const { data: customer } = await supabase
          .from('customers')
          .select('loyalty_points_balance')
          .eq('id', transaction.customer_id)
          .single();

        if (customer) {
          const newBalance = Math.max(0, customer.loyalty_points_balance - proportionalPoints);

          // Insert loyalty ledger entry
          await supabase.from('loyalty_ledger').insert({
            customer_id: transaction.customer_id,
            transaction_id: transaction.id,
            action: 'adjusted',
            points_change: -proportionalPoints,
            points_balance: newBalance,
            description: `Adjusted for refund of $${totalRefundAmount.toFixed(2)}`,
            created_by: posEmployee.employee_id,
          });

          // Update customer balance
          await supabase
            .from('customers')
            .update({ loyalty_points_balance: newBalance })
            .eq('id', transaction.customer_id);
        }
      }
    }

    // 6. Update transaction status
    const newStatus = totalRefundAmount >= transaction.total_amount
      ? 'refunded'
      : 'partial_refund';

    await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', transaction.id);

    return NextResponse.json({ data: refund }, { status: 201 });
  } catch (err) {
    console.error('Refund create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
