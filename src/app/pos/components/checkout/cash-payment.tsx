'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { queueTransaction } from '@/lib/pos/offline-queue';
import { fromCents, toCents } from '@/lib/utils/refund-math';
import { PinPad } from '../pin-pad';

// Bill denominations rendered as 3×2 grid above the keypad. Tapping a
// denomination *increments* the tendered cents (Square / Toast / Clover
// convention), so $20 × 3 → $60. Matches the build prompt's Layout 2.
const DENOMINATIONS = [1, 5, 10, 20, 50, 100] as const;

// $99,999.99 hard cap — same value as keypad-tab.tsx / register-tab.tsx /
// payment-link-amount-modal.tsx. Inlined to avoid coupling to those files.
const CENTS_CAP = 9999999;

export function CashPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { granted: canOpenDrawer } = usePosPermission('pos.open_close_register');
  const isOnline = useOnlineStatus();

  const amountDue = ticket.total;
  const amountDueCents = toCents(amountDue);
  // Tendered amount lives as integer cents and entry is "fixed-decimal" —
  // every keypad digit shifts the value left by one column. Mirrors the
  // pattern in keypad-tab.tsx and payment-link-amount-modal.tsx.
  const [cents, setCents] = useState(0);
  const [processing, setProcessing] = useState(false);

  const tenderedDollars = fromCents(cents);
  const displayValue = tenderedDollars.toFixed(2);
  const changeCents = Math.max(0, cents - amountDueCents);
  const changeDollars = fromCents(changeCents);
  const shortDollars = fromCents(Math.max(0, amountDueCents - cents));
  const isValid = cents >= amountDueCents;

  function handleDigit(d: string) {
    if (d === '.') return; // Defensive — `.` is not rendered in amount layout.
    const next = d === '00' ? cents * 100 : cents * 10 + parseInt(d, 10);
    if (next > CENTS_CAP) return;
    setCents(next);
  }

  function handleBackspace() {
    setCents(Math.floor(cents / 10));
  }

  function handleDenomination(denom: number) {
    const next = cents + denom * 100;
    if (next > CENTS_CAP) return; // Reject denominations that would exceed the cap.
    setCents(next);
  }

  async function handleProcessCash() {
    if (!isValid) return;

    // tenderedNum and change are dollars, matching the existing API payload
    // shape and the setCashPayment(tendered, change) context contract used
    // by split-payment.tsx. Local state is cents; conversion happens here.
    const tenderedNum = tenderedDollars;
    const change = changeDollars;

    setProcessing(true);
    checkout.setProcessing(true);

    try {
      if (isOnline) {
        // Normal online flow
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
            total_amount: ticket.total,
            payment_method: 'cash',
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
            payments: [
              {
                method: 'cash',
                amount: amountDue,
                tip_amount: 0,
                cash_tendered: tenderedNum,
                change_given: change,
              },
            ],
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to process transaction');
        }

        // Fire-and-forget: kick cash drawer open via print server (skip if no permission)
        if (canOpenDrawer) {
          posFetch('/api/pos/receipts/cash-drawer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => { /* drawer kick is best-effort */ });
        }

        checkout.setCashPayment(tenderedNum, change);
        checkout.setComplete(
          json.data.id,
          json.data.receipt_number,
          ticket.customer?.email,
          ticket.customer?.phone,
          ticket.customer?.id,
          ticket.customer?.tags
        );
      } else {
        // Offline flow — queue to IndexedDB
        const offlineId = await queueTransaction({
          customer_id: ticket.customer?.id || null,
          customer_name: ticket.customer
            ? `${ticket.customer.first_name || ''} ${ticket.customer.last_name || ''}`.trim() || null
            : null,
          vehicle_id: ticket.vehicle?.id || null,
          subtotal: ticket.subtotal,
          tax_amount: ticket.taxAmount,
          discount_amount: ticket.discountAmount,
          total_amount: ticket.total,
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: ticket.notes,
          items: ticket.items.map((i) => {
            const hasPerUnitQty = i.perUnitQty != null && i.perUnitQty > 1;
            return {
              item_type: i.itemType as 'service' | 'product',
              product_id: i.productId || null,
              service_id: i.serviceId || null,
              item_name: i.itemName,
              quantity: hasPerUnitQty ? i.perUnitQty! : i.quantity,
              unit_price: hasPerUnitQty ? i.unitPrice / i.perUnitQty! : i.unitPrice,
              total_price: i.totalPrice,
              tax_amount: i.taxAmount,
              is_taxable: i.isTaxable,
              tier_name: i.tierName || null,
              vehicle_size_class: i.vehicleSizeClass || null,
              notes: i.notes || null,
            };
          }),
          cash_tendered: tenderedNum,
          cash_change: change,
        });

        toast.success(
          `Transaction saved offline (#${offlineId.slice(-6)}). Will sync when back online.`
        );

        checkout.setCashPayment(tenderedNum, change);
        // Use the offline ID as the transaction ID — receipt won't be available
        checkout.setComplete(
          offlineId,
          null,
          ticket.customer?.email,
          ticket.customer?.phone,
          ticket.customer?.id,
          ticket.customer?.tags
        );
      }

      dispatch({ type: 'CLEAR_TICKET' });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Payment failed'
      );
      checkout.setError(
        err instanceof Error ? err.message : 'Payment failed'
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 px-6 py-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Cash Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Offline — transaction will be queued and synced later</span>
        </div>
      )}

      {/* Tendered display + change/short box */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl text-gray-500 dark:text-gray-400">$</span>
          {/* Non-focusable display div — replaces native <input> so iPad
              won't pop the OS keyboard. Identical visual footprint to the
              former input (h-14 w-40, rounded-lg, text-2xl, tabular-nums). */}
          <div
            role="status"
            aria-live="polite"
            aria-label="Tendered amount"
            className="flex h-14 w-40 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-center text-2xl tabular-nums text-gray-900 dark:text-gray-100"
          >
            {displayValue}
          </div>
        </div>

        {cents > 0 && (
          <div
            className={cn(
              'rounded-lg px-6 py-2 text-center',
              isValid ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'
            )}
          >
            {isValid ? (
              <p className="text-base">
                Change:{' '}
                <span className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">
                  ${changeDollars.toFixed(2)}
                </span>
              </p>
            ) : (
              <p className="text-base text-red-600 dark:text-red-400 tabular-nums">
                Short ${shortDollars.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Denomination grid + Clear */}
      <div className="flex w-full max-w-xs flex-col gap-2">
        <div className="grid grid-cols-3 gap-2">
          {DENOMINATIONS.map((denom) => (
            <button
              key={denom}
              type="button"
              onClick={() => handleDenomination(denom)}
              className="flex h-14 items-center justify-center rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-lg font-semibold text-gray-700 dark:text-gray-300 transition-all hover:border-gray-300 dark:hover:border-gray-600 active:scale-[0.97] touch-manipulation"
            >
              ${denom}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCents(0)}
          disabled={cents === 0}
          className="flex h-12 items-center justify-center rounded-lg border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm font-medium text-red-600 dark:text-red-400 transition-all hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[0.99] touch-manipulation disabled:opacity-40 disabled:hover:bg-white dark:disabled:hover:bg-gray-900"
        >
          Clear
        </button>
      </div>

      {/* Keypad */}
      <div className="w-full max-w-xs">
        <PinPad
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          layoutVariant="amount"
          size="default"
        />
      </div>

      {checkout.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{checkout.error}</p>
      )}

      {/* Footer — Back + Complete */}
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          onClick={() => checkout.setStep('payment-method')}
          disabled={processing}
        >
          Back
        </Button>
        <Button
          size="lg"
          onClick={handleProcessCash}
          disabled={!isValid || processing}
          className="min-w-[160px] bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
        >
          {processing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            'Complete'
          )}
        </Button>
      </div>
    </div>
  );
}
