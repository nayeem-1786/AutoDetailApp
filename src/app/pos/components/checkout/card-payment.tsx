'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { TIP_PRESETS } from '@/lib/utils/constants';
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

  const amountDue = ticket.total;
  const [status, setStatus] = useState<CardStatus>('creating-intent');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const processCard = useCallback(async () => {
    setStatus('creating-intent');
    setErrorMsg(null);

    try {
      // 1. Create PaymentIntent with base amount (no tip baked in)
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

      // 2. Collect payment method via terminal with on-reader tipping
      const { collectPaymentMethod, processPayment } = await import(
        '../../lib/stripe-terminal'
      );

      const subtotalCents = Math.round(ticket.subtotal * 100);
      const tipOptions = TIP_PRESETS.map((pct) => ({
        amount: Math.round(subtotalCents * pct / 100),
        label: `${pct}%`,
      }));

      const paymentIntent = await collectPaymentMethod(piJson.client_secret, {
        tip_configuration: { options: tipOptions },
      });

      setStatus('processing');

      // 3. Process payment
      const processed = await processPayment(paymentIntent);

      // 4. Calculate tip from amount difference
      const tipCents = Math.max(0, processed.amount - amountCents);
      const tipAmount = tipCents / 100;

      // Set tip in checkout context for display
      checkout.setTip(tipAmount, null);

      // 5. Create transaction
      const txRes = await fetch('/api/pos/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: ticket.customer?.id || null,
          vehicle_id: ticket.vehicle?.id || null,
          subtotal: ticket.subtotal,
          tax_amount: ticket.taxAmount,
          tip_amount: tipAmount,
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
              amount: amountDue + tipAmount,
              tip_amount: tipAmount,
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

      // Card-to-customer matching (fire-and-forget)
      const piId = piJson.id;
      const txId = txJson.data.id;
      const custId = ticket.customer?.id || null;
      const custEmail = ticket.customer?.email;
      const custPhone = ticket.customer?.phone;
      const custTags = ticket.customer?.tags || null;

      fetch('/api/pos/card-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stripe_payment_intent_id: piId,
          transaction_id: txId,
          customer_id: custId,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.matched_customer && !custId) {
            const name = `${data.matched_customer.first_name} ${data.matched_customer.last_name}`.trim();
            toast.success(`Customer recognized: ${name}`);
            // Update checkout with matched customer's contact info for receipts
            checkout.setComplete(
              txId,
              txJson.data.receipt_number,
              data.matched_customer.email || custEmail,
              data.matched_customer.phone || custPhone,
              data.matched_customer.id,
              data.matched_customer.tags
            );
          }
        })
        .catch(() => {
          // Silent fail — card matching is non-critical
        });

      setStatus('success');
      checkout.setCardResult(piId, null, null);
      checkout.setComplete(
        txId,
        txJson.data.receipt_number,
        custEmail,
        custPhone,
        custId,
        custTags
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
