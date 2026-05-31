/**
 * W2 (Unit B audit, 2026-05-30) — server-side mobile-eligibility check.
 *
 * Locks the defense-in-depth rule the route uses to reject mobile
 * bookings that include a non-mobile-eligible primary service or addon.
 * The client gates this via `selectedService.mobile_eligible` at
 * `step-service-select.tsx:475` + `:870`; this is the server's check
 * for tampered/replayed requests.
 */

import { describe, it, expect } from 'vitest';
import {
  checkMobileEligibility,
  mobileIneligibleErrorMessage,
  type MobileEligibleService,
} from '../_mobile-eligibility';

function svc(name: string, mobile_eligible: boolean): MobileEligibleService {
  return { name, mobile_eligible };
}

describe('checkMobileEligibility — primary service', () => {
  it('returns { ok: true } when primary is mobile-eligible and no addons', () => {
    const result = checkMobileEligibility(svc('Express Wash', true), []);
    expect(result).toEqual({ ok: true });
  });

  it('rejects non-mobile-eligible primary (no addons)', () => {
    const result = checkMobileEligibility(svc('Polish & Buff', false), []);
    expect(result).toEqual({ ok: false, serviceName: 'Polish & Buff' });
  });

  it('rejects primary BEFORE inspecting addons — primary precedence', () => {
    // If both primary and addons are ineligible, the primary's name
    // surfaces first so the customer fixes the obvious problem first.
    const result = checkMobileEligibility(
      svc('Engine Bay Detail', false),
      [svc('Headlight Restoration', false)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Engine Bay Detail' });
  });
});

describe('checkMobileEligibility — addons', () => {
  it('returns { ok: true } when primary + all addons are eligible', () => {
    const result = checkMobileEligibility(
      svc('Express Wash', true),
      [svc('Tire Shine', true), svc('Interior Vacuum', true)]
    );
    expect(result).toEqual({ ok: true });
  });

  it('rejects the FIRST ineligible addon by array order', () => {
    const result = checkMobileEligibility(
      svc('Express Wash', true),
      [svc('Tire Shine', true), svc('Headlight Restoration', false), svc('Ceramic Coating', false)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Headlight Restoration' });
  });

  it('handles single ineligible addon at start of array', () => {
    const result = checkMobileEligibility(
      svc('Express Wash', true),
      [svc('Polish & Buff', false)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Polish & Buff' });
  });

  it('handles single ineligible addon at end of array', () => {
    const result = checkMobileEligibility(
      svc('Express Wash', true),
      [svc('Tire Shine', true), svc('Polish & Buff', false)]
    );
    expect(result).toEqual({ ok: false, serviceName: 'Polish & Buff' });
  });
});

describe('mobileIneligibleErrorMessage — wording lock', () => {
  it('produces the exact customer-facing message', () => {
    expect(mobileIneligibleErrorMessage('Engine Bay Detail')).toBe(
      'Engine Bay Detail is not available as a mobile service. Please remove it or choose in-shop booking.'
    );
  });

  it('handles service names with punctuation', () => {
    expect(mobileIneligibleErrorMessage("1-Step Paint Correction")).toBe(
      "1-Step Paint Correction is not available as a mobile service. Please remove it or choose in-shop booking."
    );
  });
});
