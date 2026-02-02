'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

type SplitStep = 'enter-cash' | 'processing-card' | 'complete' | 'error';

export function SplitPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const grandTotal = ticket.total + checkout.tipAmount;
  const [cashAmount, setCashAmount] = useState('');
  const [splitStep, setSplitStep] = useState<SplitStep>('enter-cash');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cashNum = parseFloat(cashAmount) || 0;
  const cardRemainder = Math.max(0, Math.round((grandTotal - cashNum) * 100) / 100);
  const isValidSplit = cashNum > 0 && cashNum < grandTotal;

  async function handleProcessSplit() {
    if (!isValidSplit) return;

    setSplitStep('processing-card');
    checkout.setProcessing(true);

    try {
      // Create PaymentIntent for card portion
      const amountCents = Math.round(cardRemainder * 100);
      const piRes = await fetch('/api/pos/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          description: `POS Split Sale (card portion)`,
        }),
      });

      const piJson = await piRes.json();
      if (!piRes.ok) {
        throw new Error(piJson.error || 'Failed to create payment intent');
      }

      // Collect + process card via terminal
      const { collectPaymentMethod, processPayment } = await import(
        '../../lib/stripe-terminal'
      );

      const paymentIntent = await collectPaymentMethod(piJson.client_secret);
      await processPayment(paymentIntent);

      // Determine tip split — attribute all tip to card payment
      const cashTip = 0;
      const cardTip = checkout.tipAmount;

      // Create transaction with both payments
      const txRes = await fetch('/api/pos/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer?.id || null,
          vehicle_id: ticket.vehicle?.id || null,
          subtotal: ticket.subtotal,
          tax_amount: ticket.taxAmount,
          tip_amount: checkout.tipAmount,
          discount_amount: ticket.discountAmount,
          total_amount: ticket.total,
          payment_method: 'split',
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
              amount: cashNum,
              tip_amount: cashTip,
            },
            {
              method: 'card',
              amount: cardRemainder,
              tip_amount: cardTip,
              stripe_payment_intent_id: piJson.id,
            },
          ],
        }),
      });

      const txJson = await txRes.json();
      if (!txRes.ok) {
        throw new Error(txJson.error || 'Failed to save transaction');
      }

      setSplitStep('complete');
      checkout.setSplitCash(cashNum);
      checkout.setCardResult(piJson.id, null, null);
      checkout.setCashPayment(cashNum, 0);
      checkout.setComplete(txJson.data.id, txJson.data.receipt_number);
      dispatch({ type: 'CLEAR_TICKET' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Split payment failed';
      setSplitStep('error');
      setErrorMsg(msg);
      toast.error(msg);
      checkout.setProcessing(false);
    }
  }

  async function handleCancel() {
    try {
      const { cancelCollect } = await import('../../lib/stripe-terminal');
      await cancelCollect();
    } catch {
      // ignore
    }
    setSplitStep('enter-cash');
    checkout.setProcessing(false);
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500">Split Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${grandTotal.toFixed(2)}
        </p>
      </div>

      {splitStep === 'enter-cash' && (
        <>
          {/* Cash amount input */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-600">
              Enter cash amount — remainder goes to card
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xl text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max={grandTotal - 0.5}
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                autoFocus
                className="h-14 w-40 rounded-lg border border-gray-300 text-center text-2xl tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0.00"
              />
            </div>

            {cashNum > 0 && (
              <div className="flex gap-6 text-center">
                <div>
                  <p className="text-sm text-gray-500">Cash</p>
                  <p className="text-lg font-semibold text-green-700">
                    ${cashNum.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Card</p>
                  <p className="text-lg font-semibold text-blue-700">
                    ${cardRemainder.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => checkout.setStep('payment-method')}
            >
              Back
            </Button>
            <Button
              size="lg"
              onClick={handleProcessSplit}
              disabled={!isValidSplit}
              className="min-w-[160px] bg-green-600 hover:bg-green-700"
            >
              Process Card ${cardRemainder.toFixed(2)}
            </Button>
          </div>
        </>
      )}

      {splitStep === 'processing-card' && (
        <>
          <div className="flex flex-col items-center gap-4">
            <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Cash: ${cashNum.toFixed(2)} collected
            </p>
            <CreditCard className="h-16 w-16 text-blue-500" />
            <p className="text-xl font-medium text-gray-900">
              Present card for ${cardRemainder.toFixed(2)}
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
          </div>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
        </>
      )}

      {splitStep === 'complete' && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-16 w-16 text-green-500" />
          <p className="text-xl font-medium text-green-700">Payment complete</p>
        </div>
      )}

      {splitStep === 'error' && (
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="h-16 w-16 text-red-500" />
          <p className="text-lg font-medium text-red-700">Payment failed</p>
          {errorMsg && (
            <p className="max-w-sm text-center text-sm text-red-600">
              {errorMsg}
            </p>
          )}
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setSplitStep('enter-cash');
                setErrorMsg(null);
              }}
            >
              Back
            </Button>
            <Button
              size="lg"
              onClick={handleProcessSplit}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
