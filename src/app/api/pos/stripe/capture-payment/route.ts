import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

/**
 * POST /api/pos/stripe/capture-payment
 * Captures a previously authorized PaymentIntent (manual capture mode).
 * Called after processPayment returns — finalizes the charge including any tip.
 */
export async function POST(request: NextRequest) {
  try {
    const posEmployee = await authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { payment_intent_id, amount_to_capture } = body;

    if (!payment_intent_id) {
      return NextResponse.json({ error: 'payment_intent_id is required' }, { status: 400 });
    }

    const captureParams: Stripe.PaymentIntentCaptureParams = {};
    if (amount_to_capture && amount_to_capture > 0) {
      captureParams.amount_to_capture = amount_to_capture;
    }

    const captured = await stripe.paymentIntents.capture(payment_intent_id, captureParams);

    return NextResponse.json({
      id: captured.id,
      amount: captured.amount,
      status: captured.status,
    });
  } catch (err) {
    console.error('Capture payment error:', err);
    const message = err instanceof Error ? err.message : 'Failed to capture payment';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
