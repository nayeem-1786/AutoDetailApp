import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
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
    const { transaction_id } = body;

    if (!transaction_id) {
      return NextResponse.json(
        { error: 'transaction_id is required' },
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
    const { merged, print_server_url } = await fetchReceiptConfig(supabase);

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

    if (!print_server_url) {
      return NextResponse.json(
        { error: 'Print server not configured. Set Print Server URL in Settings > Receipt Printer.' },
        { status: 400 }
      );
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

    // Send HTML to print server for PDF conversion + copier print (15s timeout)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const printRes = await fetch(`${print_server_url}/print-copier`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!printRes.ok) {
        const errText = await printRes.text().catch(() => 'Unknown error');
        return NextResponse.json(
          { error: `Copier print error: ${errText}` },
          { status: 502 }
        );
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      const msg = fetchErr instanceof Error && fetchErr.name === 'AbortError'
        ? 'Copier print timeout (15s)'
        : 'Print server unreachable';
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Receipt print-copier error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
