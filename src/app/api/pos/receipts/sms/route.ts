import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { authenticatePosRequest } from '@/lib/pos/api-auth';
import { sendSms } from '@/lib/utils/sms';
import { generateReceiptLines, receiptToPlainText } from '@/app/pos/lib/receipt-template';
import type { ReceiptContext } from '@/app/pos/lib/receipt-template';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';

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
    const { transaction_id, phone } = body;

    if (!transaction_id || !phone) {
      return NextResponse.json(
        { error: 'transaction_id and phone are required' },
        { status: 400 }
      );
    }

    // Fetch transaction with full relations for formatted receipt
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
    const context: ReceiptContext = {
      googleReviewUrl: reviewSettings.google_review_url || undefined,
      yelpReviewUrl: reviewSettings.yelp_review_url || undefined,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = transaction as any;
    const receiptLines = generateReceiptLines({
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
    }, merged, context);
    const smsBody = receiptToPlainText(receiptLines, 40);

    const result = await sendSms(phone, smsBody);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
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
