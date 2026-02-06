import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// GET: List all readers
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const location = searchParams.get('location');

    const params: Stripe.Terminal.ReaderListParams = { limit: 100 };
    if (location) {
      params.location = location;
    }

    const readers = await stripe.terminal.readers.list(params);

    return NextResponse.json({ readers: readers.data });
  } catch (err) {
    console.error('List readers error:', err);
    return NextResponse.json(
      { error: 'Failed to list readers' },
      { status: 500 }
    );
  }
}
