import { describe, expect, it } from 'vitest';
import {
  resolveBookingLoyaltyRedemption,
  insufficientLoyaltyErrorMessage,
  detectLoyaltyOverspend,
} from '../redemption-guard';
import { pointsToCents } from '../redemption-math';
import { LOYALTY } from '@/lib/utils/constants';

// Q2 — Loyalty redemption guard (hardened defer of the double-spend window).
// Pure-logic locks for the two in-scope surfaces:
//   - resolveBookingLoyaltyRedemption: booking affordability + canonical
//     discount recompute (anti-tamper).
//   - detectLoyaltyOverspend: close-out observational over-redemption flag.
// The structural debit-at-booking fix is deferred to Option A Phase 3.
// Audit: docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Q2 follow-up.

describe('resolveBookingLoyaltyRedemption — affordability', () => {
  it('redemption within balance → ok, discount recomputed canonically from points', () => {
    const res = resolveBookingLoyaltyRedemption(100, 250);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loyaltyPoints).toBe(100);
      // Canonical: pointsToCents(100)/100 = 500/100 = $5.00
      expect(res.loyaltyDiscount).toBe(pointsToCents(100) / 100);
      expect(res.loyaltyDiscount).toBe(5);
    }
  });

  it('redemption EXACTLY equal to balance → ok (boundary, not rejected)', () => {
    const res = resolveBookingLoyaltyRedemption(200, 200);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loyaltyPoints).toBe(200);
      expect(res.loyaltyDiscount).toBe(pointsToCents(200) / 100);
    }
  });

  it('redemption exceeding balance → not ok, carries requested + available for the 422 message', () => {
    const res = resolveBookingLoyaltyRedemption(300, 100);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.requestedPoints).toBe(300);
      expect(res.availableBalance).toBe(100);
    }
  });

  it('over-redemption by ONE point → still rejected (no off-by-one slack)', () => {
    const res = resolveBookingLoyaltyRedemption(101, 100);
    expect(res.ok).toBe(false);
  });

  it('zero requested points → ok, no discount, no balance dependency', () => {
    // availableBalance is irrelevant when 0 points requested; caller skips the
    // balance read entirely in this branch.
    const res = resolveBookingLoyaltyRedemption(0, 0);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loyaltyPoints).toBe(0);
      expect(res.loyaltyDiscount).toBe(0);
    }
  });

  it('new customer (balance 0) requesting any points → rejected', () => {
    const res = resolveBookingLoyaltyRedemption(50, 0);
    expect(res.ok).toBe(false);
  });
});

describe('resolveBookingLoyaltyRedemption — anti-tamper (server recompute)', () => {
  it('discount is DERIVED from points, never read from a client value', () => {
    // The function signature does not accept a client-submitted discount: the
    // only way to obtain loyaltyDiscount is the canonical recompute. A tampered
    // client `loyalty_discount` (e.g. $999) cannot influence the result because
    // it is structurally absent here. Anchor the derivation against the
    // canonical constant so a future rate change keeps this honest.
    const res = resolveBookingLoyaltyRedemption(100, 1000);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loyaltyDiscount).toBe((100 * LOYALTY.REDEEM_RATE_CENTS) / 100);
    }
  });

  it('matches an UNTAMPERED client computation (points * REDEEM_RATE) — legitimate bookings unchanged', () => {
    for (const points of [100, 120, 240, 500]) {
      const res = resolveBookingLoyaltyRedemption(points, 1000);
      expect(res.ok).toBe(true);
      if (res.ok) {
        // The client computes points * LOYALTY.REDEEM_RATE; the server computes
        // pointsToCents(points)/100. For integer points these are equal in
        // value — assert within a cent to allow for float representation.
        expect(Math.abs(res.loyaltyDiscount - points * LOYALTY.REDEEM_RATE)).toBeLessThan(0.005);
      }
    }
  });
});

describe('insufficientLoyaltyErrorMessage', () => {
  it('names the requested and available points', () => {
    expect(insufficientLoyaltyErrorMessage(300, 100)).toBe(
      'Insufficient loyalty balance — requested 300 points, have 100 available'
    );
  });
});

describe('detectLoyaltyOverspend — close-out observational flag', () => {
  it('redemption within balance → null (no audit_log row)', () => {
    expect(detectLoyaltyOverspend(50, 100)).toBeNull();
  });

  it('redemption EXACTLY equal to balance → null (boundary, affordable)', () => {
    expect(detectLoyaltyOverspend(100, 100)).toBeNull();
  });

  it('redemption exceeding balance → descriptor with correct delta (double-spend signature)', () => {
    const over = detectLoyaltyOverspend(120, 50);
    expect(over).not.toBeNull();
    expect(over).toEqual({
      requestedPoints: 120,
      availableBalance: 50,
      overspendDelta: 70,
    });
  });

  it('balance drained to 0 between booking and close-out → full-amount overspend flagged', () => {
    // The canonical double-spend: first appointment closed out (balance now 0),
    // the second close-out still carries the booking-time redemption.
    const over = detectLoyaltyOverspend(50, 0);
    expect(over).not.toBeNull();
    expect(over?.overspendDelta).toBe(50);
  });
});
