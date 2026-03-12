import { NextRequest, NextResponse } from 'next/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

export async function POST(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const connectionToken = await stripe.terminal.connectionTokens.create();

    return NextResponse.json(
      { secret: connectionToken.secret },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('Connection token error:', err);
    return NextResponse.json(
      { error: 'Failed to create connection token' },
      { status: 500 }
    );
  }
}
