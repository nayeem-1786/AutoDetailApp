'use client';

import { useState } from 'react';
import { Banknote, CreditCard, FileText, Split, Smartphone, WifiOff, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { posFetch } from '../../lib/pos-fetch';

export function PaymentMethodScreen() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { setPaymentMethod, setStep, closeCheckout } = checkout;
  const { granted: canProcessCard } = usePosPermission('pos.process_card');
  const { granted: canProcessCash } = usePosPermission('pos.process_cash');
  const { granted: canProcessSplit } = usePosPermission('pos.process_split');
  const isOnline = useOnlineStatus();
  const [closingOut, setClosingOut] = useState(false);

  // Close-out path: appointment is fully covered by prior payments, so there's
  // nothing left to tender. Submit a $0 transaction (no payments rows) and
  // jump to the Payment Complete screen, bypassing the tender selector.
  const isCloseOut = ticket.total === 0 && ticket.priorPayments.length > 0;

  function handleSelect(method: 'cash' | 'card' | 'check' | 'split' | 'digital') {
    setPaymentMethod(method);
    setStep(method);
  }

  async function handleCloseOut() {
    if (closingOut) return;
    setClosingOut(true);
    checkout.setProcessing(true);
    try {
      const res = await posFetch('/api/pos/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer?.id || null,
          vehicle_id: ticket.vehicle?.id || null,
          subtotal: ticket.subtotal,
          tax_amount: ticket.taxAmount,
          tip_amount: 0,
          discount_amount: ticket.discountAmount,
          deposit_credit: ticket.depositCredit,
          total_amount: 0,
          payment_method: null,
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: ticket.notes,
          items: ticket.items.map((i) => {
            const hasPerUnitQty = i.perUnitQty != null && i.perUnitQty > 1;
            return {
              item_type: i.itemType,
              product_id: i.productId,
              service_id: i.serviceId,
              item_name: i.itemName,
              quantity: hasPerUnitQty ? i.perUnitQty! : i.quantity,
              unit_price: hasPerUnitQty ? i.unitPrice / i.perUnitQty! : i.unitPrice,
              total_price: i.totalPrice,
              tax_amount: i.taxAmount,
              is_taxable: i.isTaxable,
              tier_name: i.tierName,
              vehicle_size_class: i.vehicleSizeClass,
              notes: i.notes,
              standard_price: hasPerUnitQty ? i.standardPrice / i.perUnitQty! : i.standardPrice,
              pricing_type: i.pricingType,
              is_addon: !!i.parentItemId,
              prerequisite_note: i.prerequisiteNote || null,
            };
          }),
          payments: [],
          close_out: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to close out');
      }
      checkout.setComplete(
        json.data.id,
        json.data.receipt_number,
        ticket.customer?.email,
        ticket.customer?.phone,
        ticket.customer?.id,
        ticket.customer?.tags
      );
      dispatch({ type: 'CLEAR_TICKET' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Close out failed';
      toast.error(msg);
      checkout.setError(msg);
    } finally {
      setClosingOut(false);
      checkout.setProcessing(false);
    }
  }

  if (isCloseOut) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
        <div className="text-center">
          <p className="text-lg text-gray-500 dark:text-gray-400">Balance Due</p>
          <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">$0.00</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Fully covered by prior payments — nothing to tender.
          </p>
        </div>

        {checkout.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{checkout.error}</p>
        )}

        <Button
          size="lg"
          onClick={handleCloseOut}
          disabled={closingOut}
          className="min-w-[200px] bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 gap-2"
        >
          {closingOut ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
          {closingOut ? 'Closing Out…' : 'Close Out'}
        </Button>

        <Button variant="outline" onClick={closeCheckout} disabled={closingOut}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Payment method</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${ticket.total.toFixed(2)}
        </p>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>You&apos;re offline — only cash payments are available</span>
        </div>
      )}

      <div className="flex gap-6">
        <button
          onClick={() => handleSelect('cash')}
          disabled={!canProcessCash}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            canProcessCash
              ? 'hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
          title={!canProcessCash ? 'You do not have permission to process cash payments' : undefined}
        >
          <Banknote className="h-8 w-8 text-green-600 dark:text-green-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cash</span>
        </button>

        <button
          onClick={() => handleSelect('card')}
          disabled={!isOnline || !canProcessCard}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline && canProcessCard
              ? 'hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
          title={!canProcessCard ? 'You do not have permission to process card payments' : undefined}
        >
          <CreditCard className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Card</span>
        </button>

        <button
          onClick={() => handleSelect('check')}
          disabled={!isOnline || !canProcessCash}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline && canProcessCash
              ? 'hover:border-amber-400 dark:hover:border-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
          title={!canProcessCash ? 'You do not have permission to process check payments' : undefined}
        >
          <FileText className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Check</span>
        </button>

        <button
          onClick={() => handleSelect('split')}
          disabled={!isOnline || !canProcessSplit}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            isOnline && canProcessSplit
              ? 'hover:border-purple-400 hover:bg-purple-50 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
          title={!canProcessSplit ? 'You do not have permission to process split payments' : undefined}
        >
          <Split className="h-8 w-8 text-purple-600" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Split</span>
        </button>

        {/* Phase 1A.5 Part A: Digital payment (Zelle/Venmo/AppleCash/Other).
            Gates under pos.process_cash — digital is cash-equivalent for
            settlement (no card fee, no PCI scope). Offline path is allowed:
            digital payments don't require an online round-trip, but staff
            should be online to log them so the transaction reaches the
            offline queue cleanly. */}
        <button
          onClick={() => handleSelect('digital')}
          disabled={!canProcessCash}
          className={cn(
            'flex h-32 w-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 transition-all',
            canProcessCash
              ? 'hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-[0.97]'
              : 'cursor-not-allowed opacity-40'
          )}
          title={!canProcessCash ? 'You do not have permission to process digital payments' : undefined}
        >
          <Smartphone className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">Digital</span>
        </button>
      </div>

      <Button
        variant="outline"
        onClick={closeCheckout}
        className="mt-4"
      >
        Back
      </Button>
    </div>
  );
}
