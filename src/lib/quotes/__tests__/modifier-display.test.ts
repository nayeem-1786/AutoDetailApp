import { describe, it, expect } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-v — pins the shared modifier-row resolver consumed by
// all 4 customer-facing quote surfaces (public landing, email HTML, email
// text, PDF) and the POS saved-quote review. Each surface renders its own
// visual representation; this resolver supplies the data + conditional
// "should render" logic + the canonical manual-discount percent → dollar
// resolution (via the shared `resolveManualDiscountAmount` resolver).
//
// Pre-Layer-15g-v: 4 of 4 customer surfaces showed Subtotal + Tax + Total
// only — no modifier breakdown. Audit: docs/dev/QUOTE_TOTAL_AND_RECEIPT_
// AUDIT_2026-05-16.md §2.
// ──────────────────────────────────────────────────────────────────────────────

import {
  resolveQuoteModifierRows,
  hasQuoteModifierRows,
} from '../modifier-display';

describe('resolveQuoteModifierRows', () => {
  it('returns empty when no modifier applied', () => {
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        coupon_code: null,
        coupon_discount: null,
        loyalty_points_to_redeem: null,
        loyalty_discount: null,
        manual_discount_type: null,
        manual_discount_value: null,
        manual_discount_label: null,
      })
    ).toEqual([]);
  });

  it('returns coupon row when coupon_code + positive coupon_discount', () => {
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
    });
    expect(rows).toEqual([
      { kind: 'coupon', label: 'Coupon (SAVE25)', amount: 25 },
    ]);
  });

  it('omits coupon row when coupon_code present but discount zero/null', () => {
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        coupon_code: 'SAVE25',
        coupon_discount: 0,
      })
    ).toEqual([]);
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        coupon_code: 'SAVE25',
        coupon_discount: null,
      })
    ).toEqual([]);
  });

  it('omits coupon row when discount positive but code missing', () => {
    // Edge case: corrupted snapshot. Render conservatively (no row) since
    // we have no label to display.
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        coupon_code: null,
        coupon_discount: 25,
      })
    ).toEqual([]);
  });

  it('returns loyalty row with points label when both points + discount positive', () => {
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
    });
    expect(rows).toEqual([
      { kind: 'loyalty', label: 'Loyalty (100 pts)', amount: 5 },
    ]);
  });

  it('returns loyalty row without points when only discount populated', () => {
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      loyalty_discount: 5,
    });
    expect(rows).toEqual([
      { kind: 'loyalty', label: 'Loyalty', amount: 5 },
    ]);
  });

  it('returns manual row with operator label when supplied', () => {
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      manual_discount_type: 'dollar',
      manual_discount_value: 30,
      manual_discount_label: 'First-time customer',
    });
    expect(rows).toEqual([
      { kind: 'manual', label: 'First-time customer', amount: 30 },
    ]);
  });

  it('falls back to "Manual discount" label when operator label missing or whitespace', () => {
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        manual_discount_type: 'dollar',
        manual_discount_value: 30,
        manual_discount_label: null,
      })
    ).toEqual([{ kind: 'manual', label: 'Manual discount', amount: 30 }]);
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        manual_discount_type: 'dollar',
        manual_discount_value: 30,
        manual_discount_label: '   ',
      })
    ).toEqual([{ kind: 'manual', label: 'Manual discount', amount: 30 }]);
  });

  it('resolves manual_discount type=percent against subtotal', () => {
    // 10% of $200 = $20 — must NOT render the raw value 10
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      manual_discount_type: 'percent',
      manual_discount_value: 10,
      manual_discount_label: 'Loyalty member',
    });
    expect(rows).toEqual([
      { kind: 'manual', label: 'Loyalty member', amount: 20 },
    ]);
  });

  it('clamps manual_discount type=dollar to subtotal', () => {
    // dollar value > subtotal → clamp to subtotal (matches convert-service
    // resolver — keeps appointment + quote receipts consistent)
    const rows = resolveQuoteModifierRows({
      subtotal: 50,
      manual_discount_type: 'dollar',
      manual_discount_value: 200,
      manual_discount_label: 'Over-discount',
    });
    expect(rows).toEqual([
      { kind: 'manual', label: 'Over-discount', amount: 50 },
    ]);
  });

  it('omits manual row when type/value collapse to null', () => {
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        manual_discount_type: 'dollar',
        manual_discount_value: 0,
        manual_discount_label: 'Zero',
      })
    ).toEqual([]);
    expect(
      resolveQuoteModifierRows({
        subtotal: 200,
        manual_discount_type: null,
        manual_discount_value: 30,
        manual_discount_label: 'Type missing',
      })
    ).toEqual([]);
  });

  it('returns all three rows in coupon → loyalty → manual order (matches <QuoteTotals>)', () => {
    const rows = resolveQuoteModifierRows({
      subtotal: 200,
      coupon_code: 'SAVE25',
      coupon_discount: 25,
      loyalty_points_to_redeem: 100,
      loyalty_discount: 5,
      manual_discount_type: 'dollar',
      manual_discount_value: 15,
      manual_discount_label: 'Cashier override',
    });
    expect(rows.map((r) => r.kind)).toEqual(['coupon', 'loyalty', 'manual']);
  });

  it('handles Supabase string-numeric coercion (NUMERIC-as-string)', () => {
    // Supabase returns NUMERIC columns as strings via the JS client; the
    // resolver must accept them.
    const rows = resolveQuoteModifierRows({
      subtotal: '200',
      coupon_code: 'SAVE25',
      coupon_discount: '25.50' as unknown as number,
    });
    expect(rows).toEqual([
      { kind: 'coupon', label: 'Coupon (SAVE25)', amount: 25.5 },
    ]);
  });
});

describe('hasQuoteModifierRows', () => {
  it('returns false when no modifier applied', () => {
    expect(
      hasQuoteModifierRows({
        subtotal: 200,
      })
    ).toBe(false);
  });

  it('returns true when any modifier renders', () => {
    expect(
      hasQuoteModifierRows({
        subtotal: 200,
        coupon_code: 'SAVE25',
        coupon_discount: 25,
      })
    ).toBe(true);
    expect(
      hasQuoteModifierRows({
        subtotal: 200,
        loyalty_discount: 5,
      })
    ).toBe(true);
    expect(
      hasQuoteModifierRows({
        subtotal: 200,
        manual_discount_type: 'dollar',
        manual_discount_value: 30,
      })
    ).toBe(true);
  });
});
