/**
 * Loyalty redemption math — cents-canonical helpers consolidated per
 * Phase 1 of the Job Receipt Unification arc (Option A).
 *
 * See docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Section 0 row 8.
 *
 * Today the redemption math is inlined at multiple sites with no shared
 * helper — most notably the client-side conversion at
 * src/app/pos/components/loyalty-panel.tsx:70-72:
 *
 *   pointsToRedeem = Math.ceil(clamped / LOYALTY.REDEEM_RATE)
 *   actualDiscount = Math.round(
 *     Math.min(pointsToRedeem * LOYALTY.REDEEM_RATE, maxRedemption) * 100
 *   ) / 100
 *
 * Plus 4 other read/display sites that all touch LOYALTY.* constants
 * directly. Phase 1 adds these helpers; Phase 2 migrates consumers.
 *
 * SCOPE-LIMITED for Phase 1:
 *   - Redemption math only (points ↔ cents + redeemable range).
 *   - Earn math is OUT OF SCOPE — deferred to Phase 1.5 per Q4 lock.
 *     Server earn (pos/transactions/route.ts:510) is canonical via
 *     LOYALTY.EARN_RATE; legacy earn (loyalty/earn/route.ts:60-61) has a
 *     discount-exclusion inconsistency that needs its own resolution.
 *   - UX-boundary rounding (loyalty-panel.tsx's actualDiscount round)
 *     stays at the consumer site per Q3 lock; this module is pure math.
 *
 * UNITS: cents-canonical. Uses LOYALTY.REDEEM_RATE_CENTS (5 cents/point),
 * the integer-cents counterpart to the legacy float LOYALTY.REDEEM_RATE
 * (0.05). Both constants coexist through the Money-Unify epic; one will
 * be removed at Unify-Final.
 */

import { LOYALTY } from '@/lib/utils/constants';

/**
 * Convert loyalty points → cents at the canonical rate (5¢/point).
 *
 * Integer math throughout. 0 points → 0 cents (the trivial case).
 *
 * @example
 *   pointsToCents(100) // 500 (= $5.00)
 *   pointsToCents(1)   // 5
 *   pointsToCents(0)   // 0
 */
export function pointsToCents(points: number): number {
  return points * LOYALTY.REDEEM_RATE_CENTS;
}

/**
 * Convert cents → points (the redemption-entry helper used when the
 * operator/customer types a dollar amount).
 *
 * `Math.ceil` semantics favor the customer: $5.01 needs at least 101
 * points (not 100), so the customer never under-redeems for the dollar
 * value they typed. The UX-boundary rounding that picks the FINAL
 * actualDiscount (e.g., "you typed $5.01, we'll round to $5.00") is
 * caller responsibility — Phase 1 keeps this helper pure.
 *
 * `clampToBalance` caps the returned points at the customer's available
 * balance. A request for more than the customer has resolves to
 * exactly the balance. When omitted, returns the raw point calculation
 * (useful for math-test contexts and edge-case detection).
 *
 * Negative `clampToBalance` is treated as 0 (defensive — a customer
 * with a negative loyalty balance shouldn't redeem ANY points).
 *
 * @example
 *   centsToPoints(500)        // 100
 *   centsToPoints(501)        // 101 (ceil — favors customer)
 *   centsToPoints(0)          // 0
 *   centsToPoints(500, 80)    // 80 (clamped — customer only has 80 pts)
 *   centsToPoints(500, 200)   // 100 (clamp didn't bind)
 */
export function centsToPoints(cents: number, clampToBalance?: number): number {
  const raw = Math.ceil(cents / LOYALTY.REDEEM_RATE_CENTS);
  if (clampToBalance === undefined) return raw;
  return Math.min(raw, Math.max(0, clampToBalance));
}

/**
 * Compute the customer's redeemable point range against a ticket.
 *
 * Returns `{minPoints: 0, maxPoints: 0}` when balance is below
 * LOYALTY.REDEEM_MINIMUM (100 today) — the redemption surface is
 * disabled. UI uses `maxPoints > 0` as the enable signal.
 *
 * Cap order:
 *   1. minPoints = LOYALTY.REDEEM_MINIMUM when eligible, else 0.
 *   2. maxPoints = min(balance-in-cents, ticket-subtotal-in-cents),
 *      then convert back to points (floored — never grant fractional
 *      points worth more than the ceiling).
 *
 * The subtotal cap protects against redeeming more than the ticket value
 * — a customer with 1000 points ($50) shouldn't redeem $50 against a
 * $20 ticket. The balance cap protects against over-redemption beyond
 * available points. Both caps coexist; `maxPoints` is the lower of the
 * two converted to points.
 *
 * Math.floor on maxPoints is intentional: if the subtotal-cap is $4.99
 * (499 cents = 99.8 points), the customer can redeem at most 99 points
 * — favoring the business by rounding DOWN on the cap, opposite of
 * centsToPoints's customer-favoring Math.ceil.
 *
 * @example
 *   getRedeemableRange({balancePoints: 50, subtotalCents: 10000})
 *     // {minPoints: 0, maxPoints: 0} — below REDEEM_MINIMUM
 *   getRedeemableRange({balancePoints: 100, subtotalCents: 10000})
 *     // {minPoints: 100, maxPoints: 100} — at minimum, ticket > balance
 *   getRedeemableRange({balancePoints: 1000, subtotalCents: 2000})
 *     // {minPoints: 100, maxPoints: 400} — ticket caps below balance
 *   getRedeemableRange({balancePoints: 200, subtotalCents: 10000})
 *     // {minPoints: 100, maxPoints: 200} — balance caps below ticket
 */
export function getRedeemableRange(input: {
  balancePoints: number;
  subtotalCents: number;
}): { minPoints: number; maxPoints: number } {
  if (input.balancePoints < LOYALTY.REDEEM_MINIMUM) {
    return { minPoints: 0, maxPoints: 0 };
  }
  const balanceCappedCents = pointsToCents(input.balancePoints);
  const effectiveCents = Math.min(balanceCappedCents, input.subtotalCents);
  const maxPoints = Math.floor(effectiveCents / LOYALTY.REDEEM_RATE_CENTS);
  return { minPoints: LOYALTY.REDEEM_MINIMUM, maxPoints };
}
