'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

export function CheckPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const amountDue = ticket.total;
  const [checkNumber, setCheckNumber] = useState('');
  const [processing, setProcessing] = useState(false);

  async function handleProcessCheck() {
    setProcessing(true);
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
          total_amount: ticket.total,
          payment_method: 'check',
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: checkNumber ? `Check #${checkNumber}${ticket.notes ? ` — ${ticket.notes}` : ''}` : ticket.notes,
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
            standard_price: i.standardPrice,
            pricing_type: i.pricingType,
            is_addon: !!i.parentItemId,
            prerequisite_note: i.prerequisiteNote || null,
          })),
          payments: [
            {
              method: 'check',
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
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Check Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {/* Check number input */}
      <div className="flex flex-col items-center gap-2">
        <label htmlFor="check-number" className="text-sm text-gray-600 dark:text-gray-400">
          Check number (optional)
        </label>
        <input
          id="check-number"
          type="text"
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          autoFocus
          className="h-14 w-48 rounded-lg border border-gray-300 dark:border-gray-600 text-center text-2xl tabular-nums text-gray-900 dark:text-gray-100 focus:border-amber-400 dark:focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-800"
          placeholder="#"
        />
      </div>

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
          onClick={handleProcessCheck}
          disabled={processing}
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
