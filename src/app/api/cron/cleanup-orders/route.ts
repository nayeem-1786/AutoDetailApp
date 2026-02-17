import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/admin';

const CRON_API_KEY = process.env.CRON_API_KEY;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Cleanup abandoned orders:
 * - Find pending orders older than 24 hours
 * - Cancel their Stripe PaymentIntents
 * - Mark as 'cancelled'
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!CRON_API_KEY || apiKey !== CRON_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Orders pending for more than 24 hours
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: staleOrders, error } = await admin
    .from('orders')
    .select('id, stripe_payment_intent_id')
    .eq('payment_status', 'pending')
    .lt('created_at', cutoff)
    .limit(100);

  if (error) {
    console.error('[cleanup-orders] Query error:', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }

  if (!staleOrders || staleOrders.length === 0) {
    return NextResponse.json({ cancelled: 0 });
  }

  let cancelled = 0;
  let piCancelled = 0;

  for (const order of staleOrders) {
    // Cancel Stripe PaymentIntent (best-effort)
    if (order.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
        piCancelled++;
      } catch (err: unknown) {
        // PI may already be cancelled/succeeded — that's fine
        const message =
          err instanceof Error ? err.message : 'Unknown error';
        console.warn(
          `[cleanup-orders] PI cancel failed for ${order.stripe_payment_intent_id}: ${message}`
        );
      }
    }

    // Mark order as cancelled
    const { error: updateErr } = await admin
      .from('orders')
      .update({ payment_status: 'cancelled' })
      .eq('id', order.id)
      .eq('payment_status', 'pending'); // double-check still pending

    if (!updateErr) {
      cancelled++;
    }
  }

  console.log(
    `[cleanup-orders] Cancelled ${cancelled} orders, ${piCancelled} PaymentIntents`
  );

  return NextResponse.json({ cancelled, piCancelled });
}
