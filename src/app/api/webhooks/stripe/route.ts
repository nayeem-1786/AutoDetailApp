import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateOrderNumber } from '@/lib/utils/order-number';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';
import { SYSTEM_EMPLOYEE_ID } from '@/lib/utils/system-actors';
import { toCents, fromCents } from '@/lib/utils/refund-math';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const admin = createAdminClient();

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata.order_id;

      if (!orderId) {
        // Not an order payment intent — check if it's a booking deposit
        const isDeposit = pi.metadata.is_deposit === 'true';
        if (isDeposit) {
          const { data: appt } = await admin
            .from('appointments')
            .select('id, payment_status')
            .eq('stripe_payment_intent_id', pi.id)
            .maybeSingle();

          if (appt) {
            console.log(`[Stripe Webhook] Booking deposit confirmed for appointment ${appt.id} (PI: ${pi.id})`);
          } else {
            console.log(`[Stripe Webhook] Booking deposit received but no appointment found yet (PI: ${pi.id}). Transaction created by booking route.`);
          }
        }

        // Appointment payment-link branch.
        // Triggered when a customer pays the public /pay/[token] page (Session 2).
        // Webhook is the SOLE writer of payment + transaction state for this flow,
        // so idempotency under Stripe retries is required.
        if (pi.metadata.type === 'appointment_payment_link') {
          const apptIdFromMeta = pi.metadata.appointment_id;

          if (!apptIdFromMeta || !UUID_REGEX.test(apptIdFromMeta)) {
            console.error(
              `[Stripe Webhook] pay_link missing/invalid appointment_id in metadata (PI: ${pi.id}, value: ${apptIdFromMeta ?? 'null'})`
            );
            break;
          }

          try {
            const { data: appt, error: apptErr } = await admin
              .from('appointments')
              .select('id, customer_id, vehicle_id, total_amount, payment_status, payment_link_paid_at, stripe_payment_intent_id')
              .eq('id', apptIdFromMeta)
              .maybeSingle();

            if (apptErr) {
              throw new Error(`appointment lookup failed: ${apptErr.message}`);
            }
            if (!appt) {
              throw new Error(`appointment ${apptIdFromMeta} not found`);
            }

            // Idempotency: per-PI uniqueness, not per-appointment. Each Stripe
            // PaymentIntent ID is unique, and the pay-link branch is the sole
            // writer of the payments row carrying it. Multi-link flows
            // (Pay-Link Session 5: $X deposit now, $Y on completion) issue
            // distinct PIs against the same appointment — the old guard
            // (`payment_link_paid_at IS NOT NULL`) silently dropped the second
            // and later events. Lookup by PI sidesteps that and still protects
            // against Stripe retries of the same event.
            const { data: existingPaymentForPi, error: existingPayErr } =
              await admin
                .from('payments')
                .select('id')
                .eq('stripe_payment_intent_id', pi.id)
                .maybeSingle();
            if (existingPayErr) {
              throw new Error(
                `existing-payment lookup failed: ${existingPayErr.message}`
              );
            }
            if (existingPaymentForPi) {
              console.log(
                `[Stripe Webhook] pi_already_processed (appointment: ${appt.id}, PI: ${pi.id}, payment_id: ${existingPaymentForPi.id})`
              );
              break;
            }

            // Amount math: integer cents end-to-end via refund-math helpers.
            // pi.amount_received is already integer cents.
            const totalCents = toCents(Number(appt.total_amount));

            // Sum existing payments rows for this appointment to compute remaining balance.
            const { data: existingTxs, error: txsErr } = await admin
              .from('transactions')
              .select('id')
              .eq('appointment_id', appt.id);
            if (txsErr) {
              throw new Error(`existing-transactions lookup failed: ${txsErr.message}`);
            }

            const txIds = (existingTxs ?? []).map((t) => t.id);
            let paidSoFarCents = 0;
            if (txIds.length > 0) {
              const { data: existingPays, error: paysErr } = await admin
                .from('payments')
                .select('amount')
                .in('transaction_id', txIds);
              if (paysErr) {
                throw new Error(`existing-payments lookup failed: ${paysErr.message}`);
              }
              paidSoFarCents = (existingPays ?? []).reduce(
                (sum, p) => sum + toCents(Number(p.amount)),
                0
              );
            }

            const remainingCents = Math.max(0, totalCents - paidSoFarCents);
            const amountReceivedCents = pi.amount_received ?? pi.amount;
            const newPaymentStatus = amountReceivedCents >= remainingCents ? 'paid' : 'partial';
            const amountReceivedDollars = fromCents(amountReceivedCents);

            // Mirror booking-deposit transaction shape (book/route.ts:381).
            // Webhook context has no employee actor → employee_id null.
            const { data: tx, error: txErr } = await admin
              .from('transactions')
              .insert({
                appointment_id: appt.id,
                customer_id: appt.customer_id,
                vehicle_id: appt.vehicle_id,
                employee_id: null,
                status: 'completed',
                subtotal: Number(appt.total_amount),
                tax_amount: 0,
                tip_amount: 0,
                discount_amount: 0,
                total_amount: amountReceivedDollars,
                payment_method: 'card',
                notes: `Online payment link. PI: ${pi.id}.`,
                transaction_date: new Date().toISOString(),
              })
              .select('id')
              .single();

            if (txErr || !tx) {
              throw new Error(`transaction insert failed: ${txErr?.message ?? 'no row'}`);
            }

            // Mirror booking-deposit payments shape (book/route.ts:459).
            const { error: payErr } = await admin
              .from('payments')
              .insert({
                transaction_id: tx.id,
                method: 'card',
                amount: amountReceivedDollars,
                tip_amount: 0,
                tip_net: 0,
                stripe_payment_intent_id: pi.id,
              });

            if (payErr) {
              throw new Error(`payment insert failed: ${payErr.message}`);
            }

            // Update appointment. Only write stripe_payment_intent_id if currently NULL
            // so we don't overwrite a deposit PI from the booking flow.
            //
            // Clear payment_link_amount_cents — the link this PI was for is
            // now consumed. NULL signals "no link is currently active." A
            // follow-up send (e.g. final-balance link after a deposit link)
            // sets the column again on send. The send route also clears
            // payment_link_paid_at so that field is "is the *current* link
            // paid", not historical.
            const apptUpdate: Record<string, unknown> = {
              payment_link_paid_at: new Date().toISOString(),
              payment_link_amount_cents: null,
              payment_status: newPaymentStatus,
            };
            if (appt.stripe_payment_intent_id === null) {
              apptUpdate.stripe_payment_intent_id = pi.id;
            }

            const { error: apptUpdErr } = await admin
              .from('appointments')
              .update(apptUpdate)
              .eq('id', appt.id);

            if (apptUpdErr) {
              throw new Error(`appointment update failed: ${apptUpdErr.message}`);
            }

            // TODO(payment-link-session-3): send payment_link_paid notification

            console.log(
              `[Stripe Webhook] pay_link_processed (appointment: ${appt.id}, PI: ${pi.id}, amount: $${amountReceivedDollars.toFixed(2)}, status: ${newPaymentStatus})`
            );
          } catch (err) {
            console.error('[Stripe Webhook] pay_link processing failed', {
              payment_intent_id: pi.id,
              appointment_id: apptIdFromMeta,
              error: err instanceof Error ? err.message : String(err),
            });
            throw err; // rethrow → 500 → Stripe retries the webhook
          }
        }

        break;
      }

      // 1. Generate permanent order number
      const orderNumber = await generateOrderNumber(admin);

      // 2. Update order: assign number + mark paid
      await admin
        .from('orders')
        .update({
          order_number: orderNumber,
          payment_status: 'paid',
          paid_at: new Date().toISOString(),
          stripe_charge_id: pi.latest_charge as string | null,
        })
        .eq('id', orderId);

      // 3. Fetch order + items for stock decrement and email
      const { data: order } = await admin
        .from('orders')
        .select('*, order_items:order_items(*)')
        .eq('id', orderId)
        .single();

      if (!order) break;

      // 4. Decrement stock for each item + write audit row.
      // created_by uses the seeded SYSTEM_EMPLOYEE_ID (see system-actors.ts)
      // because webhooks have no authenticated user context.
      const orderItems = (order as { order_items: Array<{ product_id: string; quantity: number }> }).order_items;
      for (const item of orderItems) {
        if (item.product_id) {
          const { data: prod } = await admin
            .from('products')
            .select('quantity_on_hand, cost_price')
            .eq('id', item.product_id)
            .single();

          if (prod) {
            const before = prod.quantity_on_hand;
            const after = Math.max(0, before - item.quantity);
            await admin
              .from('products')
              .update({ quantity_on_hand: after })
              .eq('id', item.product_id);

            await logStockAdjustment({
              supabase: admin,
              product_id: item.product_id,
              adjustment_type: 'sold',
              quantity_change: after - before,
              quantity_before: before,
              quantity_after: after,
              reason: 'Online order paid',
              reference_id: orderId,
              reference_type: 'order',
              created_by: SYSTEM_EMPLOYEE_ID,
              unit_cost: prod.cost_price ?? null,
            });
          }
        }
      }

      // 5. Increment coupon usage
      if (order.coupon_id) {
        const { data: coupon } = await admin
          .from('coupons')
          .select('use_count')
          .eq('id', order.coupon_id)
          .single();

        if (coupon) {
          await admin
            .from('coupons')
            .update({ use_count: coupon.use_count + 1 })
            .eq('id', order.coupon_id);
        }
      }

      // 6. Update customer lifetime spend
      if (order.customer_id) {
        const { data: customer } = await admin
          .from('customers')
          .select('lifetime_spend, visit_count')
          .eq('id', order.customer_id)
          .single();

        if (customer) {
          await admin
            .from('customers')
            .update({
              lifetime_spend:
                (customer.lifetime_spend || 0) + order.total / 100,
              visit_count: (customer.visit_count || 0) + 1,
            })
            .eq('id', order.customer_id);
        }
      }

      // 7. Send confirmation email (fire-and-forget)
      sendOrderConfirmationEmail(order).catch((err) =>
        console.error('Order confirmation email failed:', err)
      );

      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata.order_id;

      if (orderId) {
        await admin
          .from('orders')
          .update({ payment_status: 'failed' })
          .eq('id', orderId);
      }
      break;
    }

    case 'payment_intent.canceled': {
      const pi = event.data.object as Stripe.PaymentIntent;
      const orderId = pi.metadata.order_id;

      if (orderId) {
        await admin
          .from('orders')
          .update({ payment_status: 'cancelled' })
          .eq('id', orderId);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Order confirmation email
// ---------------------------------------------------------------------------

interface OrderWithItems {
  order_number: string;
  email: string;
  first_name: string;
  last_name: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  shipping_amount: number;
  total: number;
  coupon_code: string | null;
  fulfillment_method: string;
  order_items: Array<{
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

async function sendOrderConfirmationEmail(order: OrderWithItems) {
  const businessInfo = await getBusinessInfo();

  const itemRows = order.order_items
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;">${item.product_name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;text-align:center;">${item.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;text-align:right;">${formatCurrency(item.unit_price / 100)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #333;color:#D1D5DB;text-align:right;">${formatCurrency(item.line_total / 100)}</td>
        </tr>`
    )
    .join('');

  const discountRow =
    order.discount_amount > 0
      ? `<tr>
          <td colspan="3" style="padding:4px 12px;color:#9CA3AF;text-align:right;">Discount${order.coupon_code ? ` (${order.coupon_code})` : ''}</td>
          <td style="padding:4px 12px;color:#CCFF00;text-align:right;">-${formatCurrency(order.discount_amount / 100)}</td>
        </tr>`
      : '';

  const fulfillmentText =
    order.fulfillment_method === 'pickup'
      ? `<p style="color:#D1D5DB;">Your order will be available for <strong style="color:#CCFF00;">local pickup</strong> at our location. We'll notify you when it's ready.</p>`
      : `<p style="color:#D1D5DB;">Your order will be shipped to the address provided. You'll receive tracking information once it ships.</p>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0A0A0A;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <!-- Header -->
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;">
      <div style="font-size:48px;margin-bottom:12px;">&#10003;</div>
      <h1 style="color:#FFFFFF;font-size:24px;margin:0 0 8px;">Order Confirmed</h1>
      <p style="color:#CCFF00;font-size:18px;font-weight:bold;margin:0;">Order ${order.order_number}</p>
    </div>

    <!-- Greeting -->
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
      <p style="color:#FFFFFF;margin:0 0 12px;">Hi ${order.first_name},</p>
      <p style="color:#D1D5DB;margin:0;">Thank you for your order! Here's a summary of your purchase.</p>
    </div>

    <!-- Items -->
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#FFFFFF;font-size:16px;margin:0 0 16px;">Order Details</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:left;font-size:12px;text-transform:uppercase;">Item</th>
            <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:center;font-size:12px;text-transform:uppercase;">Qty</th>
            <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:right;font-size:12px;text-transform:uppercase;">Price</th>
            <th style="padding:8px 12px;border-bottom:1px solid #555;color:#9CA3AF;text-align:right;font-size:12px;text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:4px 12px;color:#9CA3AF;text-align:right;">Subtotal</td>
            <td style="padding:4px 12px;color:#D1D5DB;text-align:right;">${formatCurrency(order.subtotal / 100)}</td>
          </tr>
          ${discountRow}
          <tr>
            <td colspan="3" style="padding:4px 12px;color:#9CA3AF;text-align:right;">Tax</td>
            <td style="padding:4px 12px;color:#D1D5DB;text-align:right;">${formatCurrency(order.tax_amount / 100)}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:8px 12px;border-top:1px solid #555;color:#FFFFFF;text-align:right;font-weight:bold;">Total</td>
            <td style="padding:8px 12px;border-top:1px solid #555;color:#CCFF00;text-align:right;font-weight:bold;font-size:18px;">${formatCurrency(order.total / 100)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Fulfillment -->
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:24px;margin-bottom:24px;">
      <h2 style="color:#FFFFFF;font-size:16px;margin:0 0 12px;">Pickup / Delivery</h2>
      ${fulfillmentText}
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:24px;">
      <p style="color:#6B7280;font-size:12px;margin:0;">
        ${businessInfo.name}<br>
        ${businessInfo.phone}<br>
        ${businessInfo.email}
      </p>
    </div>
  </div>
</body>
</html>`;

  const plainText = `Order Confirmed - ${order.order_number}

Hi ${order.first_name},

Thank you for your order! Here's a summary:

${order.order_items.map((i) => `- ${i.product_name} x${i.quantity} - ${formatCurrency(i.line_total / 100)}`).join('\n')}

Subtotal: ${formatCurrency(order.subtotal / 100)}
${order.discount_amount > 0 ? `Discount: -${formatCurrency(order.discount_amount / 100)}\n` : ''}Tax: ${formatCurrency(order.tax_amount / 100)}
Total: ${formatCurrency(order.total / 100)}

${order.fulfillment_method === 'pickup' ? 'Your order will be available for local pickup. We\'ll notify you when it\'s ready.' : 'Your order will be shipped. You\'ll receive tracking information once it ships.'}

— ${businessInfo.name}`;

  await sendEmail(
    order.email,
    `Order Confirmed — ${order.order_number} | ${businessInfo.name}`,
    plainText,
    html
  );
}
