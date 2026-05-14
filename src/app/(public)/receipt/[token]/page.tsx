import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency, formatMoney, formatDate, formatReceiptDateTime } from '@/lib/utils/format';
import { LOYALTY } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { PrintButton } from './print-button';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { formatCardBrand } from '@/lib/utils/card-brand';
import { fetchReceiptTransaction } from '@/lib/data/receipt-data';
import type { ReceiptTransaction } from '@/app/pos/lib/receipt-template';
import {
  buildSuggestedLabelForPayment,
  composeLoyaltyFooter,
  RECEIPT_VOCAB,
} from '@/lib/data/receipt-composer';
import { toCents } from '@/lib/utils/refund-math';

// Phase 1A: replicate the renderer-side first-with-remainder derivation so
// the JSX payment loop can construct labels via the composer helper without
// duplicating logic. Mirrors buildFirstWithRemainderFlags in receipt-template.ts.
function buildFirstWithRemainderFlags(
  payments: ReadonlyArray<{ amount: number }>,
  appointmentTotal: number | undefined
): boolean[] {
  if (payments.length === 0) return [];
  const apptCents = appointmentTotal == null ? 0 : toCents(appointmentTotal);
  const flags = new Array<boolean>(payments.length).fill(false);
  if (payments.length > 0) {
    const firstCents = toCents(Number(payments[0].amount ?? 0));
    flags[0] = apptCents > 0 && firstCents < apptCents;
  }
  return flags;
}

interface PageProps {
  params: Promise<{ token: string }>;
}

/**
 * Resolve a public access token → ReceiptTransaction.
 *
 * Phase 0b.2 consolidation: this used to inline ~190 LOC of data-fetch
 * logic that duplicated src/lib/data/receipt-data.ts (deposit detection,
 * appointment-payment aggregation, balance-due math, refund-source
 * enrichment). Now it routes through fetchReceiptTransaction so the
 * composer-backed shape is single-sourced. The page consumes the same
 * ReceiptTransaction shape the print + email + thermal renderers do.
 *
 * Returns `{ id, tx }` — the resolved DB id (used by the page for the
 * SD-${id.slice(0,6)} fallback receipt-number badge) plus the rendered
 * transaction.
 */
async function resolveTokenToReceipt(
  token: string
): Promise<{ id: string; tx: ReceiptTransaction } | null> {
  const supabase = createAdminClient();

  const { data: row, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('access_token', token)
    .maybeSingle();

  if (error || !row?.id) return null;

  try {
    const tx = await fetchReceiptTransaction(supabase, row.id);
    return { id: row.id, tx };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [resolved, businessInfo] = await Promise.all([
    resolveTokenToReceipt(token),
    getBusinessInfo(),
  ]);

  if (!resolved) {
    return {
      title: `Receipt Not Found | ${businessInfo.name}`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Receipt ${resolved.tx.receipt_number || ''} | ${businessInfo.name}`,
    description: `View your receipt from ${businessInfo.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicReceiptPage({ params }: PageProps) {
  const { token } = await params;
  const [resolved, businessInfo] = await Promise.all([
    resolveTokenToReceipt(token),
    getBusinessInfo(),
  ]);

  if (!resolved) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-site-text">Receipt Not Found</h1>
        <p className="mt-2 text-site-text-muted">
          This receipt link is invalid or has expired. Please contact us for assistance.
        </p>
      </div>
    );
  }

  const { id, tx } = resolved;
  const receiptId = tx.receipt_number || `SD-${id.slice(0, 6).toUpperCase()}`;

  // Build refund data
  const processedRefunds = (tx.refunds ?? []).filter((r) => r.status === 'processed');
  const refundedMap = new Map<string, { qty: number; amount: number }>();
  for (const refund of processedRefunds) {
    for (const ri of refund.refund_items) {
      const existing = refundedMap.get(ri.transaction_item_id) ?? { qty: 0, amount: 0 };
      existing.qty += ri.quantity;
      existing.amount += ri.amount;
      refundedMap.set(ri.transaction_item_id, existing);
    }
  }
  const allFullyRefunded = processedRefunds.length > 0 && tx.items.every((item) => {
    const r = refundedMap.get(item.id);
    return r && r.qty >= item.quantity;
  });
  const refundStatus: 'none' | 'partial' | 'full' = processedRefunds.length === 0
    ? 'none'
    : allFullyRefunded ? 'full' : 'partial';

  const vehicleStr = tx.vehicle
    ? cleanVehicleDescription({ year: tx.vehicle.year, make: tx.vehicle.make, model: tx.vehicle.model }) || null
    : null;
  const customerName = tx.customer
    ? `${tx.customer.first_name} ${tx.customer.last_name}`
    : null;
  const employeeName = tx.employee
    ? `${tx.employee.first_name} ${tx.employee.last_name}`
    : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      {/* Business Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-site-text">{businessInfo.name}</h1>
        <p className="mt-1 text-sm text-site-text-muted">{businessInfo.address}</p>
      </div>

      {/* Voided Banner */}
      {tx.status === 'voided' && (
        <div className="mb-4 rounded-lg bg-red-600 px-6 py-3 text-center">
          <span className="text-lg font-bold tracking-widest text-white">VOIDED</span>
          <p className="mt-1 text-xs text-red-100">This transaction has been voided and is no longer valid.</p>
        </div>
      )}

      {/* Phase 1A LOCKED-5: BOOKING DEPOSIT badge retired. */}

      {/* Receipt Header */}
      <div className="mb-8 rounded-lg border border-site-border bg-brand-dark p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-site-text">
              Receipt {receiptId}
            </h2>
            {tx.status === 'voided' && (
              <span className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold text-white bg-red-600">
                VOIDED
              </span>
            )}
            {tx.status !== 'voided' && refundStatus !== 'none' && (
              <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold text-white ${refundStatus === 'full' ? 'bg-red-600' : 'bg-amber-500'}`}>
                {refundStatus === 'full' ? 'REFUNDED' : 'PARTIALLY REFUNDED'}
              </span>
            )}
            <p className="mt-1 text-sm text-site-text-muted">
              Date: {formatReceiptDateTime(tx.transaction_date)}
            </p>
            {customerName && (
              <p className="text-sm text-site-text-muted">
                Customer: {customerName}
              </p>
            )}
          </div>
          <div className="text-right">
            {vehicleStr && (
              <p className="text-sm font-medium text-site-text">{vehicleStr}</p>
            )}
            {tx.vehicle?.color && (
              <p className="text-sm text-site-text-muted">{tx.vehicle.color}</p>
            )}
            {employeeName && (
              <p className="mt-1 text-sm text-site-text-muted">
                Served by: {employeeName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-6 overflow-hidden rounded-lg border border-site-border bg-brand-dark shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-site-border bg-brand-dark">
                <th className="px-6 py-3 text-left font-medium text-site-text-muted">Item</th>
                <th className="px-4 py-3 text-center font-medium text-site-text-muted">Qty</th>
                <th className="px-4 py-3 text-right font-medium text-site-text-muted">Unit Price</th>
                <th className="px-6 py-3 text-right font-medium text-site-text-muted">Total</th>
              </tr>
            </thead>
            <tbody>
              {tx.items.map((item) => {
                const itemRefund = refundedMap.get(item.id);
                const isFullyRefunded = itemRefund && itemRefund.qty >= item.quantity;
                return (
                  <tr key={item.id} className="border-b border-site-border">
                    <td className="px-6 py-4">
                      <div className={`font-medium ${isFullyRefunded ? 'line-through text-site-text-muted' : 'text-site-text'}`}>
                        {item.item_name}
                        {item.tier_name && item.tier_name !== 'default' && (
                          <span className="text-site-text-muted font-normal"> — {item.tier_name}</span>
                        )}
                      </div>
                      {item.pricing_type && item.pricing_type !== 'standard' && item.standard_price != null && item.standard_price > item.unit_price && (
                        <div className="text-xs text-green-500 mt-0.5">
                          {item.pricing_type === 'combo' ? 'Combo' : 'Sale'}: Reg {formatCurrency(item.standard_price)} | Saved {formatCurrency(item.standard_price - item.unit_price)}!
                        </div>
                      )}
                      {item.prerequisite_note && (
                        <div className="text-xs text-blue-500 mt-0.5">{item.prerequisite_note}</div>
                      )}
                      {itemRefund && (
                        <div className="text-xs text-red-500 mt-0.5">
                          REFUNDED ({itemRefund.qty}) -{formatCurrency(itemRefund.amount)}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center text-site-text-muted">{item.quantity}</td>
                    <td className="px-4 py-4 text-right text-site-text-muted">
                      {formatCurrency(item.unit_price)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-site-text">
                      {formatCurrency(item.total_price)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-site-border bg-brand-dark px-6 py-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-site-text-muted">Subtotal</span>
              <span className="font-medium text-site-text">{formatCurrency(tx.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-site-text-muted">Tax</span>
              <span className="font-medium text-site-text">
                {formatCurrency(tx.tax_amount)}
              </span>
            </div>
            {(() => {
              const nonLoyaltyDiscount = tx.discount_amount - (tx.loyalty_discount || 0);
              return nonLoyaltyDiscount > 0 ? (
                <div className="flex justify-between text-sm">
                  <span className="text-site-text-muted">
                    {tx.coupon_code ? `Coupon (${tx.coupon_code})` : 'Discount'}
                  </span>
                  <span className="font-medium text-amber-400">
                    -{formatCurrency(nonLoyaltyDiscount)}
                  </span>
                </div>
              ) : null;
            })()}
            {tx.loyalty_discount != null && tx.loyalty_discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">
                  {RECEIPT_VOCAB.LOYALTY_LABEL}{tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : ''}
                </span>
                <span className="font-medium text-amber-400">
                  -{formatCurrency(tx.loyalty_discount!)}
                </span>
              </div>
            )}
            {tx.tip_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">Tip</span>
                <span className="font-medium text-site-text">
                  {formatCurrency(tx.tip_amount)}
                </span>
              </div>
            )}
            {/* Phase 1A LOCKED-5: deposit chrome retired. Deposit-paid lines
                (both is_deposit and deposit_credit branches), "Total Charged"
                relabel, "Est. Balance Due at Service" amber row, and the
                "Final balance may include additional services" footnote
                are all gone. Deposits appear as payment rows below. */}
            <div className="flex justify-between border-t border-site-border pt-2">
              <span className="text-base font-semibold text-site-text">Total</span>
              <span className="text-lg font-bold text-site-text">
                {/* Use the larger of appointment_total and transaction.total_amount.
                    Handles both close-out shells (transaction is $0, appointment carries
                    gross) AND in-store sales that exceed appointment value (transaction
                    carries gross, appointment is stale). Mirrors the receipt-template.ts
                    policy. */}
                {formatCurrency(Math.max(tx.appointment_total ?? 0, tx.total_amount ?? 0) + tx.tip_amount)}
              </span>
            </div>
            {tx.linked_receipt && (
              <div className="pt-2 text-center">
                <span className="text-xs text-blue-500">
                  See also: {tx.linked_receipt.label} #{tx.linked_receipt.receipt_number}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Refund Summary */}
      {processedRefunds.length > 0 && (
        <div className="mb-6 space-y-3">
          {processedRefunds.map((refund) => (
            <div key={refund.id} className="rounded-lg border border-red-200 bg-red-50 px-6 py-4 shadow-sm" style={{ borderLeft: '3px solid #dc2626' }}>
              <p className="text-sm font-bold text-red-600">Refund</p>
              <p className="text-xs text-site-text-muted mt-1">
                {formatDate(refund.created_at)}
              </p>
              {refund.reason && (
                <p className="text-xs text-site-text-muted">Reason: {refund.reason}</p>
              )}
              <p className="text-sm font-bold text-red-600 mt-1">
                -{formatCurrency(refund.amount)}
              </p>
              {refund.points_clawed_back > 0 && (
                <p className="text-xs text-red-500 mt-1">Points Reversed: -{refund.points_clawed_back}</p>
              )}
              {refund.points_restored > 0 && (
                <p className="text-xs text-green-500 mt-1">Points Restored: +{refund.points_restored}</p>
              )}
              {/* Per-method "Refunded to:" — only when the engine wrote a
                  JSON {sources:[...]} breakdown into refunds.notes. Stripe
                  refund id is intentionally hidden on the public/customer
                  receipt — staff use the POS detail view for reconciliation. */}
              {refund.sources && refund.sources.length > 0 && (
                <div className="mt-3 pt-2 border-t border-red-200">
                  <p className="text-[10px] uppercase tracking-wide text-site-text-muted mb-1">Refunded to</p>
                  <div className="space-y-0.5">
                    {refund.sources.map((source, i) => {
                      const label = source.method === 'cash'
                        ? 'Cash'
                        : source.method === 'card'
                          ? source.card_last_four
                            ? `Card (${formatCardBrand(source.card_brand)} ****${source.card_last_four})`
                            : (formatCardBrand(source.card_brand) === 'Card'
                                ? 'Card'
                                : `Card (${formatCardBrand(source.card_brand)})`)
                          : source.method.charAt(0).toUpperCase() + source.method.slice(1);
                      return (
                        <div key={i} className="flex justify-between text-xs text-site-text">
                          <span>{label}</span>
                          <span className="tabular-nums">-{formatCurrency(Number(source.amount))}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payment Methods.
          For appointment-linked receipts, payments[] is the FULL appointment
          payment history (Fix 2). For walk-in receipts it's just this
          transaction's payments (no behavior change). Render condition is
          intentionally NOT `payments.length > 0` for appointment-linked rows
          because we still want a Balance Due line at $0.00 to appear; the
          appointment_balance_due flag opens the section even when payments
          is empty (which won't happen in practice — close-out always has
          at least one prior payment that triggered the close-out path). */}
      {(tx.payments.length > 0 || tx.appointment_balance_due !== undefined) && (() => {
        // Phase 1A LOCKED-9 + LOCKED-6: unified composer label, no width wrap
        // (public page has plenty of horizontal room). LOCKED-2 + LOCKED-3:
        // Total Paid row + Paid in Full ✓ conditional. REVISED LOCKED-7:
        // loyalty footer below balance row.
        const firstWithRemainder = buildFirstWithRemainderFlags(tx.payments, tx.appointment_total);
        let totalPaidCents = 0;
        for (const p of tx.payments) totalPaidCents += toCents(Number(p.amount ?? 0));
        const loyaltyFooter = composeLoyaltyFooter(tx.loyalty_points_redeemed, tx.loyalty_balance_after_pts);
        // Phase 1A-followup FIX 2: legacy walk-in fallback. Falls back to
        // transaction-level totals when appointment_balance_due is undefined
        // (pre-Phase-0a txns without an appointment).
        const appointmentTotalCents = toCents(Number(tx.appointment_total ?? 0));
        const transactionTotalCents = toCents(Number(tx.total_amount ?? 0));
        const fallbackBalanceCents = Math.max(0, transactionTotalCents - totalPaidCents);
        const resolvedBalanceCents = tx.appointment_balance_due !== undefined
          ? tx.appointment_balance_due
          : (tx.payments.length > 0 && transactionTotalCents > 0 ? fallbackBalanceCents : undefined);
        const billingTotalCents = Math.max(appointmentTotalCents, transactionTotalCents);
        const isPaidInFullStatus = tx.status !== 'voided' && tx.status !== 'refunded' && tx.status !== 'partial_refund';
        const isPaidInFull = resolvedBalanceCents === 0 && billingTotalCents > 0 && isPaidInFullStatus;
        return (
          <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm">
            <h3 className="text-sm font-medium text-site-text-secondary">Payment</h3>
            <div className="mt-2 space-y-1">
              {tx.payments.map((p, i) => {
                const combined = buildSuggestedLabelForPayment(
                  {
                    method: p.method,
                    card_brand: p.card_brand,
                    card_last_four: p.card_last_four,
                    source_label: p.source_label,
                    created_at: p.created_at,
                    digital_platform: p.digital_platform,
                  },
                  firstWithRemainder[i]
                );
                const showTender = p.method === 'cash' && p.cash_tendered != null;
                const change = showTender
                  ? p.change_given ?? Math.max(0, (p.cash_tendered as number) - p.amount)
                  : 0;
                return (
                  <div key={p.id ?? i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-site-text-muted">{combined}</span>
                      <span className="font-medium text-site-text">{formatCurrency(p.amount)}</span>
                    </div>
                    {showTender && (
                      <>
                        <div className="flex justify-between text-xs pl-4">
                          <span className="text-site-text-muted">Tendered</span>
                          <span className="text-site-text-muted tabular-nums">
                            {formatCurrency(p.cash_tendered as number)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs pl-4">
                          <span className="text-site-text-muted">Change</span>
                          <span className="text-site-text-muted tabular-nums">
                            {formatCurrency(change)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {/* Total Paid (LOCKED-2) — between payments and Balance Due / Paid in Full. */}
              {tx.payments.length > 0 && (
                <div className="flex justify-between text-sm pt-2 border-t border-site-border mt-2">
                  <span className="font-medium text-site-text">{RECEIPT_VOCAB.TOTAL_PAID}</span>
                  <span className="font-medium text-site-text tabular-nums">
                    {formatMoney(totalPaidCents)}
                  </span>
                </div>
              )}
              {/* Phase 1A-followup FIX 2: Paid in Full ✓ or Balance Due,
                  using the resolved balance (appointment-aggregated or
                  transaction-level fallback for legacy walk-ins). */}
              {resolvedBalanceCents !== undefined && (
                isPaidInFull ? (
                  <div className="text-center text-sm font-semibold text-green-500 pt-1">
                    {RECEIPT_VOCAB.PAID_IN_FULL_INDICATOR}
                  </div>
                ) : (
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-site-text">{RECEIPT_VOCAB.BALANCE_DUE}</span>
                    <span className="font-medium text-site-text tabular-nums">
                      {formatMoney(resolvedBalanceCents)}
                    </span>
                  </div>
                )
              )}
              {/* Loyalty footer (REVISED LOCKED-7). */}
              {loyaltyFooter.show && (
                <div className="pt-2 mt-2 border-t border-site-border space-y-0.5 text-center">
                  <p className="text-xs text-site-text-muted">
                    {RECEIPT_VOCAB.LOYALTY_REDEEMED_PREFIX} {loyaltyFooter.redeemed_pts} pts
                  </p>
                  {loyaltyFooter.balance_after_pts != null && (
                    <p className="text-xs text-site-text-muted">
                      {RECEIPT_VOCAB.LOYALTY_BALANCE_PREFIX} {loyaltyFooter.balance_after_pts} {RECEIPT_VOCAB.LOYALTY_BALANCE_SUFFIX}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Points Earned */}
      {tx.customer && (tx.loyalty_points_earned ?? 0) > 0 && (
        <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm text-center">
          <p className="text-sm text-green-500 font-medium">
            Points Earned Today: {tx.loyalty_points_earned} ({formatCurrency((tx.loyalty_points_earned ?? 0) * LOYALTY.REDEEM_RATE)} loyalty cash)
          </p>
        </div>
      )}
      {!tx.customer && (() => {
        const hypotheticalPoints = Math.floor(tx.subtotal * LOYALTY.EARN_RATE);
        if (hypotheticalPoints <= 0) return null;
        return (
          <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm text-center">
            <p className="text-sm text-green-500 font-medium">
              Join our rewards program — this visit would&apos;ve earned you {formatCurrency(hypotheticalPoints * LOYALTY.REDEEM_RATE)} off!
            </p>
          </div>
        );
      })()}

      {/* Print Button */}
      <div className="text-center">
        <PrintButton />
      </div>
    </div>
  );
}
