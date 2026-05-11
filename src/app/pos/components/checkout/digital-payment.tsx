'use client';

/**
 * Phase 1A.5 Part A — POS digital payment screen.
 *
 * Flow:
 *   1. Platform picker: Zelle / Venmo / AppleCash / Other...
 *   2. "Other" reveals a text input for free-text platform name (max 30
 *      chars, trimmed, must not match one of the 3 canonical platforms).
 *   3. Confirm → POST /api/pos/transactions with payment_method='digital'
 *      and payments[0].digital_platform = canonical lowercase key.
 *
 * Permission gate: pos.process_cash (digital is cash-equivalent — no card
 * fee, no PCI scope). Future session may introduce pos.process_digital
 * if stricter gating is needed.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { posFetch } from '../../lib/pos-fetch';
import { useTicket } from '../../context/ticket-context';
import { useCheckout } from '../../context/checkout-context';
import { usePosPermission } from '../../context/pos-permission-context';
import { cn } from '@/lib/utils/cn';

// Canonical lowercase platform keys persisted to payments.digital_platform.
const CANONICAL_KEYS = ['zelle', 'venmo', 'apple_cash'] as const;
type CanonicalKey = typeof CANONICAL_KEYS[number];

// Display labels for the 3 fixed-option buttons.
const PLATFORM_LABELS: Record<CanonicalKey, string> = {
  zelle: 'Zelle',
  venmo: 'Venmo',
  apple_cash: 'AppleCash',
};

// LOCKED-A5 validation. Returns error string or null when valid.
function validateOtherPlatform(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return 'Platform name is required';
  if (trimmed.length > 30) return 'Platform name must be 30 characters or fewer';
  if (!/^[a-zA-Z0-9 \-]+$/.test(trimmed)) {
    return 'Only letters, numbers, spaces, and hyphens are allowed';
  }
  const lower = trimmed.toLowerCase();
  // Reject if the free-text matches one of the canonical platforms — the
  // cashier should pick the canonical option instead so reporting groups
  // consistently.
  if (lower === 'zelle' || lower === 'venmo' || lower === 'applecash' || lower === 'apple cash' || lower === 'apple_cash') {
    return 'Use the dedicated button for that platform';
  }
  return null;
}

export function DigitalPayment() {
  const { ticket, dispatch } = useTicket();
  const checkout = useCheckout();
  const { granted: canOpenDrawer } = usePosPermission('pos.open_close_register');

  const amountDue = ticket.total;
  // Two-step flow: picker → (if Other) free-text → process.
  const [mode, setMode] = useState<'picker' | 'other-input'>('picker');
  const [otherInput, setOtherInput] = useState('');
  const [otherError, setOtherError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  async function submitDigital(platformKey: string) {
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
          deposit_credit: ticket.depositCredit,
          total_amount: ticket.total,
          payment_method: 'digital',
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
              method: 'digital',
              amount: amountDue,
              tip_amount: 0,
              digital_platform: platformKey,
            },
          ],
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to process digital payment');
      }

      // Digital payments don't trigger the drawer (no cash to put away), but
      // staff may still want it open for receipt printing. Mirror the check
      // flow: best-effort drawer kick only if permission granted.
      if (canOpenDrawer) {
        posFetch('/api/pos/receipts/cash-drawer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => { /* drawer kick is best-effort */ });
      }

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
      toast.error(err instanceof Error ? err.message : 'Digital payment failed');
      checkout.setError(err instanceof Error ? err.message : 'Digital payment failed');
    } finally {
      setProcessing(false);
    }
  }

  function handleCanonical(key: CanonicalKey) {
    void submitDigital(key);
  }

  function handleOtherConfirm() {
    const validationError = validateOtherPlatform(otherInput);
    if (validationError) {
      setOtherError(validationError);
      return;
    }
    setOtherError(null);
    // Canonicalize: lowercase, single-spaced, trimmed.
    const canonical = otherInput.trim().toLowerCase().replace(/\s+/g, ' ');
    void submitDigital(canonical);
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-8 px-8 py-12">
      <div className="text-center">
        <Smartphone className="mx-auto mb-2 h-8 w-8 text-blue-600 dark:text-blue-400" />
        <p className="text-lg text-gray-500 dark:text-gray-400">Digital Payment</p>
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-gray-100">
          ${amountDue.toFixed(2)}
        </p>
      </div>

      {mode === 'picker' && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Select payment platform
          </p>
          {CANONICAL_KEYS.map((key) => (
            <button
              key={key}
              onClick={() => handleCanonical(key)}
              disabled={processing}
              className={cn(
                'h-14 w-full rounded-lg border-2 border-gray-200 dark:border-gray-700 text-lg font-semibold text-gray-900 dark:text-gray-100 transition-all',
                processing
                  ? 'cursor-not-allowed opacity-40'
                  : 'hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-[0.99]'
              )}
            >
              {PLATFORM_LABELS[key]}
            </button>
          ))}
          <button
            onClick={() => {
              setOtherInput('');
              setOtherError(null);
              setMode('other-input');
            }}
            disabled={processing}
            className={cn(
              'h-14 w-full rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-lg font-medium text-gray-700 dark:text-gray-300 transition-all',
              processing
                ? 'cursor-not-allowed opacity-40'
                : 'hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-[0.99]'
            )}
          >
            Other…
          </button>
        </div>
      )}

      {mode === 'other-input' && (
        <div className="flex w-full max-w-md flex-col gap-3">
          <label
            htmlFor="digital-other-input"
            className="text-sm text-gray-600 dark:text-gray-400"
          >
            Platform name
          </label>
          <input
            id="digital-other-input"
            type="text"
            value={otherInput}
            autoFocus
            maxLength={30}
            placeholder="Cash App, Wise, PayPal…"
            onChange={(e) => {
              setOtherInput(e.target.value);
              if (otherError) setOtherError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !processing) handleOtherConfirm();
            }}
            className="h-14 w-full rounded-lg border border-gray-300 dark:border-gray-600 px-4 text-lg text-gray-900 dark:text-gray-100 focus:border-blue-400 dark:focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
          />
          {otherError && (
            <p className="text-sm text-red-600 dark:text-red-400">{otherError}</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Max 30 characters. Letters, numbers, spaces, hyphens.
          </p>
          <div className="mt-2 flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setOtherInput('');
                setOtherError(null);
                setMode('picker');
              }}
              disabled={processing}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleOtherConfirm}
              disabled={processing}
              className="flex-1 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600"
            >
              {processing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Confirm'}
            </Button>
          </div>
        </div>
      )}

      {checkout.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{checkout.error}</p>
      )}

      {mode === 'picker' && (
        <Button
          variant="outline"
          onClick={() => checkout.setStep('payment-method')}
          disabled={processing}
        >
          Back
        </Button>
      )}
    </div>
  );
}
