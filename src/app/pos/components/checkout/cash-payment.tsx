'use client';

import { useState, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, WifiOff, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { useOnlineStatus } from '@/lib/hooks/use-online-status';
import { queueTransaction } from '@/lib/pos/offline-queue';
import { fromCents, toCents } from '@/lib/utils/refund-math';
import { TIP_PRESETS } from '@/lib/utils/constants';
import { PinPad } from '../pin-pad';

// Bill denominations stacked vertically in the left column, row-aligned with
// keypad rows. Tapping a denomination *increments* the tendered cents (Square
// / Toast / Clover convention), so $20 × 3 → $60. $1 and $5 dropped — real
// cash payments are dominantly $10+.
const DENOMINATIONS = [10, 20, 50, 100] as const;

// $99,999.99 hard cap — same value as keypad-tab.tsx / register-tab.tsx /
// payment-link-amount-modal.tsx. Inlined to avoid coupling to those files.
const CENTS_CAP = 9999999;

// Tip chip styles (Item 4 / 4a-cash). Shared base + active/idle variants so
// the preset/custom/no-tip chips read as one selectable group. POS dark-mode
// rule (#10): every chip + the custom input carries a dark variant.
const TIP_CHIP_BASE =
  'flex h-11 min-w-[60px] items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors touch-manipulation';
const TIP_CHIP_ACTIVE =
  'border-blue-500 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
const TIP_CHIP_IDLE =
  'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600';

export function CashPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { granted: canOpenDrawer } = usePosPermission('pos.open_close_register');
  const isOnline = useOnlineStatus();

  const amountDue = ticket.total;
  const amountDueCents = toCents(amountDue);
  // Tendered amount lives as integer cents and entry is "fixed-decimal" —
  // every keypad digit shifts the value left by one column. Mirrors the
  // pattern in keypad-tab.tsx and payment-link-amount-modal.tsx.
  const [cents, setCents] = useState(0);
  const [processing, setProcessing] = useState(false);

  // Tip capture (Item 4 / 4a-cash). The canonical tip AMOUNT lives in
  // checkout-context (`checkout.tipAmount`, written via `checkout.setTip`) —
  // we do NOT introduce a second tip-amount container. Only the chip-selection
  // UI state is local. Presets are a % of subtotal, matching the card on-reader
  // tip basis (card-payment.tsx). The tip is recorded independently of the cash
  // tendered: per the locked change-math decision, `change_given` is computed on
  // the service total ONLY (see `changeCents` below), so a tip never enters the
  // tendered/change reconciliation.
  //
  // The chip selection is LAZILY REHYDRATED from the canonical container on
  // mount. checkout-overlay.tsx conditionally renders <CashPayment/>, so it
  // unmounts/remounts on every step change while `checkout.tipAmount`/
  // `tipPercent` persist in the provider. Without rehydration, returning to the
  // cash step would reset the chips to "No tip" while an already-entered tip was
  // still charged (a silent over-charge). Seeding from `tipPercent` (preset) or
  // `tipAmount` (custom) keeps the UI and the single source of truth in
  // agreement. First entry resolves to "No tip"/$0 (openCheckout reset), so the
  // zero-friction default is preserved.
  const [tipSelection, setTipSelection] = useState<number | 'custom' | 'none'>(() =>
    checkout.tipPercent != null
      ? checkout.tipPercent
      : checkout.tipAmount > 0
        ? 'custom'
        : 'none'
  );
  const [customTip, setCustomTip] = useState(() =>
    checkout.tipPercent == null && checkout.tipAmount > 0 ? checkout.tipAmount.toFixed(2) : ''
  );
  const subtotalCents = toCents(ticket.subtotal);

  function selectNoTip() {
    setTipSelection('none');
    setCustomTip('');
    checkout.setTip(0, null);
  }
  function selectPreset(pct: number) {
    setTipSelection(pct);
    setCustomTip('');
    checkout.setTip(fromCents(Math.round((subtotalCents * pct) / 100)), pct);
  }
  function parseCustomTip(raw: string): number {
    const val = parseFloat(raw);
    return isNaN(val) || val < 0 ? 0 : fromCents(toCents(val));
  }
  function selectCustom() {
    setTipSelection('custom');
    checkout.setTip(parseCustomTip(customTip), null);
  }
  function handleCustomTip(e: ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/[^0-9.]/g, '');
    setCustomTip(v);
    checkout.setTip(parseCustomTip(v), null);
  }

  const tenderedDollars = fromCents(cents);
  const displayValue = tenderedDollars.toFixed(2);
  const changeCents = Math.max(0, cents - amountDueCents);
  const changeDollars = fromCents(changeCents);
  const shortDollars = fromCents(Math.max(0, amountDueCents - cents));
  const isValid = cents >= amountDueCents;

  function handleDigit(d: string) {
    if (d === '.') return; // Defensive — `.` is not rendered in amount layout.
    const next = d === '00' ? cents * 100 : cents * 10 + parseInt(d, 10);
    if (next > CENTS_CAP) return;
    setCents(next);
  }

  function handleBackspace() {
    setCents(Math.floor(cents / 10));
  }

  function handleDenomination(denom: number) {
    const next = cents + denom * 100;
    if (next > CENTS_CAP) return; // Reject denominations that would exceed the cap.
    setCents(next);
  }

  async function handleProcessCash() {
    if (!isValid) return;

    // tenderedNum and change are dollars, matching the existing API payload
    // shape and the setCashPayment(tendered, change) context contract used
    // by split-payment.tsx. Local state is cents; conversion happens here.
    const tenderedNum = tenderedDollars;
    const change = changeDollars;

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
            tip_amount: checkout.tipAmount,
            discount_amount: ticket.discountAmount,
            deposit_credit: ticket.depositCredit,
            total_amount: ticket.total,
            payment_method: 'cash',
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
                amount: amountDue,
                tip_amount: checkout.tipAmount,
                cash_tendered: tenderedNum,
                change_given: change,
              },
            ],
          }),
        });

        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Failed to process transaction');
        }

        // Fire-and-forget: kick cash drawer open via print server (skip if no permission)
        if (canOpenDrawer) {
          posFetch('/api/pos/receipts/cash-drawer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).catch(() => { /* drawer kick is best-effort */ });
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
          tip_amount: checkout.tipAmount,
          discount_amount: ticket.discountAmount,
          total_amount: ticket.total,
          coupon_id: ticket.coupon?.id || null,
          coupon_code: ticket.coupon?.code || null,
          loyalty_points_redeemed: ticket.loyaltyPointsToRedeem,
          loyalty_discount: ticket.loyaltyDiscount,
          notes: ticket.notes,
          items: ticket.items.map((i) => {
            const hasPerUnitQty = i.perUnitQty != null && i.perUnitQty > 1;
            return {
              item_type: i.itemType as 'service' | 'product',
              product_id: i.productId || null,
              service_id: i.serviceId || null,
              item_name: i.itemName,
              quantity: hasPerUnitQty ? i.perUnitQty! : i.quantity,
              unit_price: hasPerUnitQty ? i.unitPrice / i.perUnitQty! : i.unitPrice,
              total_price: i.totalPrice,
              tax_amount: i.taxAmount,
              is_taxable: i.isTaxable,
              tier_name: i.tierName || null,
              vehicle_size_class: i.vehicleSizeClass || null,
              notes: i.notes || null,
            };
          }),
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
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-6">
      {/* Header */}
      <div className="text-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">Cash Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {/* Offline banner — full-width below header, above both columns */}
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/30 px-4 py-2 text-sm text-amber-700 dark:text-amber-400">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>Offline — transaction will be queued and synced later</span>
        </div>
      )}

      {/* Tip — optional, zero-friction (Item 4 / 4a-cash). Defaults to "No tip"
          ($0); a no-tip sale needs no interaction here. The selected tip is
          recorded on the transaction + payment row but is intentionally NOT
          added to the cash tendered/change math below (locked change-math
          decision: change is computed on the service total only). */}
      <div className="flex w-full max-w-md flex-col items-center gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Add a tip? (optional)</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={selectNoTip}
            aria-pressed={tipSelection === 'none'}
            className={cn(TIP_CHIP_BASE, tipSelection === 'none' ? TIP_CHIP_ACTIVE : TIP_CHIP_IDLE)}
          >
            No tip
          </button>
          {TIP_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              onClick={() => selectPreset(pct)}
              aria-pressed={tipSelection === pct}
              className={cn(TIP_CHIP_BASE, tipSelection === pct ? TIP_CHIP_ACTIVE : TIP_CHIP_IDLE)}
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            onClick={selectCustom}
            aria-pressed={tipSelection === 'custom'}
            className={cn(TIP_CHIP_BASE, tipSelection === 'custom' ? TIP_CHIP_ACTIVE : TIP_CHIP_IDLE)}
          >
            Custom
          </button>
        </div>

        {tipSelection === 'custom' && (
          <div className="flex items-center gap-2">
            <span className="text-lg text-gray-500 dark:text-gray-400">$</span>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              autoFocus
              value={customTip}
              onChange={handleCustomTip}
              placeholder="0.00"
              aria-label="Custom tip amount"
              className="h-11 w-28 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center text-base text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
            />
          </div>
        )}

        {checkout.tipAmount > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tip:{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              ${checkout.tipAmount.toFixed(2)}
            </span>
          </p>
        )}
      </div>

      {/* Body block — naturally sized to two-column width so the footer
          below can use justify-between to spread Back/Complete to the
          left/right edges of the same column-aligned region. */}
      <div className="flex flex-col gap-4">
        {/* Two-column row */}
        <div className="flex flex-row items-start gap-4">
          {/* Left column — denomination chips, row-aligned with keypad rows.
              Spacers above the button group offset for the right column's
              display+X row (60px) and change/short slot (48px), separated by
              gap-3 (12px). Total offset 60+12+48+12 = 132px puts $10 top
              aligned with keypad row 1 top. Buttons are gap-2 (8px) apart to
              match the keypad's vertical row gap, so $10/$20/$50/$100 row-
              align with keypad rows 1/2/3/4 respectively. The 48px slot
              height comes from the Change variant's natural height: text-xl
              line-height (28px) + py-2 (16px) = 44px, rounded up to 48px to
              absorb small style variance and prevent keypad shift between
              the cents===0 and cents>0 states (Session B-followup-4 fix). */}
          <div className="flex flex-col gap-3">
            <div className="h-[60px]" aria-hidden="true" />
            <div className="h-[48px]" aria-hidden="true" />
            <div className="flex flex-col gap-2">
              {DENOMINATIONS.map((denom) => (
                <button
                  key={denom}
                  type="button"
                  onClick={() => handleDenomination(denom)}
                  className="flex h-[60px] w-[60px] items-center justify-center rounded-xl bg-gray-200 dark:bg-gray-700 text-xl font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-300 dark:hover:bg-gray-600 active:bg-gray-400 dark:active:bg-gray-500 touch-manipulation"
                >
                  ${denom}
                </button>
              ))}
            </div>
          </div>

          {/* Right column — display+X row, change/short row, keypad.
              Default align-items: stretch is required so PinPad fills the
              320px column width (its grid auto-sizes to parent). Centering
              of the 244px display+X and change/short rows is done per-row
              via mx-auto, NOT via items-center on the column — items-center
              would set align-self:center on every child, collapsing PinPad
              to min-content width and rendering keypad cells as narrow pills
              (Session B-followup-2 regression, fixed in B-followup-3). */}
          <div className="flex w-full max-w-xs flex-col gap-3">
            {/* Row 1: tendered display + X clear button.
                Display width is fixed at w-44 (176px) — sufficient for
                $99,999.99 at text-2xl tabular-nums plus padding — so the
                field NEVER widens with content. $ moved inside the box so
                display + X reads as one locked unit. Combined row width:
                176 + 8 (gap) + 60 (X) = 244px. */}
            <div className="mx-auto flex flex-row items-center gap-2">
              <div
                role="status"
                aria-live="polite"
                aria-label="Tendered amount"
                className="flex h-[60px] w-44 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-center text-2xl tabular-nums text-gray-900 dark:text-gray-100"
              >
                ${displayValue}
              </div>
              <button
                type="button"
                onClick={() => setCents(0)}
                disabled={cents === 0}
                aria-label="Clear amount"
                className="flex h-[60px] w-[60px] items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-red-500 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-800 active:scale-[0.97] touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white dark:disabled:hover:bg-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Row 2: change / short slot. Fixed-size 244×48 wrapper that
                ALWAYS occupies the same vertical space, so the keypad never
                shifts between cents===0 and cents>0. Inner box (when cents>0)
                fills the wrapper via h-full / w-full. 48px chosen to fully
                contain the Change variant's natural height (text-xl line
                28px + py-2 16px = 44px) with 4px headroom — Session
                B-followup-2 used min-h-[40px] which the Change variant
                overflowed by 4px, causing the keypad to drop on every
                transition into a fully-tendered state. */}
            <div className="mx-auto h-[48px] w-[244px]">
              {cents > 0 && (
                <div
                  className={cn(
                    'flex h-full w-full items-center justify-center rounded-lg px-6 text-center',
                    isValid ? 'bg-green-50 dark:bg-green-900/30' : 'bg-red-50 dark:bg-red-900/30'
                  )}
                >
                  {isValid ? (
                    <p className="text-base">
                      Change:{' '}
                      <span className="text-xl font-bold text-green-700 dark:text-green-400 tabular-nums">
                        ${changeDollars.toFixed(2)}
                      </span>
                    </p>
                  ) : (
                    <p className="text-base text-red-600 dark:text-red-400 tabular-nums">
                      Short ${shortDollars.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Row 3: keypad — unchanged from PinPad shared component. */}
            <PinPad
              onDigit={handleDigit}
              onBackspace={handleBackspace}
              layoutVariant="amount"
              size="default"
            />
          </div>
        </div>

        {/* Error — full-width above footer, inside the body block so it
            spans the same column-aligned width as the footer row. */}
        {checkout.error && (
          <p className="w-full text-sm text-red-600 dark:text-red-400">{checkout.error}</p>
        )}

        {/* Footer — Back far-left, Complete far-right, spread to the body block edges */}
        <div className="flex w-full justify-between">
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
    </div>
  );
}
