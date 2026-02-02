import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { amount, description } = body;

    if (!amount || amount < 50) {
      return NextResponse.json(
        { error: 'Amount must be at least $0.50 (50 cents)' },
        { status: 400 }
      );
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount, // in cents
      currency: 'usd',
      description: description || 'Smart Detail POS',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
    });

    return NextResponse.json({
      client_secret: paymentIntent.client_secret,
      id: paymentIntent.id,
    });
  } catch (err) {
    console.error('Payment intent error:', err);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}
