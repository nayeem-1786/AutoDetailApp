import { describe, it, expect } from 'vitest';
import { canSendPaymentLink } from '../can-send-payment-link';

// ── Q5-locked helper contract ───────────────────────────────────────────────
// Three surfaces consume this predicate (JobDetail, AppointmentDetailDialog,
// UnstartedAppointmentCard). The tests below pin the legal-truth case AND each
// individual disqualifier, so a regression in any of the consumed surfaces
// shows up here as a unit-level failure first rather than as a button missing
// from a screen at runtime.

const ALL_GREEN = {
  appointmentId: 'apt_abc',
  paymentStatus: 'unpaid',
  appointmentStatus: 'confirmed',
  customerEmail: 'customer@example.com',
  customerPhone: '+13105551212',
};

describe('canSendPaymentLink', () => {
  it('returns true when every condition is met', () => {
    expect(canSendPaymentLink(ALL_GREEN)).toBe(true);
  });

  it('returns true with only email (no phone)', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, customerPhone: null })
    ).toBe(true);
  });

  it('returns true with only phone (no email)', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, customerEmail: null })
    ).toBe(true);
  });

  it('returns true regardless of paymentStatus when not "paid"', () => {
    // Unpaid, partial, NULL — all eligible. Only the exact string "paid"
    // short-circuits. Server-side helper carries the load-bearing
    // remaining-balance check for partial-pay cases.
    expect(canSendPaymentLink({ ...ALL_GREEN, paymentStatus: null })).toBe(true);
    expect(canSendPaymentLink({ ...ALL_GREEN, paymentStatus: 'partial' })).toBe(true);
    expect(canSendPaymentLink({ ...ALL_GREEN, paymentStatus: undefined })).toBe(true);
  });

  it('returns false when appointmentId is null (never-materialized synthetic state)', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, appointmentId: null })
    ).toBe(false);
  });

  it('returns false when payment is already paid', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, paymentStatus: 'paid' })
    ).toBe(false);
  });

  it('returns false when appointment is cancelled', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, appointmentStatus: 'cancelled' })
    ).toBe(false);
  });

  it('returns false when appointment is no_show', () => {
    expect(
      canSendPaymentLink({ ...ALL_GREEN, appointmentStatus: 'no_show' })
    ).toBe(false);
  });

  it('returns false when neither email nor phone is present', () => {
    expect(
      canSendPaymentLink({
        ...ALL_GREEN,
        customerEmail: null,
        customerPhone: null,
      })
    ).toBe(false);
  });

  it('handles empty-string contact channels as absent (defensive)', () => {
    // Server-side helper validates address shape; an empty string is not a
    // dispatchable address. The truthy-check on the OR collapses this case
    // to false even though the field is technically non-null.
    expect(
      canSendPaymentLink({
        ...ALL_GREEN,
        customerEmail: '',
        customerPhone: '',
      })
    ).toBe(false);
  });
});
