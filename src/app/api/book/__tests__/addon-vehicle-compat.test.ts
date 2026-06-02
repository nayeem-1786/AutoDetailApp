/**
 * W7 (Unit B audit, 2026-05-30 — Session U-B.5 / Path B Session 1, 2026-06-02) —
 * server-side addon-vehicle-compatibility check.
 *
 * Locks the audit's W7 rule: addon services carry their own
 * `vehicle_compatibility` JSONB (same shape as primary services) and
 * must be honored. The client filter at Step 2 hides incompatible
 * addons from the picker; the server's `checkAddonsVehicleCompatible`
 * rejects tampered/replayed requests + the case where the customer
 * selected addons for one vehicle then swapped categories mid-flow.
 *
 * Companion to:
 *   - `classification.test.ts` (W1 — primary classification rule)
 *   - `mobile-eligibility.test.ts` (W2 — mobile flag, per-service)
 *   - `staff-assessed.test.ts` (W3 — staff_assessed flag, per-service)
 *   - `prereq-enforcement.test.ts` (W5 — primary prereq compat)
 *
 * Empty/null `vehicle_compatibility` on an addon = compatible with
 * all (implicit default — matches `route.ts:343` interpretation for
 * the primary).
 */

import { describe, it, expect } from 'vitest';
import {
  checkAddonsVehicleCompatible,
  addonVehicleIncompatibleErrorMessage,
  type CompatAddon,
} from '../_addon-vehicle-compat';

function addon(name: string, vehicle_compatibility: string[] | null): CompatAddon {
  return { name, vehicle_compatibility };
}

describe('checkAddonsVehicleCompatible — pass-through cases', () => {
  it('returns { ok: true } when addons array is empty', () => {
    const result = checkAddonsVehicleCompatible([], 'automobile');
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when vehicleCategory is null (no axis to evaluate)', () => {
    // Symmetric with `assertPrereqsCompatible`'s null-category guard —
    // the route's main vehicle-compat check at `:343` is authoritative
    // when there IS a vehicle.
    const result = checkAddonsVehicleCompatible(
      [addon('Tire Shine', ['standard'])],
      null
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when all addons have empty compat (implicit all)', () => {
    const result = checkAddonsVehicleCompatible(
      [addon('Tire Shine', []), addon('Vacuum', [])],
      'rv'
    );
    expect(result).toEqual({ ok: true });
  });

  it('returns { ok: true } when all addons have null compat (implicit all)', () => {
    const result = checkAddonsVehicleCompatible(
      [addon('Tire Shine', null), addon('Vacuum', null)],
      'boat'
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('checkAddonsVehicleCompatible — compatibility match', () => {
  it('passes when addon compat includes the vehicle category compat key (automobile → standard)', () => {
    const result = checkAddonsVehicleCompatible(
      [addon('Tire Shine', ['standard'])],
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });

  it('passes when addon compat lists multiple categories and one matches', () => {
    const result = checkAddonsVehicleCompatible(
      [addon('Polish', ['standard', 'motorcycle'])],
      'motorcycle'
    );
    expect(result).toEqual({ ok: true });
  });

  it('passes when mix of restricted + unrestricted addons are all compatible', () => {
    const result = checkAddonsVehicleCompatible(
      [
        addon('Tire Shine', ['standard']),
        addon('Wax', []),
        addon('Vacuum', null),
      ],
      'automobile'
    );
    expect(result).toEqual({ ok: true });
  });
});

describe('checkAddonsVehicleCompatible — incompatibility rejection', () => {
  it('rejects the FIRST incompatible addon by array order', () => {
    // Mirrors `_mobile-eligibility.ts`'s first-fail behavior — the
    // customer sees one addon at a time so the message is actionable.
    const result = checkAddonsVehicleCompatible(
      [
        addon('Tire Shine', []), // ok
        addon('Paint Sealant', ['standard']), // not ok for RV
        addon('Engine Polish', ['standard']), // also not ok, but second
      ],
      'rv'
    );
    expect(result).toEqual({ ok: false, serviceName: 'Paint Sealant' });
  });

  it('rejects a single incompatible addon', () => {
    const result = checkAddonsVehicleCompatible(
      [addon('Paint Sealant', ['standard'])],
      'boat'
    );
    expect(result).toEqual({ ok: false, serviceName: 'Paint Sealant' });
  });

  it('rejects across all 4 non-automobile categories when addon is automobile-only', () => {
    // Anti-regression for the standard ↔ automobile mapping.
    for (const cat of ['motorcycle', 'rv', 'boat', 'aircraft'] as const) {
      const result = checkAddonsVehicleCompatible(
        [addon('Paint Sealant', ['standard'])],
        cat
      );
      expect(result).toEqual({ ok: false, serviceName: 'Paint Sealant' });
    }
  });
});

describe('addonVehicleIncompatibleErrorMessage — wording lock', () => {
  it('produces the exact customer-facing message', () => {
    expect(addonVehicleIncompatibleErrorMessage('Paint Sealant')).toBe(
      'Paint Sealant is not available for your vehicle. Please remove it and try again.'
    );
  });

  it('handles addon names with punctuation', () => {
    expect(addonVehicleIncompatibleErrorMessage('Premium Wax & Polish')).toBe(
      'Premium Wax & Polish is not available for your vehicle. Please remove it and try again.'
    );
  });

  it('closes with the actionable "Please remove it" imperative (not "request a quote")', () => {
    // Wording-lock guard: addons are optional — the customer can resolve
    // the block by unchecking the addon. The W3/W5 "Please request a
    // quote." closer would be wrong here (no staff escalation needed).
    const msg = addonVehicleIncompatibleErrorMessage('Paint Sealant');
    expect(msg).toMatch(/Please remove it and try again\.$/);
    expect(msg).not.toMatch(/request a quote/);
  });
});
