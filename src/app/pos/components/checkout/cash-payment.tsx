'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosAuth } from '../../context/pos-auth-context';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { queueTransaction } from '@/lib/pos/offline-queue';

const QUICK_TENDERS = [20, 50, 100];

export function CashPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { employee } = usePosAuth();
  const isOnline = useOnlineStatus();

  const amountDue = ticket.total;
  const [tendered, setTendered] = useState('');
  const [processing, setProcessing] = useState(false);

  const tenderedNum = parseFloat(tendered) || 0;
  const change = Math.max(0, tenderedNum - amountDue);
  const isValid = tenderedNum >= amountDue;

  async function handleProcessCash() {
    if (!isValid) return;

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
            total_amount: ticket.total,
            payment_method: 'cash',
            coupon_id: ticket.coupon?.id || null,
            coupon_code: ticket.coupon?.code || null,
            loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
            loyalty_discount: ticket.loyaltyDiscount,
            notes: ticket.notes,
            items: ticket.items.map((i) => ({
              item_type: i.itemType,
              product_id: i.productId,
              service_id: i.serviceId,
              item_name: i.itemName,
              quantity: i.quantity,
              unit_price: i.unitPrice,
              total_price: i.totalPrice,
              tax_amount: i.taxAmount,
              is_taxable: i.isTaxable,
              tier_name: i.tierName,
              vehicle_size_class: i.vehicleSizeClass,
              notes: i.notes,
            })),
            payments: [
              {
                method: 'cash',
                amount: amountDue,
                tip_amount: 0,
              },
            ],
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to process transaction');
        }

        // Fire-and-forget: kick cash drawer open via print server
        posFetch('/api/pos/receipts/cash-drawer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => { /* drawer kick is best-effort */ });

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
          items: ticket.items.map((i) => ({
            item_type: i.itemType as 'service' | 'product',
            product_id: i.productId || null,
            service_id: i.serviceId || null,
            item_name: i.itemName,
            quantity: i.quantity,
            unit_price: i.unitPrice,
            total_price: i.totalPrice,
            tax_amount: i.taxAmount,
            is_taxable: i.isTaxable,
            tier_name: i.tierName || null,
            vehicle_size_class: i.vehicleSizeClass || null,
            notes: i.notes || null,
          })),
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
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
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

      {/* Quick tender buttons */}
      <div className="flex gap-3">
        {QUICK_TENDERS.map((amt) => (
          <button
            key={amt}
            onClick={() => setTendered(amt.toString())}
            disabled={amt < amountDue}
            className={cn(
              'h-14 w-20 rounded-lg border-2 text-lg font-semibold transition-all',
              tendered === amt.toString()
                ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600',
              amt < amountDue && 'opacity-40'
            )}
          >
            ${amt}
          </button>
        ))}
        <button
          onClick={() => setTendered(amountDue.toFixed(2))}
          className={cn(
            'h-14 rounded-lg border-2 px-4 text-lg font-semibold transition-all',
            tendered === amountDue.toFixed(2)
              ? 'border-green-500 dark:border-green-600 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
          )}
        >
          Exact
        </button>
      </div>

      {/* Custom amount input */}
      <div className="flex items-center gap-2">
        <span className="text-xl text-gray-500 dark:text-gray-400">$</span>
        <input
          type="text"
          inputMode="decimal"
          pattern="[0-9]*\.?[0-9]*"
          value={tendered}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.]/g, '');
            setTendered(v);
          }}
          className="h-14 w-40 rounded-lg border border-gray-300 dark:border-gray-600 text-center text-2xl tabular-nums text-gray-900 dark:text-gray-100 focus:border-green-400 dark:focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-200 dark:focus:ring-green-800"
          placeholder="0.00"
        />
      </div>

      {/* Change display */}
      {tenderedNum > 0 && (
        <div
          className={cn(
            'rounded-lg px-6 py-3 text-center',
            isValid ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'
          )}
        >
          {isValid ? (
            <p className="text-lg">
              Change:{' '}
              <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                ${change.toFixed(2)}
              </span>
            </p>
          ) : (
            <p className="text-lg text-red-600 dark:text-red-400">
              Short ${(amountDue - tenderedNum).toFixed(2)}
            </p>
          )}
        </div>
      )}

      {checkout.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{checkout.error}</p>
      )}

      {/* Actions */}
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
