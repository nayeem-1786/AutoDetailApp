import { describe, expect, it } from 'vitest';
import {
  computePerUnitRefundableCents,
  computeRefundLineAmountCents,
  computeTotalRefundCents,
  distributeResidualCents,
  fromCents,
  toCents,
} from '../refund-math';

// Integration tests for the refund route's server-side cap check belong in
// a route-level test (mocks Supabase) — deferred to a later session.
// This file covers the pure math helpers only.

describe('toCents / fromCents', () => {
  it('handles the IEEE 754 artifact case', () => {
    // 17.64 * 100 === 1763.9999999999998 in JS; Math.round saves us.
    expect(toCents(17.64)).toBe(1764);
    expect(fromCents(1764)).toBe(17.64);
  });

  it('round-trips boundary values', () => {
    for (const dollars of [0, 0.01, 0.05, 0.99, 1.0, 71.43, 999.99]) {
      const cents = toCents(dollars);
      expect(fromCents(cents)).toBeCloseTo(dollars, 2);
    }
  });

  it('toCents is stable across known artifacts', () => {
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30
    expect(toCents(71.43)).toBe(7143);
    expect(toCents(22.92)).toBe(2292);
    expect(toCents(30.87)).toBe(3087);
  });
});

describe('computePerUnitRefundableCents', () => {
  it('Paper Mats: unit 0.40, qty 40, tax 1.64, no discount → 44.1 fractional', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 0.4,
      quantity: 40,
      tax_amount: 1.64,
      tx_subtotal: 64.79,
      tx_discount_amount: 0,
    });
    expect(perUnit).toBeCloseTo(44.1, 10);
  });

  it('single-unit Teflon: unit 20.79, qty 1, tax 2.13 → 2292', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 20.79,
      quantity: 1,
      tax_amount: 2.13,
      tx_subtotal: 64.79,
      tx_discount_amount: 0,
    });
    expect(perUnit).toBe(2292);
  });

  it('non-taxable no-discount: unit 10, qty 2, tax 0 → 1000', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 10,
      quantity: 2,
      tax_amount: 0,
      tx_subtotal: 20,
      tx_discount_amount: 0,
    });
    expect(perUnit).toBe(1000);
  });

  it('discounted: unit 10, qty 2, tax 2.05, tx_sub 100, tx_disc 10 → 1002.5', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 10,
      quantity: 2,
      tax_amount: 2.05,
      tx_subtotal: 100,
      tx_discount_amount: 10,
    });
    expect(perUnit).toBeCloseTo(1002.5, 10);
  });

  it('zero-subtotal guard: tx_sub 0 → no negative share', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 10,
      quantity: 2,
      tax_amount: 0,
      tx_subtotal: 0,
      tx_discount_amount: 10,
    });
    expect(perUnit).toBe(1000); // no discount share applied
  });

  it('zero-qty guard: qty 0 → 0', () => {
    const perUnit = computePerUnitRefundableCents({
      unit_price: 10,
      quantity: 0,
      tax_amount: 0,
      tx_subtotal: 100,
      tx_discount_amount: 0,
    });
    expect(perUnit).toBe(0);
  });
});

describe('computeRefundLineAmountCents (regression-proof)', () => {
  const paperMats = {
    unit_price: 0.4,
    quantity: 40,
    tax_amount: 1.64,
    tx_subtotal: 64.79,
    tx_discount_amount: 0,
  };

  it('Paper Mats full: 1764 cents ($17.64) — the bug that shipped was $17.60', () => {
    expect(
      computeRefundLineAmountCents({ ...paperMats, refund_quantity: 40 })
    ).toBe(1764);
  });

  it('Paper Mats partial qty 20: 882 cents', () => {
    expect(
      computeRefundLineAmountCents({ ...paperMats, refund_quantity: 20 })
    ).toBe(882);
  });

  it('Paper Mats partial qty 5: 221 cents (Math.round(44.1 * 5) = 221)', () => {
    expect(
      computeRefundLineAmountCents({ ...paperMats, refund_quantity: 5 })
    ).toBe(221);
  });

  it('sibling +$0.02 case: unit 0.17 qty 3 tax 0.05 → 56 cents (was 57, hit cap)', () => {
    expect(
      computeRefundLineAmountCents({
        unit_price: 0.17,
        quantity: 3,
        tax_amount: 0.05,
        tx_subtotal: 0.51,
        tx_discount_amount: 0,
        refund_quantity: 3,
      })
    ).toBe(56);
  });

  it('Teflon Sealer: unit 20.79 qty 1 tax 2.13 → 2292', () => {
    expect(
      computeRefundLineAmountCents({
        unit_price: 20.79,
        quantity: 1,
        tax_amount: 2.13,
        tx_subtotal: 64.79,
        tx_discount_amount: 0,
        refund_quantity: 1,
      })
    ).toBe(2292);
  });

  it('Wheel Acid: unit 28.00 qty 1 tax 2.87 → 3087', () => {
    expect(
      computeRefundLineAmountCents({
        unit_price: 28,
        quantity: 1,
        tax_amount: 2.87,
        tx_subtotal: 64.79,
        tx_discount_amount: 0,
        refund_quantity: 1,
      })
    ).toBe(3087);
  });
});

describe('computeTotalRefundCents', () => {
  it('Paper Mats + Teflon + Wheel Acid full refund: exactly 7143 cents — previously shipped at 7139', () => {
    const result = computeTotalRefundCents({
      transaction: { subtotal: 64.79, discount_amount: 0, tip_amount: 0 },
      items: [
        { unit_price: 20.79, quantity: 1, tax_amount: 2.13, refund_quantity: 1 },
        { unit_price: 28, quantity: 1, tax_amount: 2.87, refund_quantity: 1 },
        { unit_price: 0.4, quantity: 40, tax_amount: 1.64, refund_quantity: 40 },
      ],
      tip_refund: 0,
    });
    expect(result.lineAmountsCents).toEqual([2292, 3087, 1764]);
    expect(result.totalCents).toBe(7143);
  });

  it('with tip: bug transaction + $5 tip → 7643 cents', () => {
    const result = computeTotalRefundCents({
      transaction: { subtotal: 64.79, discount_amount: 0, tip_amount: 5 },
      items: [
        { unit_price: 20.79, quantity: 1, tax_amount: 2.13, refund_quantity: 1 },
        { unit_price: 28, quantity: 1, tax_amount: 2.87, refund_quantity: 1 },
        { unit_price: 0.4, quantity: 40, tax_amount: 1.64, refund_quantity: 40 },
      ],
      tip_refund: 5,
    });
    expect(result.totalCents).toBe(7643);
  });

  it('three identical discounted lines → residual redistributed; sum equals computed total exactly', () => {
    // 3 lines at $3.33 each (non-taxable), subtotal $9.99, discount $1.00.
    // Each line's discount share = 333/999 * 100 = 33.333... cents (fractional).
    // Each refundable = 333 - 33.333... = 299.666... per-unit, per-line.
    // Individually rounded: 300 each → sum 900.
    // Target total: round(299.666... * 3) = 899.
    // Residual: -1. Distribution must drop one line to 299.
    const result = computeTotalRefundCents({
      transaction: { subtotal: 9.99, discount_amount: 1.0, tip_amount: 0 },
      items: [
        { unit_price: 3.33, quantity: 1, tax_amount: 0, refund_quantity: 1 },
        { unit_price: 3.33, quantity: 1, tax_amount: 0, refund_quantity: 1 },
        { unit_price: 3.33, quantity: 1, tax_amount: 0, refund_quantity: 1 },
      ],
      tip_refund: 0,
    });
    // Invariant: sum of line amounts MUST equal totalCents (tip is 0).
    const sum = result.lineAmountsCents.reduce((s, n) => s + n, 0);
    expect(sum).toBe(result.totalCents);
    expect(result.totalCents).toBe(899);
    // Two lines keep 300, one drops to 299 (first-largest-abs wins tie).
    expect(result.lineAmountsCents.filter((n) => n === 300)).toHaveLength(2);
    expect(result.lineAmountsCents.filter((n) => n === 299)).toHaveLength(1);
  });

  it('empty items: totalCents includes tip only', () => {
    const result = computeTotalRefundCents({
      transaction: { subtotal: 100, discount_amount: 0, tip_amount: 10 },
      items: [],
      tip_refund: 10,
    });
    expect(result.lineAmountsCents).toEqual([]);
    expect(result.totalCents).toBe(1000);
  });
});

describe('distributeResidualCents', () => {
  it('([889, 1, 1], 1) → [890, 1, 1]', () => {
    expect(distributeResidualCents([889, 1, 1], 1)).toEqual([890, 1, 1]);
  });

  it('([890, 890, 890], -1) → [889, 890, 890]', () => {
    expect(distributeResidualCents([890, 890, 890], -1)).toEqual([
      889, 890, 890,
    ]);
  });

  it('([100, 200, 300], 0) → identity, not mutated', () => {
    const input = [100, 200, 300];
    const result = distributeResidualCents(input, 0);
    expect(result).toEqual([100, 200, 300]);
    expect(result).not.toBe(input); // new array
  });

  it('([500], 3) → [503] (residual exceeds line count, full sweeps apply)', () => {
    expect(distributeResidualCents([500], 3)).toEqual([503]);
  });

  it('([100, 100, 100], 2) → two largest-abs get +1 each (index-order tiebreak)', () => {
    expect(distributeResidualCents([100, 100, 100], 2)).toEqual([101, 101, 100]);
  });

  it('empty array stays empty', () => {
    expect(distributeResidualCents([], 5)).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [100, 200, 300];
    distributeResidualCents(input, 1);
    expect(input).toEqual([100, 200, 300]);
  });
});
