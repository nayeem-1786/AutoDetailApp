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

type SplitStep = 'enter-amounts' | 'processing' | 'complete' | 'error';
type ActiveField = 'cash' | 'card';
type ProcessingBranch = 'cash-only' | 'card-only' | 'mixed';

// $99,999.99 hard cap — same value as cash-payment.tsx / keypad-tab.tsx /
// register-tab.tsx / payment-link-amount-modal.tsx. Inlined for self-contained
// reading; intentional duplication, not coupling.
const CENTS_CAP = 9999999;

export function SplitPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();

  const grandTotal = ticket.total;
  const grandTotalCents = toCents(grandTotal);

  // Two-field architecture (post-mode-toggle removal): Cash and Card amounts
  // are simultaneously editable. activeField controls which one the keypad +
  // presets target; the OTHER field auto-derives as grandTotalCents - active.
  // Initial state: Cash active at $0, Card auto-derived at the full grandTotal.
  // Allows endpoint splits ($75 cash + $0 card OR $0 cash + $75 card) without
  // mode-toggle UX gymnastics. Pre-refactor: splitMode + primaryCents forced
  // both halves > 0, blocking endpoints and creating a "stuck at primary = 0"
  // dead state when user backspaced the primary to nothing.
  const [activeField, setActiveField] = useState<ActiveField>('cash');
  const [cashCents, setCashCents] = useState(0);
  const [cardCents, setCardCents] = useState(grandTotalCents);
  const [splitStep, setSplitStep] = useState<SplitStep>('enter-amounts');
  // Captures which branch handleProcessSplit is running so the 'processing'
  // UI can fork (cash-only shows brief "Collecting cash...", card-only and
  // mixed show terminal prompt). Set at the start of handleProcessSplit;
  // cleared on cancel / next mount.
  const [processingBranch, setProcessingBranch] = useState<ProcessingBranch | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cashAmount = fromCents(cashCents);
  const cardAmount = fromCents(cardCents);
  const cashDisplay = cashAmount.toFixed(2);
  const cardDisplay = cardAmount.toFixed(2);

  // Auto-derive enforces sum = grandTotalCents whenever either field changes
  // through setActiveCents. isValidSplit confirms the invariant — defensive
  // guard against rounding drift or edge cases.
  const isValidSplit = (cashCents + cardCents) === grandTotalCents;

  // ----- Field-update helpers (preserve auto-derive invariant) -----

  // Update the active field to `cents` and auto-derive the other so the two
  // always sum to grandTotalCents.
  function setActiveCents(cents: number) {
    if (activeField === 'cash') {
      setCashCents(cents);
      setCardCents(Math.max(0, grandTotalCents - cents));
    } else {
      setCardCents(cents);
      setCashCents(Math.max(0, grandTotalCents - cents));
    }
  }

  // ----- Keypad handlers -----

  function handleDigit(d: string) {
    if (d === '.') return; // Defensive — `.` is not rendered in amount layout.
    const current = activeField === 'cash' ? cashCents : cardCents;
    const next = d === '00' ? current * 100 : current * 10 + parseInt(d, 10);
    // Cap at grandTotalCents (endpoint splits are valid — full total in one
    // field). Pre-refactor used grandTotalCents - 1 to force both halves > 0.
    const cap = Math.min(CENTS_CAP, grandTotalCents);
    if (next > cap) return;
    setActiveCents(next);
  }

  function handleBackspace() {
    const current = activeField === 'cash' ? cashCents : cardCents;
    setActiveCents(Math.floor(current / 10));
  }

  // ----- Field tap (clear-on-tap semantic) -----

  // Tap-to-activate. If tapping the inactive field: switch active, clear that
  // field to 0, set the OTHER (now-inactive) field to grandTotalCents so the
  // sum invariant holds. The user's next keypad digit accumulates on the new
  // active field from 0. Matches existing keypad-surface behavior (entering a
  // new amount overwrites whatever was there).
  function handleFieldTap(field: ActiveField) {
    if (field === activeField) return;
    setActiveField(field);
    if (field === 'cash') {
      setCashCents(0);
      setCardCents(grandTotalCents);
    } else {
      setCardCents(0);
      setCashCents(grandTotalCents);
    }
  }

  // ----- Quick presets -----

  // 50/50 — sets BOTH fields. Floor at integer cents so odd totals
  // (e.g., $5.55 → $2.77 + $2.78) split cleanly. The LARGER half goes to
  // the currently-active field (intentional — feels deliberate rather than
  // arbitrary). Active field stays active after preset.
  function handleSplitHalf() {
    // Active field gets the larger half on odd totals — feels intentional rather than arbitrary.
    const smaller = Math.floor(grandTotalCents / 2);
    const larger = grandTotalCents - smaller; // == ceil(grandTotalCents / 2)
    if (activeField === 'cash') {
      setCashCents(larger);
      setCardCents(smaller);
    } else {
      setCardCents(larger);
      setCashCents(smaller);
    }
  }

  // $X chip — overwrite the active field with this dollar amount. The
  // OTHER field auto-derives via setActiveCents.
  function handlePresetAmount(amt: number) {
    setActiveCents(toCents(amt));
  }

  // ----- Confirm + branch routing -----

  async function handleProcessSplit() {
    if (!isValidSplit) return;

    // Determine branch up-front so the processing UI can fork and we don't
    // re-derive at each conditional below.
    const branch: ProcessingBranch =
      cashCents === grandTotalCents ? 'cash-only' :
      cardCents === grandTotalCents ? 'card-only' :
      'mixed';

    setProcessingBranch(branch);
    setSplitStep('processing');
    checkout.setProcessing(true);

    // Items payload built once — shared across all branches.
    const itemsPayload = ticket.items.map((i) => {
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
    });

    try {
      // ===== CASH-ONLY branch =====
      // Skip Stripe Terminal entirely — no PI, no terminal, no capture, no
      // tip (on-reader tip mechanism is the only tip path here; cash-only
      // means no tip prompt). Single-method 'cash' transaction with one
      // payment row. Drawer kicks (cash > 0).
      if (branch === 'cash-only') {
        const txRes = await posFetch('/api/pos/transactions', {
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
            items: itemsPayload,
            payments: [
              { method: 'cash', amount: cashAmount, tip_amount: 0 },
            ],
          }),
        });

        const txJson = await txRes.json();
        if (!txRes.ok) throw new Error(txJson.error || 'Failed to save transaction');

        // Drawer kick — fire-and-forget.
        posFetch('/api/pos/receipts/cash-drawer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => { /* drawer kick is best-effort */ });

        const txId = txJson.data.id;
        setSplitStep('complete');
        checkout.setSplitPayment(cashAmount, 0);
        checkout.setCashPayment(cashAmount, 0);
        checkout.setComplete(
          txId,
          txJson.data.receipt_number,
          ticket.customer?.email,
          ticket.customer?.phone,
          ticket.customer?.id,
          ticket.customer?.tags || null
        );
        dispatch({ type: 'CLEAR_TICKET' });
        return;
      }

      // ===== CARD-ONLY and MIXED branches share the Stripe Terminal flow =====
      // The only differences are (1) payment_method on the transaction
      // ('card' for card-only, 'split' for mixed), (2) payments array shape
      // (one row vs two), (3) drawer kick (skipped for card-only — no cash
      // to put away), (4) context setters (cash=0 for card-only).
      const cardCentsForStripe = Math.round(cardAmount * 100);
      const piRes = await posFetch('/api/pos/stripe/payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: cardCentsForStripe,
          description: branch === 'card-only'
            ? 'POS Card Sale (via split surface)'
            : 'POS Split Sale (card portion)',
        }),
      });

      const piJson = await piRes.json();
      if (!piRes.ok) throw new Error(piJson.error || 'Failed to create payment intent');

      const { collectPaymentMethod, processPayment } = await import('../../lib/stripe-terminal');

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

      const tipCents = Math.max(0, processed.amount - cardCentsForStripe);
      const tipAmount = tipCents / 100;
      checkout.setTip(tipAmount, null);

      // Branch-specific payments array.
      const payments = branch === 'card-only' ? [
        {
          method: 'card',
          amount: cardAmount + tipAmount,
          tip_amount: tipAmount,
          stripe_payment_intent_id: piJson.id,
        },
      ] : [
        { method: 'cash', amount: cashAmount, tip_amount: 0 },
        {
          method: 'card',
          amount: cardAmount + tipAmount,
          tip_amount: tipAmount,
          stripe_payment_intent_id: piJson.id,
        },
      ];

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
          // card-only is a single-method 'card' transaction (matches what
          // card-payment.tsx produces); mixed is 'split'. Cash-only branch
          // already returned above.
          payment_method: branch === 'card-only' ? 'card' : 'split',
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: ticket.notes,
          items: itemsPayload,
          payments,
        }),
      });

      const txJson = await txRes.json();
      if (!txRes.ok) throw new Error(txJson.error || 'Failed to save transaction');

      // Drawer kick only when cash > 0 (mixed branch only). Card-only has
      // no cash to put away.
      if (branch === 'mixed') {
        posFetch('/api/pos/receipts/cash-drawer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => { /* drawer kick is best-effort */ });
      }

      const piId = piJson.id;
      const txId = txJson.data.id;
      const custId = ticket.customer?.id || null;
      const custEmail = ticket.customer?.email;
      const custPhone = ticket.customer?.phone;
      const custTags = ticket.customer?.tags || null;

      // Card-to-customer matching for the card portion (fire-and-forget).
      // Server-side endpoint also populates payments.card_brand /
      // payments.card_last_four from the Stripe charge object — see prior
      // session 5154c731 for the full reasoning chain.
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
        .catch(() => { /* Silent fail — card matching is non-critical */ });

      setSplitStep('complete');
      // Branch-specific context: card-only sets cash=0; mixed sets both.
      // tipAmount lives separately via setTip; not added to either portion
      // here (the receipt template renders Tip as its own line).
      checkout.setSplitPayment(
        branch === 'card-only' ? 0 : cashAmount,
        cardAmount,
      );
      // brand/lastFour intentionally null — see prior session 5154c731 for
      // why the Stripe Terminal SDK doesn't reliably expose these
      // client-side. Server-side card-customer endpoint populates them.
      checkout.setCardResult(piId, null, null);
      checkout.setCashPayment(branch === 'card-only' ? 0 : cashAmount, 0);
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
    setProcessingBranch(null);
    checkout.setProcessing(false);
  }

  // Context-aware confirm button label. Three variants:
  //   cash-only:  "Collect Cash $X.XX"
  //   card-only:  "Process Card $X.XX"
  //   mixed:      "Collect $X.XX + Process $Y.YY"
  // Button stays green for all three — successful payment commitment.
  const buttonLabel =
    cashCents === grandTotalCents ? `Collect Cash $${cashAmount.toFixed(2)}` :
    cardCents === grandTotalCents ? `Process Card $${cardAmount.toFixed(2)}` :
    `Collect $${cashAmount.toFixed(2)} + Process $${cardAmount.toFixed(2)}`;

  // Field-display className builder. Active field gets a thicker blue border
  // + light blue tint background; inactive uses the standard gray border +
  // white background. transition-colors smooths the swap.
  function fieldClass(field: ActiveField): string {
    const isActive = activeField === field;
    return cn(
      'flex h-[60px] w-44 items-center justify-center rounded-lg text-2xl tabular-nums text-gray-900 dark:text-gray-100 transition-colors touch-manipulation cursor-pointer',
      isActive
        ? 'border-2 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/30'
        : 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-gray-400 dark:hover:border-gray-500',
    );
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
          {/* Two-column body — layout sync to cash-payment.tsx (a8f87c98).
              LEFT column: NO explicit width (shrinks to 60px button content)
              + outer gap-3 + inner button-group wrapper (gap-2 between
              chips). RIGHT column: w-full max-w-xs (320px max) + gap-3.
              Total horizontal: 60 + 16 (gap-4) + 320 = ~396px = matches
              cash-payment exactly. Pre-sync this surface used 300px columns
              + gap-4 column gap = 616px total, ~220px wider than cash and
              breaking the visual sibling rhythm. */}
          <div className="flex flex-row items-start gap-4">
            {/* LEFT column — vertical preset stack, mirrors cash-payment's
                left-column structure exactly. Two h-[60px] spacers stand in
                for the right column's Cash display + Card display heights,
                separated by gap-3 (12px). Inner button-group wrapper has
                gap-2 (8px) between chips. First preset (50/50) top at
                60+12+60+12 = 144px = matches RIGHT column's PinPad row 1
                top (also 144px). */}
            <div className="flex flex-col gap-3">
              <div className="h-[60px]" aria-hidden="true" />
              <div className="h-[60px]" aria-hidden="true" />
              <div className="flex flex-col gap-2">
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
                    onClick={() => handlePresetAmount(amt)}
                    disabled={amt * 100 > grandTotalCents}
                    className={cn(
                      'flex h-[60px] w-[60px] items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-base font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 touch-manipulation',
                      amt * 100 > grandTotalCents && 'opacity-40 cursor-not-allowed'
                    )}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT column — two display fields + keypad. Mirrors cash-payment's
                right-column wrapper exactly: w-full max-w-xs (320px) + gap-3.
                PinPad fills the column → cells ~101px (B-followup-3 lesson).
                Display fields (w-44 = 176px) centered with mx-auto. */}
            <div className="flex w-full max-w-xs flex-col gap-3">
              {/* Cash display field — tap to activate. Active treatment:
                  thicker blue border + light blue tint. Inactive: standard
                  gray border. Both fields render via fromCents() and stay
                  fixed-width (w-44) regardless of value. Label rendered
                  inside the field via `Cash $X.XX` for compactness. */}
              <button
                type="button"
                role="button"
                onClick={() => handleFieldTap('cash')}
                aria-pressed={activeField === 'cash'}
                aria-label={`Cash amount ${cashDisplay}, ${activeField === 'cash' ? 'active' : 'inactive'}`}
                className={cn('mx-auto', fieldClass('cash'))}
              >
                <span className="mr-2 text-base font-medium text-gray-500 dark:text-gray-400">Cash</span>
                ${cashDisplay}
              </button>

              {/* Card display field — same pattern. */}
              <button
                type="button"
                role="button"
                onClick={() => handleFieldTap('card')}
                aria-pressed={activeField === 'card'}
                aria-label={`Card amount ${cardDisplay}, ${activeField === 'card' ? 'active' : 'inactive'}`}
                className={cn('mx-auto', fieldClass('card'))}
              >
                <span className="mr-2 text-base font-medium text-gray-500 dark:text-gray-400">Card</span>
                ${cardDisplay}
              </button>

              {/* Embedded keypad — sends digits to whichever field is
                  active. Cap = grandTotalCents (endpoint splits valid). */}
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
              disabled={!isValidSplit || checkout.processing}
              className="min-w-[160px] bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600"
            >
              {buttonLabel}
            </Button>
          </div>
        </>
      )}

      {splitStep === 'processing' && (
        <>
          <div className="flex flex-col items-center gap-4">
            {/* CASH-ONLY: no terminal, brief flash of "Collecting cash..."
                while the transaction insert + drawer kick complete. */}
            {processingBranch === 'cash-only' && (
              <>
                <Loader2 className="h-12 w-12 animate-spin text-green-500 dark:text-green-400" />
                <p className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  Collecting cash ${cashAmount.toFixed(2)}…
                </p>
              </>
            )}

            {/* CARD-ONLY: terminal prompt, no "cash collected" banner. */}
            {processingBranch === 'card-only' && (
              <>
                <CreditCard className="h-16 w-16 text-blue-500 dark:text-blue-400" />
                <p className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  Present card for ${cardAmount.toFixed(2)}
                </p>
                <Loader2 className="h-6 w-6 animate-spin text-blue-400 dark:text-blue-300" />
              </>
            )}

            {/* MIXED: cash banner + terminal prompt (existing behavior). */}
            {processingBranch === 'mixed' && (
              <>
                <p className="rounded-lg bg-green-50 dark:bg-green-900/30 px-4 py-2 text-sm text-green-700 dark:text-green-400">
                  Cash: ${cashAmount.toFixed(2)} collected
                </p>
                <CreditCard className="h-16 w-16 text-blue-500 dark:text-blue-400" />
                <p className="text-xl font-medium text-gray-900 dark:text-gray-100">
                  Present card for ${cardAmount.toFixed(2)}
                </p>
                <Loader2 className="h-6 w-6 animate-spin text-blue-400 dark:text-blue-300" />
              </>
            )}
          </div>
          {/* Cancel button — only meaningful when terminal is active. For
              cash-only, the operation is local + fast; cancel mid-flight
              would orphan a half-written transaction. Hide for cash-only. */}
          {processingBranch !== 'cash-only' && (
            <Button variant="outline" size="lg" onClick={handleCancel}>
              Cancel
            </Button>
          )}
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
                setProcessingBranch(null);
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
