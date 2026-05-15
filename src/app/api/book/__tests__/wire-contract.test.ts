import { describe, it, expect } from 'vitest';
import { bookingSubmitSchema } from '@/lib/utils/validation';
import { paymentIntentRequestSchema } from '../payment-intent/schema';

// ---------------------------------------------------------------------------
// Wire-contract regression tests for the booking flow.
//
// Phase Money-Unify-3 Hotfix 2 — added after commit ff2d51a1 renamed
// Family D money fields (price → price_cents) and the booking-wizard
// POST body was silently desynced from bookingSubmitSchema for ~22 hours.
//
// These tests build the EXACT body shape produced by the client today and
// assert that the server schema accepts it. Drift in either direction now
// trips a unit-test failure instead of a silent 400 in production.
// ---------------------------------------------------------------------------

const SERVICE_UUID = '11111111-1111-4111-8111-111111111111';
const ADDON_UUID = '22222222-2222-4222-8222-222222222222';
const ZONE_UUID = '33333333-3333-4333-8333-333333333333';

// Mirrors src/components/booking/booking-wizard.tsx:939-969 post-Hotfix 2.
// Keep these literals as the source of truth for the wire body — when the
// wizard changes, this fixture must change in lockstep.
function buildWizardBody(overrides: Record<string, unknown> = {}) {
  return {
    service_id: SERVICE_UUID,
    tier_name: null,
    price_cents: 7500, // $75 in cents (Family D)
    date: '2026-05-20',
    time: '10:00',
    duration_minutes: 60,
    is_mobile: false,
    mobile_zone_id: null,
    mobile_address: null,
    mobile_surcharge: 0, // dollars (Family C, NUMERIC)
    customer: {
      first_name: 'Test',
      last_name: 'Customer',
      phone: '(310) 555-1234',
      email: 'test@example.com',
      sms_consent: true,
      email_consent: true,
    },
    vehicle: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      specialty_tier: null,
      year: 2020,
      make: 'Toyota',
      model: 'Camry',
      color: 'Blue',
    },
    addons: [],
    channel: 'online',
    ...overrides,
  };
}

describe('bookingSubmitSchema — wire contract', () => {
  it('accepts the wizard body shape (no addons)', () => {
    const result = bookingSubmitSchema.safeParse(buildWizardBody());
    expect(result.success).toBe(true);
  });

  it('accepts the wizard body shape with one addon', () => {
    const body = buildWizardBody({
      addons: [
        {
          service_id: ADDON_UUID,
          name: 'Headlight Restoration',
          price_cents: 2500,
          tier_name: null,
        },
      ],
    });
    const result = bookingSubmitSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('accepts a mobile booking with surcharge in dollars', () => {
    const body = buildWizardBody({
      is_mobile: true,
      mobile_zone_id: ZONE_UUID,
      mobile_address: '123 Main St, Torrance, CA 90505',
      mobile_surcharge: 40, // dollars
    });
    const result = bookingSubmitSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('accepts a deposit booking with all payment/coupon/loyalty fields', () => {
    const body = buildWizardBody({
      payment_intent_id: 'pi_test_123',
      payment_option: 'deposit',
      deposit_amount: 50, // dollars (Family C)
      coupon_code: 'SAVE10',
      coupon_discount: 7.5, // dollars
      loyalty_points_used: 100,
      loyalty_discount: 5, // dollars
    });
    const result = bookingSubmitSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('REGRESSION: rejects the pre-Hotfix-2 body shape using `price` instead of `price_cents`', () => {
    // This is the body shape that shipped in commit ff2d51a1 — silently
    // 400'd every booking attempt. Locking it in prevents reintroduction.
    const oldBody = {
      ...buildWizardBody(),
      price: 7500, // wrong key
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (oldBody as any).price_cents;

    const result = bookingSubmitSchema.safeParse(oldBody);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('price_cents');
    }
  });

  it('REGRESSION: rejects an addon using `price` instead of `price_cents`', () => {
    const body = buildWizardBody({
      addons: [
        {
          service_id: ADDON_UUID,
          name: 'Headlight Restoration',
          price: 2500, // wrong key
          tier_name: null,
        },
      ],
    });
    const result = bookingSubmitSchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('addons.0.price_cents'))).toBe(true);
    }
  });
});

describe('paymentIntentRequestSchema — wire contract', () => {
  it('accepts the step-payment body shape (Pay-in-Full)', () => {
    const result = paymentIntentRequestSchema.safeParse({ amountCents: 7500 });
    expect(result.success).toBe(true);
  });

  it('accepts deposit-flagged body with totalAmountCents metadata', () => {
    const result = paymentIntentRequestSchema.safeParse({
      amountCents: 5000,
      isDeposit: true,
      totalAmountCents: 7500,
      metadata: { source: 'booking' },
    });
    expect(result.success).toBe(true);
  });

  it('REGRESSION: rejects the pre-Hotfix-2 body shape using `amount` instead of `amountCents`', () => {
    // This body shape, combined with the endpoint's old `Math.round(amount * 100)`,
    // would have charged Stripe 100× for Pay-in-Full. The strict() schema
    // refuses to silently accept the wrong key.
    const result = paymentIntentRequestSchema.safeParse({ amount: 7500 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer amountCents (would crash Stripe with InvalidRequestError)', () => {
    const result = paymentIntentRequestSchema.safeParse({ amountCents: 75.5 });
    expect(result.success).toBe(false);
  });

  it('rejects negative amountCents', () => {
    const result = paymentIntentRequestSchema.safeParse({ amountCents: -100 });
    expect(result.success).toBe(false);
  });
});
