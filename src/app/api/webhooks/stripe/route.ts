import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateOrderNumber } from '@/lib/utils/order-number';
import { generateReceiptNumber } from '@/lib/utils/receipt-number';
import { sendEmail } from '@/lib/utils/email';
import { getBusinessInfo } from '@/lib/data/business';
import { formatCurrency } from '@/lib/utils/format';
import { logStockAdjustment } from '@/lib/utils/stock-adjustments';
import { SYSTEM_EMPLOYEE_ID } from '@/lib/utils/system-actors';
import { toCents, fromCents } from '@/lib/utils/money';
import { CC_FEE_RATE } from '@/lib/utils/constants';
import { extractCardDetailsFromCharge } from '@/lib/utils/stripe-card-details';
import { logAudit } from '@/lib/services/audit';
import type { SupabaseClient } from '@supabase/supabase-js';

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
            // Phase 3 Theme B.1 (AC-11): also fetch `status` so we can flip
            // pending → confirmed below when payment is received. The flip is
            // gated server-side via `.eq('status', 'pending')` (race-safe;
            // operator manual-confirm wins concurrently), and the captured
            // `status` is used to decide whether to fire downstream cascades
            // (audit + `appointment_confirmed` outbound webhook).
            const { data: appt, error: apptErr } = await admin
              .from('appointments')
              .select('id, customer_id, vehicle_id, total_amount, payment_status, payment_link_paid_at, stripe_payment_intent_id, status')
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

            // Item 2 (2026-06-20) — tip extraction from PI metadata. The
            // customer pay form (`pay-form.tsx`) lets the customer pick a
            // tip on full-payment links; intent route stamps it into
            // `metadata.tip_cents` (string per Stripe metadata contract)
            // alongside the inflated PI amount (`subtotal + tip`). The
            // webhook is the sole writer of the resulting transactions /
            // payments rows, so tip persistence happens here.
            //
            // Defaults to 0 when the metadata field is missing (PIs created
            // before Item 2 shipped, or non-tip flows like the booking
            // deposit branch which routes through a different metadata
            // shape and never reaches here with tip_cents set). The
            // `Number('') || 0 = 0` shape is forward-compatible by default.
            //
            // Subtotal is derived by subtracting tip from the actual
            // amount received (Stripe's source of truth). `Math.max(0, ...)`
            // is a defensive floor in case metadata.tip_cents is corrupted
            // to a value larger than amount_received — we'd rather log $0
            // subtotal + the full charge as tip than write negative money.
            const rawTipMeta = pi.metadata?.tip_cents;
            const parsedTipCents = rawTipMeta != null ? Number(rawTipMeta) : 0;
            const tipCents = Number.isFinite(parsedTipCents) && parsedTipCents > 0
              ? Math.floor(parsedTipCents)
              : 0;
            const cappedTipCents = Math.min(tipCents, amountReceivedCents);
            if (cappedTipCents !== tipCents) {
              console.warn(
                `[Stripe Webhook] pay_link tip_cents (${tipCents}) > amount_received (${amountReceivedCents}); capping (PI: ${pi.id})`
              );
            }
            const subtotalCents = Math.max(0, amountReceivedCents - cappedTipCents);

            // payment_status compare is against subtotal (the service-portion
            // remaining), NOT amount_received — tip never reduces what's
            // outstanding on the appointment. Customer paying $100 service
            // + $20 tip on a $100 appointment should land payment_status=paid,
            // not "over-paid".
            const newPaymentStatus = subtotalCents >= remainingCents ? 'paid' : 'partial';
            const amountReceivedDollars = fromCents(amountReceivedCents);
            const tipDollars = fromCents(cappedTipCents);
            const subtotalDollars = fromCents(subtotalCents);

            // Mirror booking-deposit transaction shape (book/route.ts:381).
            // Webhook context has no employee actor → employee_id null.
            //
            // Phase 3 Theme A (AC-10 v1.4): receipt_number generated via
            // next_identifier('receipt') (no longer auto-supplied by trigger).
            //
            // Item 2: `tip_amount` carries the tip portion; `total_amount`
            // is still what was charged this txn (subtotal + tip), matching
            // POS convention at `/api/pos/transactions/route.ts:184-207`.
            const payLinkReceiptNumber = await generateReceiptNumber(admin);
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
                tip_amount: tipDollars,
                discount_amount: 0,
                total_amount: amountReceivedDollars,
                payment_method: 'card',
                notes: `Online payment link. PI: ${pi.id}.`,
                transaction_date: new Date().toISOString(),
                receipt_number: payLinkReceiptNumber,
              })
              .select('id')
              .single();

            if (txErr || !tx) {
              throw new Error(`transaction insert failed: ${txErr?.message ?? 'no row'}`);
            }

            // Phase 1A.5 Part B: extract card brand + last4 from the Stripe
            // Charge so receipts render "Visa ****1074" instead of generic
            // "Card". Going-forward only — historical pay-link rows remain
            // null per LOCKED-B1. Helper returns nulls on any failure
            // (missing latest_charge, non-card method, Stripe API error) so
            // webhook processing never blocks on enrichment.
            const cardDetails = await extractCardDetailsFromCharge(
              stripe,
              pi.latest_charge as string | null,
              `pay_link PI ${pi.id}`
            );

            // Item 2: payments.amount = subtotal portion (POS convention at
            // `/api/pos/transactions/route.ts:381-388`); tip_amount carries
            // tip; tip_net is tip after 5% CC fee deduction for card method.
            // Historical pay-link rows had tip_amount=0 so amount==subtotal
            // trivially — no data migration needed, going-forward only.
            const tipNetDollars = tipDollars > 0
              ? Math.round(tipDollars * (1 - CC_FEE_RATE) * 100) / 100
              : 0;
            const { error: payErr } = await admin
              .from('payments')
              .insert({
                transaction_id: tx.id,
                method: 'card',
                amount: subtotalDollars,
                tip_amount: tipDollars,
                tip_net: tipNetDollars,
                stripe_payment_intent_id: pi.id,
                card_brand: cardDetails.card_brand,
                card_last_four: cardDetails.card_last_four,
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

            // Phase 3 Theme B.1 (AC-11): flip appointments.status from
            // pending → confirmed on payment receipt. The lifecycle commitment
            // (QUOTE_TO_POS_LIFECYCLE_ARCHITECTURE.md AC-11) defines
            // `confirmed = deposit OR full payment received` — so any
            // successful payment_intent.succeeded on the pay-link branch is a
            // sufficient signal (not gated on full-payment-only).
            //
            // Race protection: the UPDATE filter `.eq('status', 'pending')`
            // guarantees we never overwrite an operator-confirmed (or any
            // other) status. Concurrent operator manual-flips win → this is a
            // no-op. Idempotency is also free: this block is INSIDE the
            // per-PI dedup guard at :96-112 — Stripe retries of the same
            // event short-circuit before reaching here, so the audit fires
            // exactly once per real payment.
            //
            // Theme G — outbound `appointment_confirmed` n8n webhook removed
            // alongside the three sibling sites (admin PATCH, POS PATCH,
            // convertQuote). Smart Details has no n8n receiver wired (audit
            // f5e714a8); audit_log is the canonical state-change record.
            if (appt.status === 'pending') {
              const { error: statusErr } = await admin
                .from('appointments')
                .update({ status: 'confirmed' })
                .eq('id', appt.id)
                .eq('status', 'pending');

              if (statusErr) {
                throw new Error(
                  `appointment status flip failed: ${statusErr.message}`
                );
              }

              // Fire-and-forget audit (never throws).
              logAudit({
                action: 'update',
                entityType: 'booking',
                entityId: appt.id,
                entityLabel: `Appointment ${appt.id.slice(0, 8)}`,
                details: {
                  trigger: 'webhook_payment_link',
                  stripe_payment_intent_id: pi.id,
                  previous_status: 'pending',
                  new_status: 'confirmed',
                },
                source: 'api',
              });
            }

            // TODO(payment-link-session-3): send payment_link_paid notification

            console.log(
              `[Stripe Webhook] pay_link_processed (appointment: ${appt.id}, PI: ${pi.id}, amount: $${amountReceivedDollars.toFixed(2)}${cappedTipCents > 0 ? ` [subtotal $${subtotalDollars.toFixed(2)} + tip $${tipDollars.toFixed(2)}]` : ''}, status: ${newPaymentStatus}${appt.status === 'pending' ? ', appointment_status: pending→confirmed' : ''})`
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
              // TODO Unify-D: when Family D migrates products.cost_price to
              // cents, remove toCents() and use prod.cost_price_cents
              // directly. See docs/sessions/money-unify-0-migration-
              // playbook-v2.md §Family D.
              unit_cost_cents:
                prod.cost_price != null ? toCents(prod.cost_price) : null,
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

    // Phase 3 Theme D.3 (Phase 3.0.2 audit F.4) — reconcile refunds initiated
    // outside the cancel-orchestration layer. Stripe dashboard refunds, manual
    // refunds via the Stripe API, and dispute-resolution refunds all fire
    // `charge.refunded` but never touch Smart Details otherwise; without this
    // listener the customer's bank statement shows the refund while the
    // appointment + transaction still read "paid in full." This branch closes
    // the loop by inserting a `refunds` row that mirrors the orchestrator's
    // shape and bumping the source transaction status. Idempotent at the
    // `stripe_refund_id` lookup (per Refund, not per Charge — a charge can
    // accumulate multiple refunds over its lifetime). NEVER changes the
    // appointment's `status` — refund alone is not a cancel signal; the
    // operator's explicit cancel action remains the only path that flips
    // appointment.status='cancelled'.
    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      await handleChargeRefunded(admin, charge);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// ---------------------------------------------------------------------------
// Phase 3 Theme D.3 — charge.refunded reconciliation handler.
// ---------------------------------------------------------------------------

async function handleChargeRefunded(
  admin: SupabaseClient,
  charge: Stripe.Charge
): Promise<void> {
  // Stripe's `charge.refunded` event fires whenever a Refund is created on a
  // Charge. `charge.refunds.data` is the full list of Refund objects for this
  // Charge ordered most-recent-first; we record EACH unrecorded refund. If
  // the orchestrator (D.1) or a prior webhook fire already recorded a refund,
  // its `stripe_refund_id` is in the DB and we skip it — true per-refund
  // idempotency rather than per-event.
  const refunds = charge.refunds?.data ?? [];
  if (refunds.length === 0) {
    console.warn(
      `[Stripe Webhook] charge.refunded with empty refunds array (charge: ${charge.id})`
    );
    return;
  }

  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id ?? null;
  if (!paymentIntentId) {
    console.warn(
      `[Stripe Webhook] charge.refunded with no payment_intent (charge: ${charge.id})`
    );
    return;
  }

  // Source transaction lookup is per-Charge (constant across all refunds in
  // the array). Done once before the per-refund loop. We accept any status
  // except `voided` so partially-refunded → full-refund transitions still
  // reconcile correctly.
  const { data: sourceTx, error: txErr } = await admin
    .from('transactions')
    .select('id, appointment_id, customer_id, total_amount, tip_amount, status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle();

  if (txErr) {
    console.error(
      `[Stripe Webhook] charge.refunded transaction lookup failed (PI: ${paymentIntentId}): ${txErr.message}`
    );
    throw new Error(`transaction lookup failed: ${txErr.message}`);
  }

  if (!sourceTx) {
    // Refund for a Stripe payment that doesn't link to any Smart Details
    // transaction. Could be from a different system sharing the Stripe
    // account, or a refund on an order whose Charge ID rather than PI ID is
    // what we store. Log and skip — not a Smart Details event.
    console.log(
      `[Stripe Webhook] charge.refunded for unknown PI ${paymentIntentId}; skipping (charge: ${charge.id})`
    );
    return;
  }

  for (const refund of refunds) {
    // Per-refund idempotency: skip if this exact Refund id already has a
    // refunds row (either from D.1's orchestrator or a prior webhook fire).
    const { data: existing, error: existingErr } = await admin
      .from('refunds')
      .select('id')
      .eq('stripe_refund_id', refund.id)
      .maybeSingle();

    if (existingErr) {
      console.error(
        `[Stripe Webhook] existing-refund lookup failed (refund: ${refund.id}): ${existingErr.message}`
      );
      throw new Error(`existing-refund lookup failed: ${existingErr.message}`);
    }
    if (existing) {
      console.log(
        `[Stripe Webhook] charge.refunded already recorded for refund ${refund.id}; skipping`
      );
      continue;
    }

    // Insert the refunds row. Mirrors pos/refunds/route.ts:461-473 and
    // cancel-orchestration.ts:378-394. `processed_by` is NULL — webhook has
    // no employee actor; audit log carries the trigger context. `amount` is
    // dollars per the existing column type (Money-Unify migration of the
    // refunds.amount column is a future Family C/D task).
    const { error: insertErr } = await admin.from('refunds').insert({
      transaction_id: sourceTx.id,
      status: 'processed',
      amount: fromCents(refund.amount),
      reason: refund.reason ?? 'Stripe dashboard / external refund',
      processed_by: null,
      stripe_refund_id: refund.id,
      notes: JSON.stringify({
        source: 'stripe_webhook_charge_refunded',
        charge_id: charge.id,
        refund_amount_cents: refund.amount,
      }),
    });

    if (insertErr) {
      console.error(
        `[Stripe Webhook] refunds insert failed (refund: ${refund.id}): ${insertErr.message}`
      );
      throw new Error(`refunds insert failed: ${insertErr.message}`);
    }

    // Bump source transaction status. Mirrors pos/refunds/route.ts:644-678
    // and cancel-orchestration.ts:440-450 — full vs partial decision uses the
    // source's max refundable (total + tip). On a multi-refund Charge where
    // earlier partial refunds already moved the transaction to
    // `partial_refund`, the final full refund correctly transitions it to
    // `refunded`.
    const sourceMaxRefundableCents = toCents(
      Number(sourceTx.total_amount) + Number(sourceTx.tip_amount ?? 0)
    );
    const cumulativeRefundedCents = charge.amount_refunded;
    const sourceNewStatus =
      cumulativeRefundedCents >= sourceMaxRefundableCents
        ? 'refunded'
        : 'partial_refund';
    if (sourceTx.status !== sourceNewStatus) {
      const { error: txUpdErr } = await admin
        .from('transactions')
        .update({ status: sourceNewStatus })
        .eq('id', sourceTx.id);
      if (txUpdErr) {
        console.error(
          `[Stripe Webhook] transaction status update failed (tx: ${sourceTx.id}): ${txUpdErr.message}`
        );
        throw new Error(
          `transaction status update failed: ${txUpdErr.message}`
        );
      }
    }

    // Audit — distinct entity_type=transaction so the entry doesn't conflict
    // with cancel-orchestration's entity_type=booking audit on the same
    // appointment. Operators reading the audit log for an appointment see
    // both: orchestration-driven cancellation refunds AND external
    // reconciliation refunds.
    await logAudit({
      action: 'refund',
      entityType: 'transaction',
      entityId: sourceTx.id,
      entityLabel: `External refund ${refund.id} on transaction ${sourceTx.id.slice(0, 8)}`,
      details: {
        trigger: 'stripe_webhook_charge_refunded',
        stripe_refund_id: refund.id,
        stripe_charge_id: charge.id,
        stripe_payment_intent_id: paymentIntentId,
        refund_amount_cents: refund.amount,
        cumulative_refunded_cents: cumulativeRefundedCents,
        source_transaction_status: sourceNewStatus,
        appointment_id: sourceTx.appointment_id,
        customer_id: sourceTx.customer_id,
        reason: refund.reason ?? null,
      },
      source: 'api',
    });

    console.log(
      `[Stripe Webhook] charge.refunded reconciled (refund: ${refund.id}, tx: ${sourceTx.id}, amount: ${refund.amount}c, new_tx_status: ${sourceNewStatus})`
    );
  }
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
