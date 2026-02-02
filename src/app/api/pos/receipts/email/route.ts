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
    const { transaction_id, email } = body;

    if (!transaction_id || !email) {
      return NextResponse.json(
        { error: 'transaction_id and email are required' },
        { status: 400 }
      );
    }

    // Fetch transaction
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(first_name, last_name),
        items:transaction_items(*),
        payments(*)
      `)
      .eq('id', transaction_id)
      .single();

    if (error || !transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Send via Mailgun
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunKey = process.env.MAILGUN_API_KEY;

    if (!mailgunDomain || !mailgunKey) {
      return NextResponse.json(
        { error: 'Email service not configured' },
        { status: 400 }
      );
    }

    const items = (transaction.items as { item_name: string; quantity: number; total_price: number; tax_amount: number }[]) ?? [];
    const payments = (transaction.payments as { method: string; amount: number }[]) ?? [];
    const customerName = transaction.customer
      ? `${(transaction.customer as { first_name: string }).first_name} ${(transaction.customer as { last_name: string }).last_name}`
      : 'Guest';

    const itemLines = items
      .map(
        (i) =>
          `${i.item_name} x${i.quantity} — $${i.total_price.toFixed(2)}${i.tax_amount > 0 ? ` (+$${i.tax_amount.toFixed(2)} tax)` : ''}`
      )
      .join('\n');

    const paymentLines = payments
      .map((p) => `${p.method.toUpperCase()}: $${p.amount.toFixed(2)}`)
      .join('\n');

    const textBody = `Receipt from ${BUSINESS.NAME}
${BUSINESS.ADDRESS}

Receipt #${transaction.receipt_number || 'N/A'}
Date: ${new Date(transaction.transaction_date).toLocaleDateString()}
Customer: ${customerName}

Items:
${itemLines}

Subtotal: $${transaction.subtotal.toFixed(2)}
Tax: $${transaction.tax_amount.toFixed(2)}
${transaction.discount_amount > 0 ? `Discount: -$${transaction.discount_amount.toFixed(2)}\n` : ''}${transaction.tip_amount > 0 ? `Tip: $${transaction.tip_amount.toFixed(2)}\n` : ''}Total: $${transaction.total_amount.toFixed(2)}

Payment:
${paymentLines}

Thank you for choosing ${BUSINESS.NAME}!`;

    const formData = new URLSearchParams();
    formData.append('from', `${BUSINESS.NAME} <receipts@${mailgunDomain}>`);
    formData.append('to', email);
    formData.append('subject', `Receipt #${transaction.receipt_number || transaction.id.slice(0, 8)} from ${BUSINESS.NAME}`);
    formData.append('text', textBody);

    const mgRes = await fetch(
      `https://api.mailgun.net/v3/${mailgunDomain}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
        },
        body: formData,
      }
    );

    if (!mgRes.ok) {
      const errText = await mgRes.text();
      console.error('Mailgun error:', errText);
      return NextResponse.json(
        { error: 'Failed to send email receipt' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt email error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
