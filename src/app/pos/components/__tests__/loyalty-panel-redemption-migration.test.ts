/**
 * Batch M (Option A Phase 2) — loyalty-panel.tsx:70 redemption migration.
 *
 * The handleConfirm dollars→points conversion migrated from the inline pair
 *   pointsToRedeem = Math.ceil(clamped / LOYALTY.REDEEM_RATE)
 *   dispatch.points = Math.min(pointsToRedeem, balance)
 * to the canonical helper composition
 *   pointsToRedeem = centsToPoints(toCents(clamped), balance)
 * which folds the ceil-conversion AND the balance clamp into one call (the
 * Q3-locked actualDiscount UX rounding stays inline at the consumer).
 *
 * This test pins the behavior equivalence across the 5 cases verified in the
 * supplementary audit (§10) so the migration cannot silently drift. The
 * `clamped` input is already maxRedemption-capped upstream, so the balance
 * clamp rarely binds — but when it does (cases 4–5) the new path must produce
 * the same dispatched points as the old `Math.min(_, balance)`.
 */

import { describe, expect, it } from 'vitest';
import { centsToPoints } from '@/lib/loyalty/redemption-math';
import { toCents } from '@/lib/utils/money';
import { LOYALTY } from '@/lib/utils/constants';

// The exact pre-migration expression (ceil-conversion + balance clamp).
function legacyDispatchPoints(clampedDollars: number, balance: number): number {
  const pointsToRedeem = Math.ceil(clampedDollars / LOYALTY.REDEEM_RATE);
  return Math.min(pointsToRedeem, balance);
}

// The post-migration expression.
function migratedDispatchPoints(clampedDollars: number, balance: number): number {
  return centsToPoints(toCents(clampedDollars), balance);
}

describe('loyalty-panel redemption migration — centsToPoints(toCents(clamped), balance) equivalence', () => {
  const cases: Array<{ name: string; clamped: number; balance: number; expected: number }> = [
    { name: 'normal: $5.00 / bal 100', clamped: 5.0, balance: 100, expected: 100 },
    { name: 'ceil boundary: $5.01 / bal 100 → clamp binds at 100', clamped: 5.01, balance: 100, expected: 100 },
    { name: 'minimum: $0.05 / bal 5', clamped: 0.05, balance: 5, expected: 1 },
    { name: 'balance clamp: $5.00 / bal 80', clamped: 5.0, balance: 80, expected: 80 },
    { name: 'max clamp: $10.00 / bal 150', clamped: 10.0, balance: 150, expected: 150 },
  ];

  it.each(cases)('$name → migrated === legacy === expected', ({ clamped, balance, expected }) => {
    const legacy = legacyDispatchPoints(clamped, balance);
    const migrated = migratedDispatchPoints(clamped, balance);
    expect(migrated).toBe(legacy);
    expect(migrated).toBe(expected);
  });
});
