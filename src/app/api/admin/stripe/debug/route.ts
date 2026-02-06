import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// GET: Debug Stripe Terminal setup
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check Stripe key type
    const keyType = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')
      ? 'LIVE'
      : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')
        ? 'TEST'
        : 'UNKNOWN';

    // List locations
    const locations = await stripe.terminal.locations.list({ limit: 10 });

    // List all readers
    const readers = await stripe.terminal.readers.list({ limit: 10 });

    // Try to create a connection token
    let connectionTokenStatus = 'unknown';
    try {
      await stripe.terminal.connectionTokens.create();
      connectionTokenStatus = 'success';
    } catch (err) {
      connectionTokenStatus = err instanceof Error ? err.message : 'failed';
    }

    return NextResponse.json({
      stripe_key_type: keyType,
      connection_token: connectionTokenStatus,
      locations: locations.data.map(l => ({
        id: l.id,
        display_name: l.display_name,
      })),
      readers: readers.data.map(r => ({
        id: r.id,
        label: r.label,
        device_type: r.device_type,
        status: r.status,
        location: r.location,
      })),
    });
  } catch (err) {
    console.error('Stripe debug error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
