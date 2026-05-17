/**
 * Item 15g Layer 15g-iii — shared modifier summary block.
 *
 * Renders read-only rows for coupon / loyalty / manual-discount applied
 * to an appointment. Used by:
 *  - Admin Appointment dialog (`appointment-detail-dialog.tsx`).
 *  - POS Jobs card "Services" tile (`job-detail.tsx`).
 *
 * Hidden when no modifier is applied — `hasAppliedModifiers()` returns
 * false in that case and consumers should not render the component.
 * (Component itself also short-circuits to `null` defensively.)
 *
 * Display only. Edits go through POS — Phase 1 (Item 15f layers 8a-8f)
 * will route operator edits back to the Sale tab where modifiers can
 * be modified through the normal ticket UX.
 */
'use client';

import { Star, Tag } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

export interface ModifierSummaryInput {
  coupon_code: string | null | undefined;
  coupon_discount: number | null | undefined;
  loyalty_points_redeemed: number | null | undefined;
  loyalty_discount: number | null | undefined;
  manual_discount_value: number | null | undefined;
  manual_discount_label: string | null | undefined;
}

function isNonZero(value: number | null | undefined): boolean {
  return value != null && Number(value) > 0;
}

/**
 * Returns true if at least one modifier row will render. Consumers gate
 * the whole block on this so an empty container never ships to the DOM.
 */
export function hasAppliedModifiers(input: ModifierSummaryInput): boolean {
  if (input.coupon_code && isNonZero(input.coupon_discount)) return true;
  if (
    isNonZero(input.loyalty_points_redeemed) ||
    isNonZero(input.loyalty_discount)
  ) {
    return true;
  }
  if (isNonZero(input.manual_discount_value)) return true;
  return false;
}

interface ModifierSummaryProps extends ModifierSummaryInput {
  /**
   * Visual variant. `admin` matches the Admin Appointment dialog (light
   * theme only, smaller text). `pos` matches the POS Jobs card Services
   * tile (dark-mode-aware, slightly more padded).
   */
  variant?: 'admin' | 'pos';
}

export function ModifierSummary({
  coupon_code,
  coupon_discount,
  loyalty_points_redeemed,
  loyalty_discount,
  manual_discount_value,
  manual_discount_label,
  variant = 'admin',
}: ModifierSummaryProps) {
  if (
    !hasAppliedModifiers({
      coupon_code,
      coupon_discount,
      loyalty_points_redeemed,
      loyalty_discount,
      manual_discount_value,
      manual_discount_label,
    })
  ) {
    return null;
  }

  const showCoupon = !!coupon_code && isNonZero(coupon_discount);
  const showLoyalty =
    isNonZero(loyalty_points_redeemed) || isNonZero(loyalty_discount);
  const showManual = isNonZero(manual_discount_value);

  const isPos = variant === 'pos';
  const rowClass = isPos
    ? 'flex items-center justify-between text-sm'
    : 'flex items-center justify-between text-sm';
  const labelClass = isPos
    ? 'flex items-center gap-1.5 text-gray-600 dark:text-gray-400'
    : 'flex items-center gap-1.5 text-gray-600';
  const valueClass = isPos
    ? 'text-gray-900 dark:text-gray-100 tabular-nums'
    : 'text-gray-900 tabular-nums';
  const containerClass = isPos
    ? 'mt-2 space-y-1 border-t border-gray-100 dark:border-gray-800 pt-2'
    : 'mt-3 space-y-1 border-t border-gray-100 pt-3';
  const headingClass = isPos
    ? 'text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400'
    : 'text-xs font-medium uppercase tracking-wide text-gray-500';
  const iconClass = isPos
    ? 'h-3.5 w-3.5 text-gray-400 dark:text-gray-500'
    : 'h-3.5 w-3.5 text-gray-400';

  return (
    <div className={containerClass}>
      <p className={headingClass}>Applied Discounts</p>
      {showCoupon && (
        <div className={rowClass} data-testid="modifier-coupon">
          <span className={labelClass}>
            <Tag className={iconClass} aria-hidden="true" />
            Coupon ({coupon_code})
          </span>
          <span className={valueClass}>
            −{formatCurrency(Number(coupon_discount ?? 0))}
          </span>
        </div>
      )}
      {showLoyalty && (
        <div className={rowClass} data-testid="modifier-loyalty">
          <span className={labelClass}>
            <Star className={iconClass} aria-hidden="true" />
            Loyalty
            {isNonZero(loyalty_points_redeemed)
              ? ` (${Number(loyalty_points_redeemed)} pts)`
              : ''}
          </span>
          <span className={valueClass}>
            −{formatCurrency(Number(loyalty_discount ?? 0))}
          </span>
        </div>
      )}
      {showManual && (
        <div className={rowClass} data-testid="modifier-manual">
          <span className={labelClass}>
            <Tag className={iconClass} aria-hidden="true" />
            {manual_discount_label?.trim()
              ? manual_discount_label
              : 'Manual discount'}
          </span>
          <span className={valueClass}>
            −{formatCurrency(Number(manual_discount_value ?? 0))}
          </span>
        </div>
      )}
    </div>
  );
}
