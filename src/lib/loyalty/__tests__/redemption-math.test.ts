import { describe, expect, it } from 'vitest';
import {
  pointsToCents,
  centsToPoints,
  getRedeemableRange,
} from '../redemption-math';
import { LOYALTY } from '@/lib/utils/constants';

// Phase 1 helper tests. Lock the canonical redemption math surfaced in the
// JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Section 0 row 8. Earn math is
// Phase 1.5 (out of scope) per Q4 lock.

describe('pointsToCents', () => {
  it('zero points → zero cents', () => {
    expect(pointsToCents(0)).toBe(0);
  });

  it('100 points → 500 cents ($5.00 at LOYALTY.REDEEM_RATE_CENTS)', () => {
    expect(pointsToCents(100)).toBe(500);
    // Anchor against the canonical constant
    expect(pointsToCents(100)).toBe(100 * LOYALTY.REDEEM_RATE_CENTS);
  });

  it('1 point → 5 cents (the atom)', () => {
    expect(pointsToCents(1)).toBe(5);
  });
});

describe('centsToPoints — no clamp', () => {
  it('exact multiple: 500 cents → 100 points', () => {
    expect(centsToPoints(500)).toBe(100);
  });

  it('above multiple: 501 cents → 101 points (Math.ceil favors customer)', () => {
    // The customer typed an amount that doesn't divide evenly by 5¢/point.
    // Math.ceil rounds UP so they never under-redeem for the value they
    // intended. The UX-boundary rounding that picks the FINAL actualDiscount
    // (e.g., "you typed $5.01, we'll round to $5.00") is consumer
    // responsibility — kept at loyalty-panel.tsx per Q3 lock.
    expect(centsToPoints(501)).toBe(101);
  });

  it('zero cents → zero points', () => {
    expect(centsToPoints(0)).toBe(0);
  });
});

describe('centsToPoints — with clampToBalance', () => {
  it('clamp binds: 500 cents requested but only 80 pts available → 80', () => {
    expect(centsToPoints(500, 80)).toBe(80);
  });

  it('clamp does not bind: 500 cents requested, 200 pts available → 100 (raw calc wins)', () => {
    expect(centsToPoints(500, 200)).toBe(100);
  });

  it('negative clamp treated as 0 (defensive)', () => {
    // A customer with a negative loyalty balance shouldn't redeem ANY
    // points. Defensive max(0, clamp) prevents the raw calc from
    // returning a positive number when the clamp is invalid input.
    expect(centsToPoints(500, -10)).toBe(0);
  });
});

describe('getRedeemableRange', () => {
  it('below REDEEM_MINIMUM: returns {0, 0} (UI disable signal)', () => {
    // 50 pts < LOYALTY.REDEEM_MINIMUM (100). UI uses maxPoints>0 as the
    // enable signal.
    expect(
      getRedeemableRange({ balancePoints: 50, subtotalCents: 10000 })
    ).toEqual({ minPoints: 0, maxPoints: 0 });
  });

  it('at REDEEM_MINIMUM with large ticket: balance is the binding cap', () => {
    // 100 pts ($5.00) vs $100 ticket: redemption capped at the balance.
    expect(
      getRedeemableRange({ balancePoints: 100, subtotalCents: 10000 })
    ).toEqual({ minPoints: 100, maxPoints: 100 });
  });

  it('large balance, small ticket: ticket is the binding cap', () => {
    // 1000 pts ($50) vs $20 ticket: ticket caps redemption at $20 = 400 pts.
    expect(
      getRedeemableRange({ balancePoints: 1000, subtotalCents: 2000 })
    ).toEqual({ minPoints: 100, maxPoints: 400 });
  });

  it('mid-balance, large ticket: balance is the binding cap', () => {
    // 200 pts ($10) vs $100 ticket: redemption capped at the balance.
    expect(
      getRedeemableRange({ balancePoints: 200, subtotalCents: 10000 })
    ).toEqual({ minPoints: 100, maxPoints: 200 });
  });

  it('subtotal-cap with fractional points: Math.floor rounds DOWN (favors business)', () => {
    // $4.99 ticket = 499 cents = 99.8 points. The cap rounds DOWN to 99
    // — opposite of centsToPoints's Math.ceil. Symmetric trust model:
    // customer-favoring round on entry, business-favoring round on cap.
    // But because 99 < REDEEM_MINIMUM (100), the helper's eligibility
    // gate at the top of the function never fires here — the gate fires
    // on balance, not on cap. With balance=200 (eligible), the cap
    // returns maxPoints=99 even though that's below the minimum. UI
    // should clamp the redemption input to [minPoints, maxPoints]; when
    // maxPoints < minPoints the redemption surface is effectively
    // disabled (no valid value exists). This is the documented contract.
    expect(
      getRedeemableRange({ balancePoints: 200, subtotalCents: 499 })
    ).toEqual({ minPoints: 100, maxPoints: 99 });
  });
});
