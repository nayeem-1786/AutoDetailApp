import { describe, expect, it } from 'vitest';
import {
  computeGrandTotal,
  computeBalanceDue,
  deriveSubtotalFromItems,
  computeDisplayTotals,
} from '../transaction-totals';

// Phase 1 helper tests. Lock the canonical formulas surfaced in the
// JOB_RECEIPT_UNIFICATION_AUDIT_2026-06-20.md Section 0 row 1/2/5 + the
// computeDisplayTotals synthesis shape. Phase 2 consumer migration
// preserves the existing surface-level regression tests
// (transaction-detail-total-with-tip.test.tsx, transactions-list-tip-display.test.ts).

describe('computeGrandTotal — H1', () => {
  it('canonical case: max(appointment_total, total_amount) + tip', () => {
    // Session #155 SD-006297 real fixture: $460 appointment / $230 balance / $92 tip → $552
    expect(
      computeGrandTotal({
        appointment_total: 460,
        total_amount: 230,
        tip_amount: 92,
      })
    ).toBe(552);
  });

  it('close-out shell: total_amount=0, appointment_total carries value', () => {
    // Session #155 case 3 fixture: $0 close-out shell + $460 appt + $92 tip → $552
    expect(
      computeGrandTotal({
        appointment_total: 460,
        total_amount: 0,
        tip_amount: 92,
      })
    ).toBe(552);
  });

  it('walk-in (no appointment): falls back to total_amount', () => {
    expect(
      computeGrandTotal({
        appointment_total: null,
        total_amount: 100,
        tip_amount: 0,
      })
    ).toBe(100);
  });

  it('zero tip: returns subtotal of the two amounts', () => {
    expect(
      computeGrandTotal({
        appointment_total: 100,
        total_amount: 100,
        tip_amount: 0,
      })
    ).toBe(100);
  });

  it('tip absent (undefined): defensive ?? 0 prevents NaN', () => {
    // The Phase 1 audit found Variant A (receipt-template.ts:723, 1482,
    // public receipt:361) does NOT ?? 0 the tip — would throw NaN if
    // upstream data drifts. The helper bakes in the defensive variant.
    expect(
      computeGrandTotal({
        appointment_total: 100,
        total_amount: 100,
      })
    ).toBe(100);
  });

  it('all inputs null/undefined: returns 0', () => {
    expect(computeGrandTotal({})).toBe(0);
  });
});

describe('computeBalanceDue — H2', () => {
  it('pure math, partial paid', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 10000,
      })
    ).toBe(40000);
  });

  it('pure math, exactly paid', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 50000,
      })
    ).toBe(0);
  });

  it('pure math, overpaid clamps to 0', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 60000,
      })
    ).toBe(0);
  });

  it('pure math, unpaid returns full appointment total', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 0,
      })
    ).toBe(50000);
  });

  it('dual-gate: paymentStatus=paid forces 0 even with positive numeric balance', () => {
    // Q1 lock: render/read callers pass paymentStatus to get the
    // authoritative "is this paid?" answer.
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 0,
        paymentStatus: 'paid',
      })
    ).toBe(0);
  });

  it('dual-gate: paymentStatus=partial passes through to math', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 10000,
        paymentStatus: 'partial',
      })
    ).toBe(40000);
  });

  it('webhook caller pattern: omit paymentStatus, get pure math', () => {
    // The Stripe webhook computes balance to DECIDE the new payment_status
    // (see webhooks/stripe/route.ts:153). It must omit paymentStatus or
    // pass null — otherwise the dual-gate would self-reference.
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 30000,
      })
    ).toBe(20000);
  });

  it('paymentStatus=null is treated identically to omitted', () => {
    expect(
      computeBalanceDue({
        appointmentTotalCents: 50000,
        totalPaidCents: 30000,
        paymentStatus: null,
      })
    ).toBe(20000);
  });
});

describe('deriveSubtotalFromItems — H3', () => {
  it('empty items returns 0', () => {
    expect(deriveSubtotalFromItems([])).toBe(0);
  });

  it('single item', () => {
    expect(deriveSubtotalFromItems([{ total_price: 100 }])).toBe(100);
  });

  it('multiple items sum correctly', () => {
    expect(
      deriveSubtotalFromItems([
        { total_price: 100 },
        { total_price: 50 },
        { total_price: 25.75 },
      ])
    ).toBe(175.75);
  });

  it('mobile fee row included naturally (caller passes all items)', () => {
    // Caller passes mobile_fee as a transaction_items row; it's summed
    // alongside service rows. Don't add mobile surcharge separately —
    // that's a bug pattern that would double-count.
    expect(
      deriveSubtotalFromItems([
        { total_price: 200 }, // service
        { total_price: 40 }, // mobile_fee row
      ])
    ).toBe(240);
  });

  it('null/undefined total_price defensively coerces to 0', () => {
    expect(
      deriveSubtotalFromItems([
        { total_price: 100 },
        { total_price: null },
        { total_price: undefined },
      ])
    ).toBe(100);
  });
});

describe('computeDisplayTotals — H5', () => {
  it('basic transaction with no payments: balance_due equals grand_total', () => {
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 100,
        total_amount: 100,
        subtotal: 100,
        tax_amount: 10,
        tip_amount: 15,
        discount_amount: 0,
        loyalty_discount: 0,
      },
    });
    expect(result).toEqual({
      subtotal: 100,
      tax: 10,
      total_discount: 0,
      manual_discount: 0, // Phase 3 placeholder
      coupon_discount: 0, // Phase 3 placeholder
      loyalty_discount: 0,
      tip: 15,
      grand_total: 115, // 100 + 15
      paid_so_far: 0,
      balance_due: 100, // grand_total excludes tip from balance; here matches appointment_total
    });
  });

  it('with partial payment: balance_due = appointment_total - paid_so_far', () => {
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 100,
        total_amount: 100,
        tip_amount: 15,
      },
      paidSoFarDollars: 30,
    });
    expect(result.paid_so_far).toBe(30);
    expect(result.balance_due).toBe(70);
    expect(result.grand_total).toBe(115);
  });

  it('overpaid clamps balance_due to 0', () => {
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 100,
        total_amount: 100,
      },
      paidSoFarDollars: 150,
    });
    expect(result.balance_due).toBe(0);
  });

  it('dual-gate: paymentStatus=paid forces balance_due=0', () => {
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 100,
        total_amount: 100,
      },
      paidSoFarDollars: 0,
      paymentStatus: 'paid',
    });
    expect(result.balance_due).toBe(0);
  });

  it('loyalty discount surfaced; manual/coupon stay Phase 3 placeholders', () => {
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 100,
        total_amount: 100,
        subtotal: 100,
        discount_amount: 75, // combined: coupon + loyalty + manual
        loyalty_discount: 25,
      },
    });
    expect(result.total_discount).toBe(75);
    expect(result.loyalty_discount).toBe(25);
    expect(result.manual_discount).toBe(0); // Phase 3 placeholder
    expect(result.coupon_discount).toBe(0); // Phase 3 placeholder
  });

  it('empty transaction object: all fields zero', () => {
    const result = computeDisplayTotals({ transaction: {} });
    expect(result).toEqual({
      subtotal: 0,
      tax: 0,
      total_discount: 0,
      manual_discount: 0,
      coupon_discount: 0,
      loyalty_discount: 0,
      tip: 0,
      grand_total: 0,
      paid_so_far: 0,
      balance_due: 0,
    });
  });

  it('cents-conversion boundary: $230 paid against $460 appt → $230 balance (no IEEE drift)', () => {
    // Real fixture from Session #155 SD-006297 (close-out shell shape).
    // Validates the internal Math.round(*100) protects against the 0.1+0.2
    // class of float artifact.
    const result = computeDisplayTotals({
      transaction: {
        appointment_total: 460,
        total_amount: 0,
        tip_amount: 92,
      },
      paidSoFarDollars: 230,
    });
    expect(result.grand_total).toBe(552);
    expect(result.balance_due).toBe(230);
  });
});
