/**
 * W3 (Unit B audit, 2026-05-30 — Session U-B.3, 2026-06-01) —
 * server-side staff_assessed check.
 *
 * Locks the operator's Q-B rule: services with `staff_assessed=true`
 * require staff evaluation for pricing — they MUST NOT be bookable as
 * a standalone primary (or as an add-on) on Step 2 of public booking.
 * The client gates this via `selectedService.staff_assessed` in
 * step-service-select.tsx (renders `<RequestQuoteCard>` in place of
 * the configure panel + Continue button); this is the server's check
 * for tampered/replayed requests and the operator-misconfiguration
 * case (staff_assessed toggled on but online_bookable left true).
 *
 * Companion to `mobile-eligibility.test.ts` (W2) and
 * `classification.test.ts` (W1); the three share the same two-layer
 * defense-in-depth pattern (data/client-layer gate + server-validation
 * helper). The helper's `(primary, addons)` shape mirrors W2's because
 * both checks are per-service boolean flags that can attach to either
 * the primary or an add-on — unlike W1 which checks the primary only
 * (classification = 'addon_only' is EXPECTED in the addon slot).
 */

import { describe, it, expect } from 'vitest';
import {
  checkNotStaffAssessed,
  staffAssessedQuoteRequiredErrorMessage,
  type StaffAssessedService,
} from '../_staff-assessed';

function svc(name: string, staff_assessed: boolean): StaffAssessedService {
  return { name, staff_assessed };
}

describe('checkNotStaffAssessed — primary service', () => {
  it('returns { ok: true } when primary is not staff-assessed and no addons', () => {
    const result = checkNotStaffAssessed(svc('Express Wash', false), []);
    expect(result).toEqual({ ok: true });
  });

  it('rejects staff-assessed primary (no addons)', () => {
    const result = checkNotStaffAssessed(svc('Paint Correction', true), []);
    expect(result).toEqual({ ok: false, serviceName: 'Paint Correction' });
  });

  it('rejects primary BEFORE inspecting addons — primary precedence', () => {
    // If both primary and addons are flagged, the primary's name
    // surfaces first so the customer addresses the root problem
    // (the service they picked) before the addon. Mirrors the
    // primary-precedence ordering in `_mobile-eligibility.ts`.
    const result = checkNotStaffAssessed(
      svc('Engine Bay Detail', true),
      [svc('Headlight Restoration', true)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Engine Bay Detail' });
  });
});

describe('checkNotStaffAssessed — addons', () => {
  it('returns { ok: true } when primary + all addons are clean', () => {
    const result = checkNotStaffAssessed(
      svc('Express Wash', false),
      [svc('Tire Shine', false), svc('Interior Vacuum', false)]
    );
    expect(result).toEqual({ ok: true });
  });

  it('rejects the FIRST staff-assessed addon by array order', () => {
    const result = checkNotStaffAssessed(
      svc('Express Wash', false),
      [
        svc('Tire Shine', false),
        svc('Custom Paint Touch-Up', true),
        svc('Ceramic Coating', true),
      ]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Custom Paint Touch-Up' });
  });

  it('handles single staff-assessed addon at start of array', () => {
    const result = checkNotStaffAssessed(
      svc('Express Wash', false),
      [svc('Custom Paint Touch-Up', true)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Custom Paint Touch-Up' });
  });

  it('handles single staff-assessed addon at end of array', () => {
    const result = checkNotStaffAssessed(
      svc('Express Wash', false),
      [svc('Tire Shine', false), svc('Custom Paint Touch-Up', true)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Custom Paint Touch-Up' });
  });

  it('returns { ok: true } when addons array is empty', () => {
    const result = checkNotStaffAssessed(svc('Express Wash', false), []);
    expect(result).toEqual({ ok: true });
  });
});

describe('staffAssessedQuoteRequiredErrorMessage — wording lock', () => {
  it('produces the exact customer-facing message', () => {
    expect(staffAssessedQuoteRequiredErrorMessage('Paint Correction')).toBe(
      'Paint Correction requires a custom quote and cannot be booked directly online. Please request a quote.'
    );
  });

  it('handles service names with punctuation', () => {
    expect(staffAssessedQuoteRequiredErrorMessage('1-Step Paint Correction')).toBe(
      '1-Step Paint Correction requires a custom quote and cannot be booked directly online. Please request a quote.'
    );
  });

  it('handles service names with ampersands', () => {
    expect(staffAssessedQuoteRequiredErrorMessage('Polish & Buff')).toBe(
      'Polish & Buff requires a custom quote and cannot be booked directly online. Please request a quote.'
    );
  });
});
