import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendEmail } from '@/lib/utils/email';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { ReceiptImages } from '@/app/pos/lib/receipt-template';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

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
    const supabase = createAdminClient();

    const body = await request.json();
    const { transaction_id, email } = body;

    if (!transaction_id || !email) {
      return NextResponse.json(
        { error: 'transaction_id and email are required' },
        { status: 400 }
      );
    }

    // Fetch transaction with full relations
    const { data: transaction, error } = await supabase
      .from('transactions')
      .select(`
        *,
        customer:customers(first_name, last_name, phone, email, customer_type, created_at),
        employee:employees(first_name, last_name),
        vehicle:vehicles(vehicle_type, year, make, model, color),
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

    // Fetch dynamic receipt config + review URLs for QR shortcodes
    const { merged } = await fetchReceiptConfig(supabase);

    const { data: reviewUrlRows } = await supabase
      .from('business_settings')
      .select('key, value')
      .in('key', ['google_review_url', 'yelp_review_url']);

    const reviewSettings: Record<string, string> = {};
    for (const r of reviewUrlRows ?? []) {
      if (typeof r.value === 'string') reviewSettings[r.key] = r.value;
    }
    const images: ReceiptImages = {};
    if (reviewSettings.google_review_url) {
      images.qrGoogle = await QRCode.toDataURL(reviewSettings.google_review_url, { width: 150, margin: 1 });
    }
    if (reviewSettings.yelp_review_url) {
      images.qrYelp = await QRCode.toDataURL(reviewSettings.yelp_review_url, { width: 150, margin: 1 });
    }
    if (transaction.receipt_number) {
      try {
        const buf = await bwipjs.toBuffer({
          bcid: 'code128',
          text: transaction.receipt_number,
          scale: 2,
          height: 10,
          includetext: false,
        });
        images.barcode = `data:image/png;base64,${buf.toString('base64')}`;
      } catch { /* barcode generation failed — fallback to text */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = transaction as any;
    const items = (tx.items ?? []) as { item_name: string; quantity: number; unit_price: number; total_price: number; tax_amount: number }[];
    const payments = (tx.payments ?? []) as { method: string; amount: number; tip_amount: number; card_brand?: string | null; card_last_four?: string | null }[];
    const customerName = tx.customer
      ? `${tx.customer.first_name} ${tx.customer.last_name}`
      : 'Guest';

    // Generate HTML receipt with dynamic config
    const htmlBody = generateReceiptHtml({
      receipt_number: tx.receipt_number,
      transaction_date: tx.transaction_date,
      subtotal: tx.subtotal,
      tax_amount: tx.tax_amount,
      discount_amount: tx.discount_amount,
      coupon_code: tx.coupon_code,
      loyalty_discount: tx.loyalty_discount,
      loyalty_points_redeemed: tx.loyalty_points_redeemed,
      tip_amount: tx.tip_amount,
      total_amount: tx.total_amount,
      customer: tx.customer,
      employee: tx.employee,
      vehicle: tx.vehicle,
      items,
      payments,
    }, merged, images);

    // Plain text fallback
    const itemLines = items
      .map(
        (i) =>
          i.quantity > 1
            ? `${i.item_name}\n  ${i.quantity} x $${i.unit_price.toFixed(2)} each${i.tax_amount > 0 ? '  TX' : ''}  $${i.total_price.toFixed(2)}`
            : `${i.item_name}${i.tax_amount > 0 ? '  TX' : ''}  $${i.total_price.toFixed(2)}`
      )
      .join('\n');

    const paymentLines = payments
      .map((p) => `${p.method.toUpperCase()}: $${p.amount.toFixed(2)}`)
      .join('\n');

    const textBody = `Receipt from ${merged.name}
${merged.address}

Receipt #${tx.receipt_number || 'N/A'}
Date: ${new Date(tx.transaction_date).toLocaleDateString()}
Customer: ${customerName}

Items:
${itemLines}

Subtotal: $${tx.subtotal.toFixed(2)}
Tax: $${tx.tax_amount.toFixed(2)}
${tx.discount_amount > 0 ? `${tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount'}: -$${tx.discount_amount.toFixed(2)}\n` : ''}${tx.loyalty_discount > 0 ? `Loyalty (${tx.loyalty_points_redeemed || 0} pts): -$${tx.loyalty_discount.toFixed(2)}\n` : ''}${tx.tip_amount > 0 ? `Tip: $${tx.tip_amount.toFixed(2)}\n` : ''}Total: $${tx.total_amount.toFixed(2)}

Payment:
${paymentLines}

Thank you for choosing ${merged.name}!`;

    const subject = `Receipt #${tx.receipt_number || tx.id.slice(0, 8)} from ${merged.name}`;

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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
