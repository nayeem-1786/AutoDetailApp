import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceiptTransaction, ReceiptContext, ReceiptImages } from '@/app/pos/lib/receipt-template';
import type { MergedReceiptConfig } from '@/lib/data/receipt-config';
import { fetchReceiptConfig } from '@/lib/data/receipt-config';
import { type PaymentMethodLike } from '@/lib/utils/payment-source-label';
import {
  composeReceiptPaymentLines,
  sourceToLabel,
  type ComposerPaymentInput,
} from '@/lib/data/receipt-composer';
import {
  parseRefundSources,
  enrichRefundSources,
  type RefundSource,
} from '@/lib/data/refund-sources';
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
 * Fetches the rendered ReceiptTransaction for a given transaction id —
 * the core composer-driven aggregation without the receipt-config / QR /
 * barcode work that only the print/email/thermal renderers need.
 *
 * Phase 0b.2 extraction: the public receipt page consumes this directly
 * (skipping ~50-150ms of unused QR/barcode compute on every page load),
 * while fetchReceiptData layers config/context/images on top for the
 * thermal + HTML print + email pipelines.
 */
export async function fetchReceiptTransaction(
  supabase: SupabaseClient,
  transactionId: string
): Promise<ReceiptTransaction> {
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

  return mapTransactionRow(supabase, transaction);
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
  // Delegate transaction fetch + ReceiptTransaction mapping to the shared
  // sub-helper; both fetchReceiptData and the public receipt page route
  // through it so the composer-backed shape is single-sourced.
  const tx = await fetchReceiptTransaction(supabase, transactionId);

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
  if (tx.receipt_number) {
    try {
      const buf = await bwipjs.toBuffer({
        bcid: 'code128',
        text: tx.receipt_number,
        scale: 2,
        height: 10,
        includetext: false,
      });
      images.barcode = `data:image/png;base64,${buf.toString('base64')}`;
    } catch { /* barcode generation failed — fallback to text */ }
  }

  return { tx, config: merged, context, images, print_server_url };
}

/**
 * Inner mapper: takes an already-fetched transaction row (with relations
 * spread) and runs the deposit detection / linked-receipt lookup / appointment
 * payment aggregation / refund-source enrichment that produces a
 * ReceiptTransaction. Pulled out of fetchReceiptData so fetchReceiptTransaction
 * can reuse it without re-fetching.
 */
async function mapTransactionRow(
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction: any
): Promise<ReceiptTransaction> {
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
  //
  // Phase 0a: post-eager-creation, every walk-in transaction also runs
  // through this aggregation path — single-payment walk-ins yield the same
  // payments[] as the pre-0a local-join result.
  // LEGACY: pre-Phase 0a walk-ins still have appointment_id IS NULL and
  // keep raw.payments via the fallback. Eventual migration possible.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let renderedPayments: any[] = raw.payments ?? [];
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

    // Pull the appointment total to compute Balance Due on the receipt.
    // Re-fetches even when isDeposit since we need it for both branches.
    const { data: apptForBalance } = await supabase
      .from('appointments')
      .select('total_amount')
      .eq('id', raw.appointment_id)
      .maybeSingle();

    if (appPayments) {
      // Phase 0b.1: composer takes over chronological sort + source detection
      // + balance-due math. Output here preserves the pre-0b.1 contract:
      //   - appointment_id-linked payments[] carry source_label string
      //   - appointment_balance_due in cents, clamped >= 0
      //   - appointment_total in dollars (renderer applies Math.max policy)
      // The clamp semantics (Math.max(0, total-paid)) live inside the composer.
      const composerInput: ComposerPaymentInput[] = appPayments.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({
          id: p.id,
          method: p.method,
          amount: Number(p.amount),
          tip_amount: p.tip_amount,
          card_brand: p.card_brand,
          card_last_four: p.card_last_four,
          cash_tendered: p.cash_tendered,
          change_given: p.change_given,
          created_at: p.created_at,
          source_notes: p.transaction?.notes ?? null,
          stripe_payment_intent_id: p.stripe_payment_intent_id,
          // Phase 1A.5: pass digital_platform through to composer label assembly.
          digital_platform: p.digital_platform ?? null,
        })
      );

      const block = composeReceiptPaymentLines(
        composerInput,
        apptForBalance ? { total_amount: Number(apptForBalance.total_amount) } : null
      );

      // Re-attach the original DB row alongside composer-derived source_label
      // so any consumer fields not surfaced by the composer (e.g., joined
      // transaction relation) remain available. Order matches block.lines
      // (composer sorts chronologically, same as the pre-0b.1 ORDER BY).
      const sortedRaw = [...appPayments].sort(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      renderedPayments = sortedRaw.map((p, i) => ({
        ...p,
        source_label: sourceToLabel(
          block.lines[i].source,
          block.lines[i].method as PaymentMethodLike
        ),
      }));

      if (apptForBalance) {
        appointmentBalanceDue = block.balance_due_cents;
        // Renderer expects raw appointment.total_amount in dollars.
        appointmentTotal = Number(apptForBalance.total_amount);
      }
    }
  }

  // 8d. Per-refund source-plan enrichment.
  // refunds.notes carries a JSON {sources:[...]} breakdown (Session 4d). The
  // stripe_pi on each card source lets us look up card_brand + last_four from
  // payments. For split tender on this transaction, the local payments[] is
  // sufficient. For close-outs, sources point at SIBLING transactions whose
  // payments aren't in raw.payments — fall back to a single batched
  // payments-by-stripe-pi query when any pi isn't covered locally.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawRefunds = (raw.refunds ?? []) as any[];
  const refundsWithSources: Array<Record<string, unknown> & { sources?: RefundSource[] }> = [];
  // Pre-parse sources once so we can collect any stripe_pis missing from local payments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsedPerRefund: Array<{ refund: any; raw: ReturnType<typeof parseRefundSources> }> = rawRefunds.map((r) => ({
    refund: r,
    raw: parseRefundSources(r?.notes ?? null),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const localPayments = (raw.payments ?? []) as any[];
  const localPiSet = new Set<string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    localPayments.map((p: any) => p?.stripe_payment_intent_id).filter(Boolean)
  );
  const missingPis = new Set<string>();
  for (const { raw: sources } of parsedPerRefund) {
    if (!sources) continue;
    for (const s of sources) {
      if (s.method === 'card' && s.stripe_pi && !localPiSet.has(s.stripe_pi)) {
        missingPis.add(s.stripe_pi);
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let extendedPayments: any[] = localPayments;
  if (missingPis.size > 0) {
    const { data: extra } = await supabase
      .from('payments')
      .select('stripe_payment_intent_id, card_brand, card_last_four')
      .in('stripe_payment_intent_id', Array.from(missingPis));
    if (extra) extendedPayments = [...localPayments, ...extra];
  }
  for (const { refund, raw: sources } of parsedPerRefund) {
    if (!sources) {
      refundsWithSources.push(refund);
      continue;
    }
    const enriched = enrichRefundSources(sources, extendedPayments);
    refundsWithSources.push({ ...refund, sources: enriched });
  }

  // 8e. Loyalty footer balance snapshot (Phase 1A REVISED LOCKED-7).
  // Fires only when this transaction actually redeemed points — skip the
  // round-trip on the common no-loyalty path. Pulls the LATEST loyalty_ledger
  // row for this transaction (covers both the 'redeemed' write and any
  // subsequent 'earned' write that landed in the same checkout); that row's
  // points_balance is the post-transaction snapshot. NULL fallback when no
  // ledger row exists (pre-ledger historical transactions or data corruption)
  // — renderers degrade to showing only the "redeemed" line.
  let loyaltyBalanceAfterPts: number | null = null;
  if (Number(raw.loyalty_points_redeemed ?? 0) > 0) {
    const { data: ledgerRow } = await supabase
      .from('loyalty_ledger')
      .select('points_balance')
      .eq('transaction_id', raw.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    loyaltyBalanceAfterPts =
      ledgerRow?.points_balance == null ? null : Number(ledgerRow.points_balance);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    refunds: refundsWithSources as any,
    is_deposit: isDeposit,
    deposit_amount: isDeposit ? depositAmount : undefined,
    balance_due: isDeposit ? balanceDue : undefined,
    deposit_credit: raw.deposit_credit > 0 ? raw.deposit_credit : undefined,
    deposit_date: depositDate,
    linked_receipt: linkedReceipt,
    appointment_balance_due: appointmentBalanceDue,
    appointment_total: appointmentTotal,
    loyalty_balance_after_pts: loyaltyBalanceAfterPts,
  };

  return tx;
}
