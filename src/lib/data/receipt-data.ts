import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceiptTransaction, ReceiptContext, ReceiptImages } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';

interface ReceiptData {
  tx: ReceiptTransaction;
  config: MergedReceiptConfig;
  context: ReceiptContext;
  images: ReceiptImages;
  /** Print server URL from receipt config (may be null) */
  print_server_url: string | null;
}

/**
 * Fetches all data needed to render a receipt for a given transaction.
 * Consolidates the duplicated logic from all 5 receipt API routes:
 * - Transaction fetch with relations
 * - Receipt config
 * - Review URLs (always fresh from business_settings)
 * - QR code + barcode image generation
 * - ReceiptTransaction mapping
 */
export async function fetchReceiptData(
  supabase: SupabaseClient,
  transactionId: string
): Promise<ReceiptData> {
  // 1. Fetch transaction with all relations
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
    throw new Error('Transaction not found');
  }

  // 2. Fetch receipt config
  const { merged, print_server_url } = await fetchReceiptConfig(supabase);

  // 3. Fetch review URLs FRESH from business_settings (never cached)
  const { data: reviewUrlRows } = await supabase
    .from('business_settings')
    .select('key, value')
    .in('key', ['google_review_url', 'yelp_review_url']);

  const reviewSettings: Record<string, string> = {};
  for (const r of reviewUrlRows ?? []) {
    if (typeof r.value === 'string') reviewSettings[r.key] = r.value;
  }

  // 4. Build ReceiptContext (for line-based rendering: thermal, SMS)
  const context: ReceiptContext = {
    googleReviewUrl: reviewSettings.google_review_url || undefined,
    yelpReviewUrl: reviewSettings.yelp_review_url || undefined,
  };

  // 5. Generate QR code images (for HTML rendering)
  const images: ReceiptImages = {};
  if (reviewSettings.google_review_url) {
    images.qrGoogle = await QRCode.toDataURL(reviewSettings.google_review_url, { width: 150, margin: 1 });
  }
  if (reviewSettings.yelp_review_url) {
    images.qrYelp = await QRCode.toDataURL(reviewSettings.yelp_review_url, { width: 150, margin: 1 });
  }

  // 6. Generate barcode image (for HTML rendering)
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

  // 7. Map database transaction to ReceiptTransaction interface
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = transaction as any;
  const tx: ReceiptTransaction = {
    receipt_number: raw.receipt_number,
    transaction_date: raw.transaction_date,
    subtotal: raw.subtotal,
    tax_amount: raw.tax_amount,
    discount_amount: raw.discount_amount,
    coupon_code: raw.coupon_code,
    loyalty_discount: raw.loyalty_discount,
    loyalty_points_redeemed: raw.loyalty_points_redeemed,
    tip_amount: raw.tip_amount,
    total_amount: raw.total_amount,
    loyalty_points_earned: raw.loyalty_points_earned ?? 0,
    customer: raw.customer,
    employee: raw.employee,
    vehicle: raw.vehicle,
    items: raw.items ?? [],
    payments: raw.payments ?? [],
  };

  return { tx, config: merged, context, images, print_server_url };
}
