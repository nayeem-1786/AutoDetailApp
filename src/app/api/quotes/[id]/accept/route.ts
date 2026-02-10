import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireWebhook } from '@/lib/utils/webhook';
import { sendSms } from '@/lib/utils/sms';

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
      .is('deleted_at', null)
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

    // Send SMS confirmation to customer
    const customer = quote.customer as { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } | null;
    if (customer?.phone) {
      const items = (quote.items as Array<{ item_name: string }>) ?? [];
      let smsBody: string;
      if (items.length === 1) {
        smsBody = `Thanks ${customer.first_name}! Your quote for ${items[0].item_name} has been accepted. Our team will reach out shortly to schedule your appointment.`;
      } else {
        smsBody = `Thanks ${customer.first_name}! Your quote has been accepted. Our team will reach out shortly to schedule.`;
      }

      const smsResult = await sendSms(customer.phone, smsBody);

      await supabase.from('quote_communications').insert({
        quote_id: id,
        channel: 'sms',
        sent_to: customer.phone,
        status: smsResult.success ? 'sent' : 'failed',
        error_message: smsResult.success ? null : 'SMS delivery failed',
      });
    }

    return NextResponse.json({ success: true, quote: updated });
  } catch (err) {
    console.error('Quote accept error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
