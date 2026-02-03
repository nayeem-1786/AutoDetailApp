'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
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
      const res = await fetch('/api/pos/transactions', {
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

      checkout.setComplete(
        json.data.id,
        json.data.receipt_number,
        ticket.customer?.email,
        ticket.customer?.phone
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
        <p className="text-lg text-gray-500">Check Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {/* Check number input */}
      <div className="flex flex-col items-center gap-2">
        <label htmlFor="check-number" className="text-sm text-gray-600">
          Check number (optional)
        </label>
        <input
          id="check-number"
          type="text"
          value={checkNumber}
          onChange={(e) => setCheckNumber(e.target.value)}
          autoFocus
          className="h-14 w-48 rounded-lg border border-gray-300 text-center text-2xl tabular-nums focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
          placeholder="#"
        />
      </div>

      {checkout.error && (
        <p className="text-sm text-red-600">{checkout.error}</p>
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
          className="min-w-[160px] bg-green-600 hover:bg-green-700"
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
