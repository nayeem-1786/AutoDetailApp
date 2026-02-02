import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const connectionToken = await stripe.terminal.connectionTokens.create();

    return NextResponse.json({ secret: connectionToken.secret });
  } catch (err) {
    console.error('Connection token error:', err);
    return NextResponse.json(
      { error: 'Failed to create connection token' },
      { status: 500 }
    );
  }
}
