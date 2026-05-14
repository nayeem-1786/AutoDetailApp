import { describe, it, expect } from 'vitest';
import {
  STRIPE_MIN_AMOUNT_CENTS,
  STRIPE_MIN_DOLLARS,
  toCents,
  fromCents,
} from '@/lib/utils/money';
import { LOYALTY } from '@/lib/utils/constants';

describe('Money constants (Phase Money-Unify-1)', () => {
  describe('Stripe minimum', () => {
    it('STRIPE_MIN_AMOUNT_CENTS is exactly 50', () => {
      expect(STRIPE_MIN_AMOUNT_CENTS).toBe(50);
    });

    it('STRIPE_MIN_DOLLARS is exactly 0.50', () => {
      expect(STRIPE_MIN_DOLLARS).toBe(0.5);
    });

    it('STRIPE_MIN_DOLLARS is derived from STRIPE_MIN_AMOUNT_CENTS', () => {
      expect(STRIPE_MIN_DOLLARS).toBe(STRIPE_MIN_AMOUNT_CENTS / 100);
    });

    it('toCents(STRIPE_MIN_DOLLARS) === STRIPE_MIN_AMOUNT_CENTS', () => {
      expect(toCents(STRIPE_MIN_DOLLARS)).toBe(STRIPE_MIN_AMOUNT_CENTS);
    });

    it('fromCents(STRIPE_MIN_AMOUNT_CENTS) === STRIPE_MIN_DOLLARS', () => {
      expect(fromCents(STRIPE_MIN_AMOUNT_CENTS)).toBe(STRIPE_MIN_DOLLARS);
    });
  });

  describe('Loyalty redeem rate', () => {
    it('LOYALTY.REDEEM_RATE is 0.05 (dollars per point, legacy float)', () => {
      expect(LOYALTY.REDEEM_RATE).toBe(0.05);
    });

    it('LOYALTY.REDEEM_RATE_CENTS is 5 (cents per point, integer)', () => {
      expect(LOYALTY.REDEEM_RATE_CENTS).toBe(5);
    });

    it('REDEEM_RATE_CENTS / 100 === REDEEM_RATE (consistency)', () => {
      expect(LOYALTY.REDEEM_RATE_CENTS / 100).toBe(LOYALTY.REDEEM_RATE);
    });

    it('100 points × REDEEM_RATE_CENTS === 500 cents = $5 (minimum redemption)', () => {
      // REDEEM_MINIMUM is 100 points → $5.00 redemption value.
      expect(LOYALTY.REDEEM_MINIMUM * LOYALTY.REDEEM_RATE_CENTS).toBe(500);
    });
  });

  describe('refund-math.ts re-export shim', () => {
    it('importing toCents from refund-math still works (deprecated path)', async () => {
      const mod = await import('@/lib/utils/refund-math');
      expect(mod.toCents(17.64)).toBe(1764);
    });

    it('importing STRIPE_MIN_AMOUNT_CENTS from refund-math returns 50', async () => {
      const mod = await import('@/lib/utils/refund-math');
      expect(mod.STRIPE_MIN_AMOUNT_CENTS).toBe(50);
    });
  });
});
