import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// POST: Register a reader with pairing code
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { registration_code, label, location } = body;

    if (!registration_code) {
      return NextResponse.json(
        { error: 'registration_code is required' },
        { status: 400 }
      );
    }

    if (!location) {
      return NextResponse.json(
        { error: 'location is required' },
        { status: 400 }
      );
    }

    const reader = await stripe.terminal.readers.create({
      registration_code,
      label: label || 'POS Reader',
      location,
    });

    return NextResponse.json({ reader });
  } catch (err) {
    console.error('Register reader error:', err);
    const message = err instanceof Error ? err.message : 'Failed to register reader';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
