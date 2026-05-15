import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { STRIPE_MIN_AMOUNT_CENTS, STRIPE_MIN_DOLLARS } from '@/lib/utils/money';
import { paymentIntentRequestSchema } from './schema';

// Lazy Stripe client — instantiated on first POST. Module-level new Stripe(...)
// would throw at import time when STRIPE_SECRET_KEY is absent (notably in the
// Vitest environment that imports `paymentIntentRequestSchema` from this file).
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripeClient;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = paymentIntentRequestSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: 'Invalid payment-intent request', fieldErrors },
        { status: 400 }
      );
    }

    const {
      amountCents,
      currency = 'usd',
      metadata,
      isDeposit,
      totalAmountCents,
    } = parsed.data;

    if (amountCents < STRIPE_MIN_AMOUNT_CENTS) {
      return NextResponse.json(
        { error: `Amount must be at least $${STRIPE_MIN_DOLLARS.toFixed(2)}` },
        { status: 400 }
      );
    }

    // Stripe metadata values must be strings. Cents stored as integer-string
    // (e.g. "5000") keeps the unit explicit on the PaymentIntent record.
    const paymentMetadata = {
      ...metadata,
      ...(isDeposit && {
        is_deposit: 'true',
        deposit_amount_cents: String(amountCents),
        total_amount_cents: totalAmountCents != null ? String(totalAmountCents) : '',
      }),
    };

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: amountCents,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: paymentMetadata,
      // Use automatic capture for deposits (immediate charge)
      capture_method: 'automatic',
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (err) {
    console.error('Payment intent creation failed:', err);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
