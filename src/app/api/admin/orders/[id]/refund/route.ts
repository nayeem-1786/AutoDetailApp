import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getEmployeeFromSession } from '@/lib/auth/get-employee';
import { requirePermission } from '@/lib/auth/require-permission';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendRefundEmail } from '@/lib/utils/order-emails';
import { logAudit, getRequestIp } from '@/lib/services/audit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const employee = await getEmployeeFromSession();
    if (!employee) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const denied = await requirePermission(employee.id, 'orders.manage');
    if (denied) return denied;

    const { id } = await params;
    const body = await request.json();
    const admin = createAdminClient();

    // Fetch order
    const { data: order, error: fetchError } = await admin
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .single();

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!order.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No payment intent found for this order' }, { status: 400 });
    }

    if (order.payment_status === 'refunded') {
      return NextResponse.json({ error: 'Order has already been fully refunded' }, { status: 400 });
    }

    // Determine refund amount (body.amount is in cents, omit for full refund)
    const refundAmount = body.amount ? Math.min(body.amount, order.total) : order.total;
    const isFullRefund = refundAmount >= order.total;

    // Process refund through Stripe
    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: order.stripe_payment_intent_id,
      reason: 'requested_by_customer',
    };
    if (!isFullRefund) {
      refundParams.amount = refundAmount;
    }

    const refund = await stripe.refunds.create(refundParams);

    // Update order payment status
    const newPaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded';
    await admin
      .from('orders')
      .update({ payment_status: newPaymentStatus })
      .eq('id', id);

    // Insert order event
    await admin.from('order_events').insert({
      order_id: id,
      event_type: isFullRefund ? 'refunded' : 'partially_refunded',
      description: `${isFullRefund ? 'Full' : 'Partial'} refund of $${(refundAmount / 100).toFixed(2)} processed${body.reason ? `: ${body.reason}` : ''}`,
      metadata: {
        refund_id: refund.id,
        amount: refundAmount,
        reason: body.reason || null,
      },
      created_by: employee.id,
    });

    // Restore stock for each order item
    const items = order.order_items || [];
    for (const item of items) {
      if (item.product_id) {
        const { data: product } = await admin
          .from('products')
          .select('quantity_on_hand')
          .eq('id', item.product_id)
          .single();
        if (product) {
          await admin
            .from('products')
            .update({ quantity_on_hand: product.quantity_on_hand + item.quantity })
            .eq('id', item.product_id);
        }
      }
    }

    // Fire-and-forget refund email
    sendRefundEmail(order, refundAmount).catch((err) =>
      console.error('[refund email] Error:', err)
    );

    logAudit({
      userId: employee.auth_user_id,
      userEmail: employee.email,
      employeeName: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || null,
      action: 'refund',
      entityType: 'order',
      entityId: id,
      entityLabel: `Order #${id.slice(0, 8)}`,
      details: {
        refund_id: refund.id,
        amount: refundAmount,
        is_full_refund: isFullRefund,
        reason: body.reason || null,
        payment_status: newPaymentStatus,
      },
      ipAddress: getRequestIp(request),
      source: 'admin',
    });

    return NextResponse.json({
      success: true,
      refund_id: refund.id,
      amount: refundAmount,
      payment_status: newPaymentStatus,
    });
  } catch (err) {
    console.error('[admin/orders/[id]/refund] Error:', err);
    const message = err instanceof Stripe.errors.StripeError
      ? err.message
      : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
