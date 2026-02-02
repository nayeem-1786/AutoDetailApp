import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { BUSINESS } from '@/lib/utils/constants';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transaction_id, phone } = body;

    if (!transaction_id || !phone) {
      return NextResponse.json(
        { error: 'transaction_id and phone are required' },
        { status: 400 }
      );
    }

    // Fetch transaction
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select('receipt_number, total_amount, tip_amount')
      .eq('id', transaction_id)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;

    if (!twilioSid || !twilioAuth || !twilioFrom) {
      return NextResponse.json(
        { error: 'SMS service not configured' },
        { status: 400 }
      );
    }

    const smsBody =
      `Receipt from ${BUSINESS.NAME}\n` +
      `#${transaction.receipt_number || 'N/A'}\n` +
      `Total: $${transaction.total_amount.toFixed(2)}` +
      (transaction.tip_amount > 0
        ? ` (incl. $${transaction.tip_amount.toFixed(2)} tip)`
        : '') +
      `\nThank you!`;

    const formData = new URLSearchParams();
    formData.append('From', twilioFrom);
    formData.append('To', phone);
    formData.append('Body', smsBody);

    const twRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${twilioSid}:${twilioAuth}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      }
    );

    if (!twRes.ok) {
      const errText = await twRes.text();
      console.error('Twilio error:', errText);
      return NextResponse.json(
        { error: 'Failed to send SMS receipt' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt SMS error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
