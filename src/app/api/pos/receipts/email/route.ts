import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendEmail } from '@/lib/utils/email';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import { fetchReceiptData } from '@/lib/data/receipt-data';

export async function POST(request: NextRequest) {
  try {
    // Accept POS token auth OR admin Supabase session auth
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json();
    const { transaction_id, email } = body;

    if (!transaction_id || !email) {
      return NextResponse.json(
        { error: 'transaction_id and email are required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const { tx, config, images } = await fetchReceiptData(supabase, transaction_id);

    const htmlBody = generateReceiptHtml(tx, config, images);

    // Plain text fallback
    const customerName = tx.customer
      ? `${tx.customer.first_name} ${tx.customer.last_name}`
      : 'Guest';

    const itemLines = tx.items
      .map(
        (i) =>
          i.quantity > 1
            ? `${i.item_name}\n  ${i.quantity} x $${i.unit_price.toFixed(2)} each${i.tax_amount > 0 ? '  TX' : ''}  $${i.total_price.toFixed(2)}`
            : `${i.item_name}${i.tax_amount > 0 ? '  TX' : ''}  $${i.total_price.toFixed(2)}`
      )
      .join('\n');

    const paymentLines = tx.payments
      .map((p) => `${p.method.toUpperCase()}: $${p.amount.toFixed(2)}`)
      .join('\n');

    const textBody = `Receipt from ${config.name}
${config.address}

Receipt #${tx.receipt_number || 'N/A'}
Date: ${new Date(tx.transaction_date).toLocaleDateString()}
Customer: ${customerName}

Items:
${itemLines}

Subtotal: $${tx.subtotal.toFixed(2)}
Tax: $${tx.tax_amount.toFixed(2)}
${tx.discount_amount > 0 ? `${tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount'}: -$${tx.discount_amount.toFixed(2)}\n` : ''}${tx.loyalty_discount && tx.loyalty_discount > 0 ? `Loyalty (${tx.loyalty_points_redeemed || 0} pts): -$${tx.loyalty_discount.toFixed(2)}\n` : ''}${tx.tip_amount > 0 ? `Tip: $${tx.tip_amount.toFixed(2)}\n` : ''}Total: $${tx.total_amount.toFixed(2)}

Payment:
${paymentLines}

Thank you for choosing ${config.name}!`;

    const subject = `Receipt #${tx.receipt_number || transaction_id.slice(0, 8)} from ${config.name}`;

    const result = await sendEmail(email, subject, textBody, htmlBody);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt email error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    const status = message === 'Transaction not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
