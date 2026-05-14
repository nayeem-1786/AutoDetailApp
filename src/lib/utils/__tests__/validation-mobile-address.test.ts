// Phase Mobile-1.1: server-side validation refinement on bookingSubmitSchema.
// Mandatory mobile_address when is_mobile=true. 200-char cap.

import { describe, it, expect } from 'vitest';
import { bookingSubmitSchema } from '@/lib/utils/validation';

// Minimal-but-valid booking submission body. Only mobile-related fields are
// exercised across the cases below; everything else is held constant.
// Phase Money-Unify-3: bookingSubmitSchema now expects price_cents (integer cents).
const baseValid = {
  service_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  price_cents: 10000,
  date: '2026-06-01',
  time: '10:00',
  duration_minutes: 60,
  customer: {
    first_name: 'A',
    last_name: 'B',
    phone: '(424) 401-0094',
    email: 'a@b.com',
    sms_consent: false,
    email_consent: false,
  },
  vehicle: {
    vehicle_category: 'automobile',
    vehicle_type: 'standard',
    year: 2020,
    make: 'Toyota',
    model: 'Camry',
    color: 'red',
    size_class: 'sedan',
  },
  addons: [],
  mobile_surcharge: 0,
} as Record<string, unknown>;

describe('bookingSubmitSchema mobile_address refinement', () => {
  it('accepts is_mobile=false with no mobile_address', () => {
    const r = bookingSubmitSchema.safeParse({ ...baseValid, is_mobile: false });
    expect(r.success).toBe(true);
  });

  it('rejects is_mobile=true with empty mobile_address', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issues = r.error.issues;
      expect(issues.some((i) => i.path.join('.') === 'mobile_address')).toBe(true);
    }
  });

  // Phase Mobile-1.2: confirm the refinement message is human-friendly —
  // no "is_mobile=true" technical jargon leak.
  it('produces a user-friendly error message (no field-name leak)', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: '',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const addressIssue = r.error.issues.find(
        (i) => i.path.join('.') === 'mobile_address'
      );
      expect(addressIssue?.message).toBe('Address is required for mobile service');
      expect(addressIssue?.message).not.toMatch(/is_mobile/i);
      expect(addressIssue?.message).not.toMatch(/=true/);
    }
  });

  it('rejects is_mobile=true with whitespace-only mobile_address', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: '   ',
    });
    expect(r.success).toBe(false);
  });

  it('rejects is_mobile=true with omitted mobile_address', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
    });
    expect(r.success).toBe(false);
  });

  it('accepts is_mobile=true with non-empty mobile_address', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: '123 Main St, Torrance, CA 90501',
      mobile_surcharge: 40,
    });
    expect(r.success).toBe(true);
  });

  it('rejects mobile_address longer than 200 chars', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: 'A'.repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it('accepts mobile_address exactly 200 chars', () => {
    const r = bookingSubmitSchema.safeParse({
      ...baseValid,
      is_mobile: true,
      mobile_address: 'A'.repeat(200),
    });
    expect(r.success).toBe(true);
  });
});
