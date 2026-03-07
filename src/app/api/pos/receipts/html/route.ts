import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { generateReceiptHtml } from '@/app/pos/lib/receipt-template';
import type { ReceiptImages } from '@/app/pos/lib/receipt-template';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

/**
 * GET /api/pos/receipts/html?transaction_id=...
 * Returns the fully rendered receipt HTML as text/html.
 * Used by the POS Print button to open in a popup for native browser printing.
 */
export async function GET(request: NextRequest) {
  try {
    const posEmployee = authenticatePosRequest(request);
    if (!posEmployee) {
      const supabaseSession = await createClient();
      const { data: { user } } = await supabaseSession.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    const supabase = createAdminClient();

    const transactionId = request.nextUrl.searchParams.get('transaction_id');
    if (!transactionId) {
      return NextResponse.json({ error: 'transaction_id is required' }, { status: 400 });
    }

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
      .eq('id', transactionId)
      .single();

    if (error || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

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
    const html = generateReceiptHtml({
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
      items: tx.items ?? [],
      payments: tx.payments ?? [],
    }, merged, images);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err) {
    console.error('Receipt HTML error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
