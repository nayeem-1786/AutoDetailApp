import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { requirePermission } from '@/lib/auth/require-permission';
import { refundCreateSchema } from '@/lib/utils/validation';
import Stripe from 'stripe';
import { logAudit, getRequestIp } from '@/lib/services/audit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const denied = await requirePermission(posEmployee.employee_id, 'pos.issue_refunds');
    if (denied) return denied;

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

    // Calculate total refund amount (items + tip)
    const itemsRefundAmount = data.items.reduce((sum, item) => sum + item.amount, 0);
    const tipRefund = data.tip_refund ?? 0;
    const totalRefundAmount = Math.round((itemsRefundAmount + tipRefund) * 100) / 100;

    if (totalRefundAmount <= 0) {
      return NextResponse.json(
        { error: 'Refund amount must be greater than zero' },
        { status: 400 }
      );
    }

    // Server-side cap: refund must not exceed actual amount paid minus already refunded
    const { data: existingRefunds } = await supabase
      .from('refunds')
      .select('amount')
      .eq('transaction_id', data.transaction_id)
      .eq('status', 'processed');
    const alreadyRefunded = (existingRefunds || []).reduce(
      (sum: number, r: { amount: number }) => sum + r.amount,
      0
    );
    const maxRefundable = (transaction.total_amount + (transaction.tip_amount || 0)) - alreadyRefunded;
    if (totalRefundAmount > maxRefundable + 0.01) {
      return NextResponse.json(
        { error: `Refund amount ($${totalRefundAmount.toFixed(2)}) exceeds maximum refundable ($${maxRefundable.toFixed(2)})` },
        { status: 400 }
      );
    }

    // 1. If payment was card, issue Stripe refund FIRST (before inserting records)
    const cardPayment = transaction.payments?.find(
      (p: { method: string }) => p.method === 'card'
    );
    let stripeRefundId: string | null = null;

    if (cardPayment?.stripe_payment_intent_id) {
      // Cap Stripe refund at card payment amount (rest was cash/check)
      const stripeRefundAmount = Math.min(totalRefundAmount, cardPayment.amount || 0);
      if (stripeRefundAmount > 0) {
        try {
          const stripeRefund = await stripe.refunds.create({
            payment_intent: cardPayment.stripe_payment_intent_id,
            amount: Math.round(stripeRefundAmount * 100),
          });
          stripeRefundId = stripeRefund.id;
        } catch (stripeErr) {
          console.error('Stripe refund error:', stripeErr);
          return NextResponse.json(
            { error: 'Stripe refund failed. No records created.' },
            { status: 500 }
          );
        }
      }
    }

    // 2. Insert refund record (only after Stripe succeeds or payment is cash/check)
    const { data: refund, error: refundError } = await supabase
      .from('refunds')
      .insert({
        transaction_id: data.transaction_id,
        status: 'processed',
        amount: totalRefundAmount,
        reason: data.reason,
        processed_by: posEmployee.employee_id,
        stripe_refund_id: stripeRefundId,
      })
      .select('*')
      .single();

    if (refundError || !refund) {
      console.error('Refund insert error:', refundError);
      return NextResponse.json(
        { error: 'Failed to create refund record' },
        { status: 500 }
      );
    }

    // 3. Insert refund items
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
    let clawbackPoints = 0;
    let restoredPoints = 0;

    if (transaction.customer_id && (transaction.loyalty_points_redeemed > 0 || transaction.loyalty_points_earned > 0)) {
      // Get current customer balance
      const { data: customer } = await supabase
        .from('customers')
        .select('loyalty_points_balance')
        .eq('id', transaction.customer_id)
        .single();

      if (customer) {
        let runningBalance = customer.loyalty_points_balance;
        const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
        const isFullRefund = totalRefundAmount >= txFullAmount;

        // 5a. Restore redeemed points
        if (transaction.loyalty_points_redeemed > 0) {
          restoredPoints = isFullRefund
            ? transaction.loyalty_points_redeemed
            : Math.floor(transaction.loyalty_points_redeemed * (totalRefundAmount / transaction.total_amount));

          if (restoredPoints > 0) {
            runningBalance = runningBalance + restoredPoints;

            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: restoredPoints,
              points_balance: runningBalance,
              description: `Refund: restored ${restoredPoints} redeemed pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        // 5b. Claw back earned points
        if (transaction.loyalty_points_earned > 0) {
          clawbackPoints = isFullRefund
            ? transaction.loyalty_points_earned
            : Math.floor(transaction.loyalty_points_earned * (totalRefundAmount / transaction.total_amount));

          if (clawbackPoints > 0) {
            runningBalance = Math.max(0, runningBalance - clawbackPoints);

            await supabase.from('loyalty_ledger').insert({
              customer_id: transaction.customer_id,
              transaction_id: transaction.id,
              action: 'adjusted',
              points_change: -clawbackPoints,
              points_balance: runningBalance,
              description: `Refund: reversed ${clawbackPoints} earned pts`,
              created_by: posEmployee.employee_id,
            });
          }
        }

        // Single customer balance update
        await supabase
          .from('customers')
          .update({ loyalty_points_balance: Math.max(0, runningBalance) })
          .eq('id', transaction.customer_id);
      }
    }

    // Store loyalty adjustments on the refund record
    if (clawbackPoints > 0 || restoredPoints > 0) {
      await supabase
        .from('refunds')
        .update({
          points_clawed_back: clawbackPoints,
          points_restored: restoredPoints,
        })
        .eq('id', refund.id);
    }

    // 6. Update transaction status
    const txFullAmount = transaction.total_amount + (transaction.tip_amount || 0);
    const newStatus = totalRefundAmount >= txFullAmount
      ? 'refunded'
      : 'partial_refund';

    await supabase
      .from('transactions')
      .update({ status: newStatus })
      .eq('id', transaction.id);

    logAudit({
      userId: posEmployee.auth_user_id,
      userEmail: posEmployee.email,
      employeeName: `${posEmployee.first_name} ${posEmployee.last_name}`,
      action: 'refund',
      entityType: 'transaction',
      entityId: data.transaction_id,
      entityLabel: `Refund $${totalRefundAmount.toFixed(2)}`,
      details: {
        amount: totalRefundAmount,
        reason: data.reason,
        item_count: data.items.length,
      },
      ipAddress: getRequestIp(request),
      source: 'pos',
    });

    return NextResponse.json({ data: refund }, { status: 201 });
  } catch (err) {
    console.error('Refund create route error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
