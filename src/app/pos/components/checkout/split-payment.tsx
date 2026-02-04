'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { cn } from '@/lib/utils/cn';
import { TIP_PRESETS } from '@/lib/utils/constants';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';

type SplitStep = 'enter-amounts' | 'processing-card' | 'complete' | 'error';
type SplitMode = 'cash-first' | 'card-first';

export function SplitPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const grandTotal = ticket.total;
  const [splitMode, setSplitMode] = useState<SplitMode>('cash-first');
  const [primaryAmount, setPrimaryAmount] = useState('');
  const [splitStep, setSplitStep] = useState<SplitStep>('enter-amounts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const primaryNum = parseFloat(primaryAmount) || 0;

  // Based on mode, calculate the portions
  const cashAmount = splitMode === 'cash-first' ? primaryNum : Math.max(0, Math.round((grandTotal - primaryNum) * 100) / 100);
  const cardAmount = splitMode === 'card-first' ? primaryNum : Math.max(0, Math.round((grandTotal - primaryNum) * 100) / 100);
  const remaining = Math.max(0, Math.round((grandTotal - cashAmount - cardAmount) * 100) / 100);

  const isValidSplit =
    primaryNum > 0 &&
    primaryNum < grandTotal &&
    cashAmount >= 0 &&
    cardAmount > 0;

  // Quick-split presets
  function handleSplitHalf() {
    const half = Math.floor((grandTotal / 2) * 100) / 100;
    setPrimaryAmount(half.toFixed(2));
  }

  async function handleProcessSplit() {
    if (!isValidSplit) return;

    setSplitStep('processing-card');
    checkout.setProcessing(true);

    try {
      // Create PaymentIntent for card portion (no tip baked in)
      const cardCents = Math.round(cardAmount * 100);
      const piRes = await posFetch('/api/pos/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cardCents,
          description: `POS Split Sale (card portion)`,
        }),
      });

      const piJson = await piRes.json();
      if (!piRes.ok) {
        throw new Error(piJson.error || 'Failed to create payment intent');
      }

      // Collect + process card via terminal with on-reader tipping
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

      const processed = await processPayment(paymentIntent);

      // Calculate tip from amount difference
      const tipCents = Math.max(0, processed.amount - cardCents);
      const tipAmount = tipCents / 100;

      // Set tip in checkout context for display
      checkout.setTip(tipAmount, null);

      // Create transaction with both payments
      const txRes = await posFetch('/api/pos/transactions', {
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
              amount: cashAmount,
              tip_amount: 0,
            },
            {
              method: 'card',
              amount: cardAmount + tipAmount,
              tip_amount: tipAmount,
              stripe_payment_intent_id: piJson.id,
            },
          ],
        }),
      });

      const txJson = await txRes.json();
      if (!txRes.ok) {
        throw new Error(txJson.error || 'Failed to save transaction');
      }

      // Card-to-customer matching for the card portion (fire-and-forget)
      const piId = piJson.id;
      const txId = txJson.data.id;
      const custId = ticket.customer?.id || null;
      const custEmail = ticket.customer?.email;
      const custPhone = ticket.customer?.phone;
      const custTags = ticket.customer?.tags || null;

      posFetch('/api/pos/card-customer', {
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

      setSplitStep('complete');
      checkout.setSplitCash(cashAmount);
      checkout.setCardResult(piId, null, null);
      checkout.setCashPayment(cashAmount, 0);
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
    setSplitStep('enter-amounts');
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

      {splitStep === 'enter-amounts' && (
        <>
          {/* Mode toggle: cash-first vs card-first */}
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => { setSplitMode('cash-first'); setPrimaryAmount(''); }}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                splitMode === 'cash-first'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Enter Cash Amount
            </button>
            <button
              onClick={() => { setSplitMode('card-first'); setPrimaryAmount(''); }}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-all',
                splitMode === 'card-first'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              Enter Card Amount
            </button>
          </div>

          {/* Amount input */}
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-600">
              {splitMode === 'cash-first'
                ? 'Enter cash amount \u2014 remainder goes to card'
                : 'Enter card amount \u2014 remainder is cash'}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xl text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                max={grandTotal - 0.5}
                value={primaryAmount}
                onChange={(e) => setPrimaryAmount(e.target.value)}
                autoFocus
                className="h-14 w-40 rounded-lg border border-gray-300 text-center text-2xl tabular-nums focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                placeholder="0.00"
              />
            </div>

            {/* Quick split buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSplitHalf}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              >
                50/50
              </button>
              {[20, 50, 100].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setPrimaryAmount(amt.toFixed(2))}
                  disabled={amt >= grandTotal}
                  className={cn(
                    'rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50',
                    amt >= grandTotal && 'opacity-40 cursor-not-allowed'
                  )}
                >
                  ${amt}
                </button>
              ))}
            </div>

            {/* Running totals */}
            {primaryNum > 0 && (
              <div className="w-full max-w-xs rounded-lg bg-gray-50 p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Cash</span>
                    <span className="text-lg font-semibold tabular-nums text-green-700">
                      ${cashAmount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Card</span>
                    <span className="text-lg font-semibold tabular-nums text-blue-700">
                      ${cardAmount.toFixed(2)}
                    </span>
                  </div>
                  {remaining > 0.01 && (
                    <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                      <span className="text-sm font-medium text-red-600">Remaining</span>
                      <span className="text-lg font-semibold tabular-nums text-red-600">
                        ${remaining.toFixed(2)}
                      </span>
                    </div>
                  )}
                  {remaining <= 0.01 && (
                    <div className="border-t border-gray-200 pt-2 text-center text-sm font-medium text-green-600">
                      Fully allocated
                    </div>
                  )}
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
              Process Card ${cardAmount.toFixed(2)}
            </Button>
          </div>
        </>
      )}

      {splitStep === 'processing-card' && (
        <>
          <div className="flex flex-col items-center gap-4">
            <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
              Cash: ${cashAmount.toFixed(2)} collected
            </p>
            <CreditCard className="h-16 w-16 text-blue-500" />
            <p className="text-xl font-medium text-gray-900">
              Present card for ${cardAmount.toFixed(2)}
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
                setSplitStep('enter-amounts');
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
