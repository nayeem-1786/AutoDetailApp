import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireWebhook } from '@/lib/utils/webhook';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { access_token } = body;

    if (!access_token || typeof access_token !== 'string') {
      return NextResponse.json({ error: 'access_token is required' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Fetch quote
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select(
        `
        *,
        customer:customers(id, first_name, last_name, phone, email),
        items:quote_items(*)
      `
      )
      .eq('id', id)
      .single();

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Validate access token
    if (quote.access_token !== access_token) {
      return NextResponse.json({ error: 'Invalid access token' }, { status: 403 });
    }

    // Only allow accept if status is 'sent' or 'viewed'
    if (quote.status !== 'sent' && quote.status !== 'viewed') {
      return NextResponse.json(
        { error: `Cannot accept a quote with status "${quote.status}"` },
        { status: 400 }
      );
    }

    // Update status to accepted
    const { data: updated, error: updateErr } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateErr) {
      console.error('Error accepting quote:', updateErr.message);
      return NextResponse.json({ error: 'Failed to accept quote' }, { status: 500 });
    }

    // Fire webhook
    fireWebhook('quote_accepted', { ...quote, status: 'accepted', accepted_at: updated.accepted_at }, supabase).catch(() => {});

    return NextResponse.json({ success: true, quote: updated });
  } catch (err) {
    console.error('Quote accept error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
