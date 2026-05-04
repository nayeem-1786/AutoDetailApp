'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CreditCard, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { cn } from '@/lib/utils/cn';
import { TIP_PRESETS } from '@/lib/utils/constants';
import { fromCents, toCents } from '@/lib/utils/refund-math';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { PinPad } from '../pin-pad';

type SplitStep = 'enter-amounts' | 'processing-card' | 'complete' | 'error';
type SplitMode = 'cash-first' | 'card-first';

// $99,999.99 hard cap — same value as cash-payment.tsx / keypad-tab.tsx /
// register-tab.tsx / payment-link-amount-modal.tsx. Inlined for self-contained
// reading; intentional duplication, not coupling.
const CENTS_CAP = 9999999;

export function SplitPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const grandTotal = ticket.total;
  const [splitMode, setSplitMode] = useState<SplitMode>('cash-first');
  // Tendered primary amount lives as integer cents and entry is "fixed-decimal"
  // — every keypad digit shifts the value left by one column. Mirrors the
  // pattern in cash-payment.tsx / keypad-tab.tsx / payment-link-amount-modal.tsx.
  const [primaryCents, setPrimaryCents] = useState(0);
  const [splitStep, setSplitStep] = useState<SplitStep>('enter-amounts');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const grandTotalCents = toCents(grandTotal);
  const primaryNum = fromCents(primaryCents);
  const displayValue = primaryNum.toFixed(2);

  // Based on mode, calculate the portions. Formulas byte-identical to the
  // pre-rebuild string-state version — only the `primaryNum` source changed
  // from `parseFloat(primaryAmount) || 0` to `fromCents(primaryCents)`.
  const cashAmount = splitMode === 'cash-first' ? primaryNum : Math.max(0, Math.round((grandTotal - primaryNum) * 100) / 100);
  const cardAmount = splitMode === 'card-first' ? primaryNum : Math.max(0, Math.round((grandTotal - primaryNum) * 100) / 100);
  const remaining = Math.max(0, Math.round((grandTotal - cashAmount - cardAmount) * 100) / 100);

  const isValidSplit =
    primaryNum > 0 &&
    primaryNum < grandTotal &&
    cashAmount >= 0 &&
    cardAmount > 0;

  function handleDigit(d: string) {
    if (d === '.') return; // Defensive — `.` is not rendered in amount layout.
    const next = d === '00' ? primaryCents * 100 : primaryCents * 10 + parseInt(d, 10);
    // Cap one cent below grand total — split MUST leave at least $0.01 for the
    // OTHER half, otherwise it isn't a split. Also cap at $99,999.99 hard limit.
    const cap = Math.min(CENTS_CAP, grandTotalCents - 1);
    if (next > cap) return;
    setPrimaryCents(next);
  }

  function handleBackspace() {
    setPrimaryCents(Math.floor(primaryCents / 10));
  }

  // Quick-split presets — OVERWRITE primaryCents (different from cash-payment's
  // increment denomination chips). Reasoning: "split is exactly $20 cash" is
  // the operation, not "received $20 then $20 more".
  function handleSplitHalf() {
    // Floor at integer cents so odd totals (e.g., $5.55 → $2.77 + $2.78)
    // split cleanly with the larger cent landing on the OTHER half. Matches
    // the prior float-based behavior `Math.floor((grandTotal / 2) * 100) / 100`.
    setPrimaryCents(Math.floor(grandTotalCents / 2));
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
        tip_configuration: { options: tipOptions, hide_custom_amount: false },
        config_override: { tipping: { eligible_amount: subtotalCents } },
      });

      const processed = await processPayment(paymentIntent);

      // Capture the authorized payment (finalizes charge including tip)
      const captureRes = await posFetch('/api/pos/stripe/capture-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_intent_id: piJson.id,
          amount_to_capture: processed.amount,
        }),
      });
      if (!captureRes.ok) {
        const captureErr = await captureRes.json();
        throw new Error(captureErr.error || 'Failed to capture payment');
      }

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
          deposit_credit: ticket.depositCredit,
          total_amount: ticket.total,
          payment_method: 'split',
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

      // Fire-and-forget: kick cash drawer open via print server
      posFetch('/api/pos/receipts/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => { /* drawer kick is best-effort */ });

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
      // Record BOTH cash and card portions so PaymentComplete renders the
      // correct split summary. Pre-fix: setSplitCash(cash) only — cardPortion
      // stayed at its initial 0 → split receipts always read "Card $0.00".
      checkout.setSplitPayment(cashAmount, cardAmount);
      // brand/lastFour intentionally null here — the Stripe Terminal SDK's
      // PaymentIntent does not reliably expose these client-side; the values
      // ARE persisted to payments.card_brand / payments.card_last_four by the
      // /api/pos/card-customer server endpoint (fired async above) which
      // queries the Stripe charge object server-side. Receipts read from the
      // payments table, so the printed receipt has the brand. PaymentComplete
      // doesn't currently render brand/lastFour inline; if extended to do so,
      // it would need to await the card-customer response or call a separate
      // endpoint to fetch the persisted brand. Out of scope here.
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
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Split Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${grandTotal.toFixed(2)}
        </p>
      </div>

      {splitStep === 'enter-amounts' && (
        <>
          {/* Mode toggle: cash-first vs card-first. Labels shortened from
              "Enter Cash Amount" / "Enter Card Amount" to "Cash" / "Card"
              now that the prompt text in the right column explains the
              meaning. min-w-[100px] keeps the buttons visually balanced
              despite the short labels. */}
          <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
            <button
              onClick={() => { setSplitMode('cash-first'); setPrimaryCents(0); }}
              className={cn(
                'min-w-[100px] rounded-md px-4 py-2 text-sm font-medium transition-all',
                splitMode === 'cash-first'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-950/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Cash
            </button>
            <button
              onClick={() => { setSplitMode('card-first'); setPrimaryCents(0); }}
              className={cn(
                'min-w-[100px] rounded-md px-4 py-2 text-sm font-medium transition-all',
                splitMode === 'card-first'
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-gray-950/30'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              Card
            </button>
          </div>

          {/* Two-column body \u2014 LEFT: quick presets (top) + running totals
              (below, conditional). RIGHT: prompt text (top) + display + PinPad.
              Both columns fixed at w-[300px] so PinPad's grid-cols-3 fills
              the right column and cells render at ~94px (B-followup-3 lesson).
              Total row width 300+16+300 = 616px, fits 768px-viewport iPads'
              inner area (627px after px-8 64px padding) with 11px breathing,
              and fits all larger iPads with proportionally more breathing.
              items-start aligns columns at top \u2014 left column is shorter than
              right (especially when running totals hide), empty space below
              the left column is acceptable. NO items-center on either column;
              presets row uses justify-center, display + running totals use
              mx-auto / w-full to position within the 300px column. */}
          <div className="flex flex-row items-start gap-4">
            {/* LEFT column \u2014 quick presets + running totals */}
            <div className="flex w-[300px] flex-col gap-4">
              {/* Top spacer \u2014 row-aligns the presets row with the keypad's
                  first row (1, 2, 3) in the right column. Right column above
                  PinPad: prompt text (text-sm ~20px) + gap-4 (16px) + display
                  (h-[60px]) + gap-4 (16px) = 112px \u2192 keypad row 1 top sits
                  at 112px from column start. Left column has its own gap-4
                  between this spacer and the presets row, so the spacer
                  itself is 112 \u2212 16 (one gap-4) = 96px. Top of presets =
                  spacer (96) + gap-4 (16) = 112px. \u2713 Mirrors cash-payment.tsx's
                  left-column spacer pattern (denom chips row-aligned with
                  keypad rows). h-[96px] (not min-h) for exact match \u2014 right
                  column above keypad is constant height. */}
              <div className="h-[96px]" aria-hidden="true" />
              {/* Quick preset chips \u2014 OVERWRITE primaryCents (different from
                  cash-payment's increment denoms). justify-center within the
                  300px column (chip row is 264px wide, leaves 18px breathing
                  on each side). */}
              <div className="flex flex-row justify-center gap-2">
                <button
                  type="button"
                  onClick={handleSplitHalf}
                  className="flex h-[60px] w-[60px] items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-base font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 touch-manipulation"
                >
                  50/50
                </button>
                {[20, 50, 100].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setPrimaryCents(toCents(amt))}
                    disabled={amt >= grandTotal}
                    className={cn(
                      'flex h-[60px] w-[60px] items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-base font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 touch-manipulation',
                      amt >= grandTotal && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>

              {/* Running totals \u2014 JSX byte-identical to single-column
                  version; condition unchanged (primaryNum > 0 \u27fa primaryCents > 0).
                  w-full fills the 300px left column; max-w-xs (320px) is
                  redundant since the column is narrower, but kept verbatim
                  from prior version to minimize diff. */}
              {primaryNum > 0 && (
                <div className="w-full max-w-xs rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Cash</span>
                      <span className="text-lg font-semibold tabular-nums text-green-700 dark:text-green-400">
                        ${cashAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Card</span>
                      <span className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-400">
                        ${cardAmount.toFixed(2)}
                      </span>
                    </div>
                    {remaining > 0.01 && (
                      <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-2">
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">Remaining</span>
                        <span className="text-lg font-semibold tabular-nums text-red-600 dark:text-red-400">
                          ${remaining.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {remaining <= 0.01 && (
                      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 text-center text-sm font-medium text-green-600 dark:text-green-400">
                        Fully allocated
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT column \u2014 prompt + display + keypad */}
            <div className="flex w-[300px] flex-col gap-4">
              {/* Prompt text \u2014 single-line guidance restating the toggle's
                  meaning. Original phrasing kept (fits on one line at
                  text-sm in 300px column \u2014 ~287px of text). text-center
                  positions the line within the column. */}
              <p className="text-center text-sm text-gray-600 dark:text-gray-400">
                {splitMode === 'cash-first'
                  ? 'Enter cash amount \u2014 remainder goes to card'
                  : 'Enter card amount \u2014 remainder is cash'}
              </p>

              {/* Tendered display \u2014 non-focusable div, no OS keyboard pop
                  on iPad. Fixed width w-44 (176px); $ inside the box;
                  mx-auto centered within the 300px right column. */}
              <div
                role="status"
                aria-live="polite"
                aria-label="Primary amount"
                className="mx-auto flex h-[60px] w-44 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-center text-2xl tabular-nums text-gray-900 dark:text-gray-100"
              >
                ${displayValue}
              </div>

              {/* Embedded keypad \u2014 fills the 300px right column. Cells
                  ~94px each from grid-cols-3 + gap-2 ((300\u221216)/3 = 94.67).
                  Well above the 44px Apple HIG tap-target minimum. */}
              <PinPad
                onDigit={handleDigit}
                onBackspace={handleBackspace}
                layoutVariant="amount"
                size="default"
              />
            </div>
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
              className="min-w-[160px] bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
            >
              Process Card ${cardAmount.toFixed(2)}
            </Button>
          </div>
        </>
      )}

      {splitStep === 'processing-card' && (
        <>
          <div className="flex flex-col items-center gap-4">
            <p className="rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2 text-sm text-green-700 dark:text-green-400">
              Cash: ${cashAmount.toFixed(2)} collected
            </p>
            <CreditCard className="h-16 w-16 text-blue-500 dark:text-blue-400" />
            <p className="text-xl font-medium text-gray-900 dark:text-gray-100">
              Present card for ${cardAmount.toFixed(2)}
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-blue-400 dark:text-blue-300" />
          </div>
          <Button variant="outline" size="lg" onClick={handleCancel}>
            Cancel
          </Button>
        </>
      )}

      {splitStep === 'complete' && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-16 w-16 text-green-500 dark:text-green-400" />
          <p className="text-xl font-medium text-green-700 dark:text-green-400">Payment complete</p>
        </div>
      )}

      {splitStep === 'error' && (
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="h-16 w-16 text-red-500 dark:text-red-400" />
          <p className="text-lg font-medium text-red-700 dark:text-red-400">Payment failed</p>
          {errorMsg && (
            <p className="max-w-sm text-center text-sm text-red-600 dark:text-red-400">
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
              className="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600"
            >
              Retry
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
