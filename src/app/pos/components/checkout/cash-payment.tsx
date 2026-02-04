'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosAuth } from '../../context/pos-auth-context';

const QUICK_TENDERS = [20, 50, 100];

export function CashPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { employee } = usePosAuth();

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

      checkout.setCashPayment(tenderedNum, change);
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
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500">Cash Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${amountDue.toFixed(2)}
        </p>
      </div>

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
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 text-gray-700 hover:border-gray-300',
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
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-gray-200 text-gray-700 hover:border-gray-300'
          )}
        >
          Exact
        </button>
      </div>

      {/* Custom amount input */}
      <div className="flex items-center gap-2">
        <span className="text-xl text-gray-500">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
          className="h-14 w-40 rounded-lg border border-gray-300 text-center text-2xl tabular-nums focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-200"
          placeholder="0.00"
        />
      </div>

      {/* Change display */}
      {tenderedNum > 0 && (
        <div
          className={cn(
            'rounded-lg px-6 py-3 text-center',
            isValid ? 'bg-green-50' : 'bg-red-50'
          )}
        >
          {isValid ? (
            <p className="text-lg">
              Change:{' '}
              <span className="text-2xl font-bold text-green-700">
                ${change.toFixed(2)}
              </span>
            </p>
          ) : (
            <p className="text-lg text-red-600">
              Short ${(amountDue - tenderedNum).toFixed(2)}
            </p>
          )}
        </div>
      )}

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
          onClick={handleProcessCash}
          disabled={!isValid || processing}
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
