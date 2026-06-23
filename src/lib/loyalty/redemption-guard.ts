/**
 * Q2 — Loyalty redemption guard (hardened defer of the double-spend window).
 *
 * Audit: docs/dev/JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md (Q2 follow-up).
 * Roadmap: docs/dev/ROADMAP-13-ITEMS.md — Q2 ledger row.
 *
 * BACKGROUND. Loyalty redemption is recorded on the appointment at booking
 * time (appointments.loyalty_points_redeemed + loyalty_discount) but the
 * spendable balance (customers.loyalty_points_balance) is debited only at POS
 * close-out via an unlocked read-modify-write. Between booking and close-out a
 * customer can hold two appointments each redeeming the SAME balance — the
 * "double-spend window." The structural fix (debit/reserve at booking, with a
 * cancellation-restore counterpart) is DEFERRED to Option A Phase 3 (open
 * transaction lifecycle), which MUST close the concurrency window.
 *
 * These two PURE helpers harden the two in-scope surfaces WITHOUT debiting at
 * booking (no schema change, no cancellation-flow impact):
 *
 *   1. resolveBookingLoyaltyRedemption — booking validates the requested
 *      redemption against the LIVE balance (affordability) and recomputes the
 *      discount canonically from points (the client-submitted loyalty_discount
 *      is NEVER trusted — anti-tamper). It does NOT debit; the residual
 *      concurrency window (two bookings before either closes out) is the
 *      documented, accepted Q2 deferral.
 *
 *   2. detectLoyaltyOverspend — close-out flags when a redemption would spend
 *      MORE points than the customer currently has (the double-spend
 *      signature). OBSERVATIONAL only: the caller writes an audit_log row and
 *      still proceeds (the existing Math.max(0, ...) clamp is unchanged). This
 *      converts a previously-silent over-redemption into a queryable event.
 */
import { pointsToCents } from './redemption-math';

export type BookingLoyaltyResolution =
  | { ok: true; loyaltyPoints: number; loyaltyDiscount: number }
  | { ok: false; requestedPoints: number; availableBalance: number };

/**
 * Validate + canonicalize a booking-time loyalty redemption.
 *
 * - requestedPoints <= 0 → no redemption (0 points, $0 discount); the caller
 *   can skip the balance read entirely.
 * - requestedPoints > availableBalance → { ok: false } carrying both numbers
 *   for the 422 message. NO clamping/dropping — the customer is told.
 * - otherwise → { ok: true } with loyaltyDiscount recomputed from points via
 *   pointsToCents (cents-canonical Phase 1 helper), divided to dollars at the
 *   persistence boundary. The client's loyalty_discount is ignored by
 *   construction — that IS the anti-tamper guarantee.
 *
 * Integer-safe: points/balance are truncated defensively (the booking
 * validation schema already coerces loyalty_points_used to a non-negative int,
 * and loyalty_points_balance is an integer column).
 */
export function resolveBookingLoyaltyRedemption(
  requestedPoints: number,
  availableBalance: number
): BookingLoyaltyResolution {
  const points = Number.isFinite(requestedPoints) ? Math.trunc(requestedPoints) : 0;
  if (points <= 0) {
    return { ok: true, loyaltyPoints: 0, loyaltyDiscount: 0 };
  }
  const balance = Number.isFinite(availableBalance) ? Math.trunc(availableBalance) : 0;
  if (points > balance) {
    return { ok: false, requestedPoints: points, availableBalance: balance };
  }
  // For an UNTAMPERED client this equals the client's own points * REDEEM_RATE,
  // so legitimate bookings see no change; a tampered loyalty_discount is
  // overridden because the value is derived here, not read from the request.
  return { ok: true, loyaltyPoints: points, loyaltyDiscount: pointsToCents(points) / 100 };
}

/** 422 body message — names the requested vs available points. */
export function insufficientLoyaltyErrorMessage(
  requestedPoints: number,
  availableBalance: number
): string {
  return `Insufficient loyalty balance — requested ${requestedPoints} points, have ${availableBalance} available`;
}

export interface LoyaltyOverspend {
  requestedPoints: number;
  availableBalance: number;
  overspendDelta: number;
}

/**
 * Detect a close-out over-redemption (requested > live balance) — the Q2
 * double-spend signature. Returns the descriptor for the audit_log details,
 * or null when the redemption is affordable. Pure: the caller still proceeds
 * with the existing clamp (observational, not enforcement).
 */
export function detectLoyaltyOverspend(
  requestedPoints: number,
  availableBalance: number
): LoyaltyOverspend | null {
  const points = Number.isFinite(requestedPoints) ? requestedPoints : 0;
  const balance = Number.isFinite(availableBalance) ? availableBalance : 0;
  if (points > balance) {
    return {
      requestedPoints: points,
      availableBalance: balance,
      overspendDelta: points - balance,
    };
  }
  return null;
}
