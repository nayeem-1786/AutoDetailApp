import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceiptTransaction, ReceiptContext, ReceiptImages } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import { derivePaymentSourceLabel, type PaymentMethodLike } from '@/lib/utils/payment-source-label';
import { toCents } from '@/lib/utils/refund-math';
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
      payments(*),
      refunds(*, refund_items(*))
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

  // 7. Detect deposit receipt — check linked appointment for payment_type='deposit'
  let isDeposit = false;
  let depositAmount = 0;
  let balanceDue = 0;
  let depositDate: string | undefined;

  if (transaction.appointment_id) {
    // This transaction is directly linked to an appointment (deposit receipt)
    const { data: appt } = await supabase
      .from('appointments')
      .select('payment_type, deposit_amount, total_amount')
      .eq('id', transaction.appointment_id)
      .single();

    if (appt?.payment_type === 'deposit' && appt.deposit_amount != null && appt.deposit_amount > 0) {
      isDeposit = true;
      depositAmount = Number(appt.deposit_amount);
      balanceDue = Number(appt.total_amount) - depositAmount;
      // For deposit receipts, the transaction date IS the deposit date
      depositDate = transaction.transaction_date;
    }
  }

  // 8. For balance payment receipts (deposit_credit > 0), find deposit date + receipt via job → appointment → deposit transaction
  let linkedReceipt: { receipt_number: string; label: string } | null = null;

  if (!isDeposit && transaction.deposit_credit > 0) {
    // Find the job linked to this transaction
    const { data: linkedJob } = await supabase
      .from('jobs')
      .select('appointment_id')
      .eq('transaction_id', transaction.id)
      .maybeSingle();

    if (linkedJob?.appointment_id) {
      // Find the original deposit transaction by appointment_id
      const { data: depositTxn } = await supabase
        .from('transactions')
        .select('transaction_date, receipt_number')
        .eq('appointment_id', linkedJob.appointment_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (depositTxn?.transaction_date) {
        depositDate = depositTxn.transaction_date;
      }
      if (depositTxn?.receipt_number) {
        linkedReceipt = { receipt_number: depositTxn.receipt_number, label: 'Deposit Receipt' };
      }
    }
  }

  // 8b. For deposit receipts, find the balance payment receipt via appointment → jobs → transaction
  if (isDeposit && transaction.appointment_id) {
    const { data: balanceJob } = await supabase
      .from('jobs')
      .select('transaction_id')
      .eq('appointment_id', transaction.appointment_id)
      .not('transaction_id', 'is', null)
      .maybeSingle();

    if (balanceJob?.transaction_id) {
      const { data: balanceTxn } = await supabase
        .from('transactions')
        .select('receipt_number')
        .eq('id', balanceJob.transaction_id)
        .maybeSingle();

      if (balanceTxn?.receipt_number) {
        linkedReceipt = { receipt_number: balanceTxn.receipt_number, label: 'Balance Payment' };
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = transaction as any;

  // 8c. When the transaction is appointment-linked, replace the locally
  // joined payments[] with the FULL payment history for that appointment,
  // chronologically ordered. Closes the gap where a close-out (or any
  // appointment-linked sale) would render an empty Payment section because
  // its own payments[] was empty (close-out) or didn't include prior
  // pay-link / booking-deposit / partial pre-payment rows.
  //
  // Each row carries source_label (derived from the joined transaction's
  // notes prefix; same logic as POS Payments Received) so the renderer can
  // print "Online (pay link)" / "Booking deposit" / method name with date.
  // Walk-in transactions (appointment_id IS NULL) keep raw.payments — no
  // change to current behavior.
  let renderedPayments = raw.payments ?? [];
  let appointmentBalanceDue: number | undefined = undefined;
  let appointmentTotal: number | undefined = undefined;

  if (raw.appointment_id) {
    const { data: appPayments } = await supabase
      .from('payments')
      .select(
        '*, transaction:transactions!inner(id, appointment_id, status, notes)'
      )
      .eq('transaction.appointment_id', raw.appointment_id)
      .eq('transaction.status', 'completed')
      .order('created_at', { ascending: true });

    if (appPayments) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      renderedPayments = appPayments.map((p: any) => ({
        ...p,
        source_label: derivePaymentSourceLabel(
          p.transaction?.notes ?? null,
          p.method as PaymentMethodLike
        ),
      }));

      // Pull the appointment total to compute Balance Due on the receipt.
      // Reuses the appt fetch above when isDeposit; re-fetches otherwise so
      // we always have the correct total for non-deposit appointment-linked
      // transactions (close-out, partial pre-pay, in-store sale on a
      // pay-link-paid appointment, etc).
      const { data: apptForBalance } = await supabase
        .from('appointments')
        .select('total_amount')
        .eq('id', raw.appointment_id)
        .maybeSingle();

      if (apptForBalance) {
        const totalCents = toCents(Number(apptForBalance.total_amount));
        const paidCents = renderedPayments.reduce(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (sum: number, p: any) => sum + toCents(Number(p.amount)),
          0
        );
        appointmentBalanceDue = Math.max(0, totalCents - paidCents);
        // Receipt Total displays the appointment gross when this transaction
        // is appointment-linked. Close-out has total_amount=0 — without this,
        // the receipt shows "$0.00" as the Total which is misleading.
        appointmentTotal = Number(apptForBalance.total_amount);
      }
    }
  }

  // 9. Map database transaction to ReceiptTransaction interface
  const tx: ReceiptTransaction = {
    status: raw.status,
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
    employee: raw.employee ?? (isDeposit ? { first_name: 'Online', last_name: 'Booking' } : null),
    vehicle: raw.vehicle,
    items: raw.items ?? [],
    payments: renderedPayments,
    refunds: raw.refunds ?? [],
    is_deposit: isDeposit,
    deposit_amount: isDeposit ? depositAmount : undefined,
    balance_due: isDeposit ? balanceDue : undefined,
    deposit_credit: raw.deposit_credit > 0 ? raw.deposit_credit : undefined,
    deposit_date: depositDate,
    linked_receipt: linkedReceipt,
    appointment_balance_due: appointmentBalanceDue,
    appointment_total: appointmentTotal,
  };

  return { tx, config: merged, context, images, print_server_url };
}
