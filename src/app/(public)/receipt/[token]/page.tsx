import { Metadata } from 'next';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatCurrency, formatDate, formatReceiptDateTime } from '@/lib/utils/format';
import { LOYALTY } from '@/lib/utils/constants';
import { getBusinessInfo } from '@/lib/data/business';
import { PrintButton } from './print-button';
import { cleanVehicleDescription } from '@/lib/utils/vehicle-helpers';
import { derivePaymentSourceLabel, type PaymentMethodLike } from '@/lib/utils/payment-source-label';
import { toCents } from '@/lib/utils/refund-math';

function formatDepositLabel(depositDate: string | null): string {
  if (!depositDate) return 'Deposit Paid - Online';
  const formatted = new Date(depositDate).toLocaleDateString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    timeZone: 'America/Los_Angeles',
  });
  return `Deposit Paid - Online on ${formatted}`;
}

interface TransactionWithRelations {
  id: string;
  status: string;
  receipt_number: string | null;
  transaction_date: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  coupon_code: string | null;
  loyalty_discount: number | null;
  loyalty_points_redeemed: number | null;
  tip_amount: number;
  total_amount: number;
  loyalty_points_earned: number;
  deposit_credit: number;
  deposit_date: string | null;
  is_deposit: boolean;
  deposit_amount: number;
  balance_due: number;
  linked_receipt: { receipt_number: string; label: string } | null;
  customer: { first_name: string; last_name: string } | null;
  employee: { first_name: string; last_name: string } | null;
  vehicle: { year: number | null; make: string | null; model: string | null; color: string | null } | null;
  items: {
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    tax_amount: number;
    item_type: string | null;
    standard_price: number | null;
    pricing_type: string | null;
    prerequisite_note: string | null;
    tier_name: string | null;
  }[];
  payments: {
    id: string;
    method: string;
    amount: number;
    tip_amount: number;
    card_brand: string | null;
    card_last_four: string | null;
    cash_tendered: number | null;
    change_given: number | null;
    /** When this payment row was created — for online-source date stamps. */
    created_at: string;
    /** Derived in getTransaction() from the joined transaction's notes prefix
     * when the receipt is appointment-linked. Absent for walk-in receipts. */
    source_label?: string | null;
  }[];
  /** Balance due on the linked appointment (cents). Defined only when
   * the receipt is appointment-linked (Fix 1 ensures all POS transactions
   * carry appointment_id when there is one). Renders as a "Balance Due"
   * row at the end of the Payment section, even at $0.00. */
  appointment_balance_due?: number;
  refunds: {
    id: string;
    amount: number;
    status: string;
    reason: string | null;
    points_clawed_back: number;
    points_restored: number;
    created_at: string;
    refund_items: {
      id: string;
      transaction_item_id: string;
      quantity: number;
      amount: number;
    }[];
  }[];
}

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getTransaction(token: string): Promise<TransactionWithRelations | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      customer:customers(first_name, last_name),
      employee:employees(first_name, last_name),
      vehicle:vehicles(year, make, model, color),
      items:transaction_items(*),
      payments(*),
      refunds(*, refund_items(*))
    `)
    .eq('access_token', token)
    .single();

  if (error || !data) return null;

  // Detect deposit receipt via linked appointment
  const raw = data as Record<string, unknown>;
  let isDeposit = false;
  let depositAmount = 0;
  let balanceDue = 0;
  let depositDate: string | null = null;

  if (raw.appointment_id) {
    const { data: appt } = await supabase
      .from('appointments')
      .select('payment_type, deposit_amount, total_amount')
      .eq('id', raw.appointment_id as string)
      .single();

    if (appt?.payment_type === 'deposit' && appt.deposit_amount != null && Number(appt.deposit_amount) > 0) {
      isDeposit = true;
      depositAmount = Number(appt.deposit_amount);
      balanceDue = Number(appt.total_amount) - depositAmount;
      depositDate = raw.transaction_date as string;
    }
  }

  // For balance payment receipts, find deposit date + receipt via job → appointment → deposit transaction
  let linkedReceipt: { receipt_number: string; label: string } | null = null;

  if (!isDeposit && Number(raw.deposit_credit) > 0) {
    const { data: linkedJob } = await supabase
      .from('jobs')
      .select('appointment_id')
      .eq('transaction_id', raw.id as string)
      .maybeSingle();

    if (linkedJob?.appointment_id) {
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

  // For deposit receipts, find the balance payment receipt via appointment → jobs → transaction
  if (isDeposit && raw.appointment_id) {
    const { data: balanceJob } = await supabase
      .from('jobs')
      .select('transaction_id')
      .eq('appointment_id', raw.appointment_id as string)
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

  // Employee fallback: online booking deposits have no employee
  const employee = (raw.employee as TransactionWithRelations['employee'])
    ?? (isDeposit ? { first_name: 'Online', last_name: 'Booking' } : null);

  // Appointment-linked: replace local payments[] with the FULL payment history
  // for that appointment (chronological), and compute Balance Due. Mirrors the
  // logic in src/lib/data/receipt-data.ts so the public page and the
  // template-rendered surfaces (HTML email, copier, thermal) stay in sync.
  // Walk-in receipts (appointment_id IS NULL) keep the locally joined
  // payments[] — no behavior change for those.
  let renderedPayments = (data as unknown as TransactionWithRelations).payments;
  let appointmentBalanceDue: number | undefined;

  if (raw.appointment_id) {
    const { data: appPayments } = await supabase
      .from('payments')
      .select(
        '*, transaction:transactions!inner(id, appointment_id, status, notes)'
      )
      .eq('transaction.appointment_id', raw.appointment_id as string)
      .eq('transaction.status', 'completed')
      .order('created_at', { ascending: true });

    if (appPayments) {
      renderedPayments = (appPayments as Array<Record<string, unknown>>).map((p) => {
        const txNotes = (p.transaction as { notes?: string | null } | null)?.notes ?? null;
        return {
          ...p,
          source_label: derivePaymentSourceLabel(txNotes, p.method as PaymentMethodLike),
        };
      }) as unknown as TransactionWithRelations['payments'];
    }

    const { data: apptForBalance } = await supabase
      .from('appointments')
      .select('total_amount')
      .eq('id', raw.appointment_id as string)
      .maybeSingle();

    if (apptForBalance) {
      const totalCents = toCents(Number(apptForBalance.total_amount));
      const paidCents = (renderedPayments ?? []).reduce(
        (sum, p) => sum + toCents(Number(p.amount)),
        0
      );
      appointmentBalanceDue = Math.max(0, totalCents - paidCents);
    }
  }

  return {
    ...(data as unknown as TransactionWithRelations),
    employee,
    is_deposit: isDeposit,
    deposit_amount: depositAmount,
    balance_due: balanceDue,
    deposit_date: depositDate,
    linked_receipt: linkedReceipt,
    payments: renderedPayments,
    appointment_balance_due: appointmentBalanceDue,
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const [tx, businessInfo] = await Promise.all([getTransaction(token), getBusinessInfo()]);

  if (!tx) {
    return {
      title: `Receipt Not Found | ${businessInfo.name}`,
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `Receipt ${tx.receipt_number || ''} | ${businessInfo.name}`,
    description: `View your receipt from ${businessInfo.name}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicReceiptPage({ params }: PageProps) {
  const { token } = await params;
  const [tx, businessInfo] = await Promise.all([getTransaction(token), getBusinessInfo()]);

  if (!tx) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-site-text">Receipt Not Found</h1>
        <p className="mt-2 text-site-text-muted">
          This receipt link is invalid or has expired. Please contact us for assistance.
        </p>
      </div>
    );
  }

  const receiptId = tx.receipt_number || `SD-${tx.id.slice(0, 6).toUpperCase()}`;

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

      {/* Deposit Badge */}
      {tx.is_deposit && (
        <div className="mb-4 text-center">
          <span className="inline-block rounded px-3 py-1 text-sm font-bold text-white bg-blue-600">
            BOOKING DEPOSIT
          </span>
        </div>
      )}

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
                  Loyalty{tx.loyalty_points_redeemed ? ` (${tx.loyalty_points_redeemed} pts)` : ''}
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
            {tx.is_deposit && tx.deposit_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">{formatDepositLabel(tx.deposit_date)}</span>
                <span className="font-medium text-green-500">
                  -{formatCurrency(tx.deposit_amount)}
                </span>
              </div>
            )}
            {!tx.is_deposit && tx.deposit_credit > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-site-text-muted">{formatDepositLabel(tx.deposit_date)}</span>
                <span className="font-medium text-blue-500">
                  -{formatCurrency(tx.deposit_credit)}
                </span>
              </div>
            )}
            <div className="flex justify-between border-t border-site-border pt-2">
              <span className="text-base font-semibold text-site-text">
                {tx.is_deposit ? 'Total Charged' : 'Total'}
              </span>
              <span className="text-lg font-bold text-site-text">
                {formatCurrency(tx.is_deposit ? tx.total_amount : tx.total_amount + tx.tip_amount)}
              </span>
            </div>
            {tx.is_deposit && tx.balance_due > 0 && (
              <>
                <div className="flex justify-between pt-1">
                  <span className="text-sm font-semibold text-amber-500">Est. Balance Due at Service</span>
                  <span className="text-base font-bold text-amber-500">
                    {formatCurrency(tx.balance_due)}
                  </span>
                </div>
                <p className="text-xs text-site-text-muted italic text-center mt-1">
                  Final balance may include additional services
                </p>
              </>
            )}
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
      {(tx.payments.length > 0 || tx.appointment_balance_due !== undefined) && (
        <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm">
          <h3 className="text-sm font-medium text-site-text-secondary">Payment</h3>
          <div className="mt-2 space-y-1">
            {tx.payments.map((p) => {
              // Online sources (pay link, booking deposit) → "Source · date".
              // In-store card → "VISA ending in 1234" (existing behavior).
              // Cash/check → method.toUpperCase() OR source_label.
              const isOnlineSource =
                p.source_label === 'Online (pay link)' ||
                p.source_label === 'Booking deposit';
              let label: string;
              if (isOnlineSource) {
                label = `${p.source_label} · ${formatReceiptDateTime(p.created_at)}`;
              } else if (p.method === 'card' && p.card_brand) {
                label = `${p.card_brand} ending in ${p.card_last_four || '****'}`;
              } else {
                label = p.method.charAt(0).toUpperCase() + p.method.slice(1);
              }
              // Cash-only Tendered/Change sub-rows. Historical cash rows have
              // cash_tendered NULL → no extra rows render. Non-cash rows can
              // never have these populated (server validates), so no method
              // guard needed beyond the != null check.
              const showTender = p.method === 'cash' && p.cash_tendered != null;
              const change = showTender
                ? p.change_given ?? Math.max(0, (p.cash_tendered as number) - p.amount)
                : 0;
              return (
                <div key={p.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-site-text-muted">{label}</span>
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
            {/* Balance Due — appointment-linked only, always render. */}
            {tx.appointment_balance_due !== undefined && (
              <div className="flex justify-between text-sm pt-2 border-t border-site-border mt-2">
                <span className="font-medium text-site-text">Balance Due</span>
                <span className="font-medium text-site-text tabular-nums">
                  {formatCurrency(tx.appointment_balance_due / 100)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Points Earned */}
      {tx.customer && tx.loyalty_points_earned > 0 && (
        <div className="mb-8 rounded-lg border border-site-border bg-brand-dark px-6 py-4 shadow-sm text-center">
          <p className="text-sm text-green-500 font-medium">
            Points Earned Today: {tx.loyalty_points_earned} ({formatCurrency(tx.loyalty_points_earned * LOYALTY.REDEEM_RATE)} loyalty cash)
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
