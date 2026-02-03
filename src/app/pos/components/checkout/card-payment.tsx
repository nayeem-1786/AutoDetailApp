'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

type CardStatus =
  | 'creating-intent'
  | 'waiting-for-card'
  | 'processing'
  | 'success'
  | 'error';

export function CardPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const amountDue = ticket.total + checkout.tipAmount;
  const [status, setStatus] = useState<CardStatus>('creating-intent');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processCard = useCallback(async () => {
    setStatus('creating-intent');
    setErrorMsg(null);

    try {
      // 1. Create PaymentIntent
      const amountCents = Math.round(amountDue * 100);
      const piRes = await fetch('/api/pos/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountCents,
          description: `POS Sale — ${ticket.items.map((i) => i.itemName).join(', ')}`,
        }),
      });

      const piJson = await piRes.json();
      if (!piRes.ok) {
        throw new Error(piJson.error || 'Failed to create payment intent');
      }

      setStatus('waiting-for-card');

      // 2. Collect payment method via terminal
      const { collectPaymentMethod, processPayment } = await import(
        '../../lib/stripe-terminal'
      );

      const paymentIntent = await collectPaymentMethod(piJson.client_secret);

      setStatus('processing');

      // 3. Process payment
      await processPayment(paymentIntent);

      // 4. Create transaction
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
          payment_method: 'card',
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
              method: 'card',
              amount: amountDue,
              tip_amount: checkout.tipAmount,
              stripe_payment_intent_id: piJson.id,
              card_brand: null,
              card_last_four: null,
            },
          ],
        }),
      });

      const txJson = await txRes.json();
      if (!txRes.ok) {
        throw new Error(txJson.error || 'Failed to save transaction');
      }

      setStatus('success');
      checkout.setCardResult(piJson.id, null, null);
      checkout.setComplete(
        txJson.data.id,
        txJson.data.receipt_number,
        ticket.customer?.email,
        ticket.customer?.phone
      );
      dispatch({ type: 'CLEAR_TICKET' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Card payment failed';
      setStatus('error');
      setErrorMsg(msg);
      toast.error(msg);
    }
  }, [amountDue, ticket, checkout, dispatch]);

  useEffect(() => {
    processCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCancel() {
    try {
      const { cancelCollect } = await import('../../lib/stripe-terminal');
      await cancelCollect();
    } catch {
      // ignore cancel errors
    }
    checkout.setStep('payment-method');
  }

  return (
    <div className="flex flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500">Card Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {/* Status display */}
      <div className="flex flex-col items-center gap-4">
        {status === 'creating-intent' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <p className="text-lg text-gray-600">Preparing payment...</p>
          </>
        )}

        {status === 'waiting-for-card' && (
          <>
            <CreditCard className="h-16 w-16 text-blue-500" />
            <p className="text-xl font-medium text-gray-900">
              Present card on reader
            </p>
            <p className="text-sm text-gray-500">
              Tap, insert, or swipe the card
            </p>
          </>
        )}

        {status === 'processing' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <p className="text-lg text-gray-600">Processing payment...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-xl font-medium text-green-700">
              Payment approved
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="h-16 w-16 text-red-500" />
            <p className="text-lg font-medium text-red-700">Payment failed</p>
            {errorMsg && (
              <p className="max-w-sm text-center text-sm text-red-600">
                {errorMsg}
              </p>
            )}
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-4">
        {(status === 'waiting-for-card' || status === 'error') && (
          <Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
        )}
        {status === 'error' && (
          <Button
            size="lg"
            onClick={() => processCard()}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
