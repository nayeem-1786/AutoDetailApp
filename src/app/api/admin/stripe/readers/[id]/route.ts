import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-01-28.clover',
});

// DELETE: Delete a reader
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    await stripe.terminal.readers.del(id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete reader error:', err);
    const message = err instanceof Error ? err.message : 'Failed to delete reader';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
