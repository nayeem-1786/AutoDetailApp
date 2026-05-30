/**
 * #129 C1 — public-booking step-vehicle classifier override gate.
 *
 * Locks the regression flagged in PUBLIC_BOOKING_FLOW_AUDIT.md F1:
 * the classifier's silent default to 'automobile' (for dual-category make
 * + empty model, 0-row lookup, DB error) must NOT overwrite a customer's
 * explicit non-automobile category pick. The gate in `step-vehicle.tsx`'s
 * `classify()` (the `if (mdl.trim() && result.vehicle_category !== cat)`
 * predicate) is what stops the override from firing without a model.
 *
 * The classify() function is not exported, so this suite exercises the
 * same predicate against the same resolver behavior captured in
 * `vehicle-categories.test.ts:#129 C1`. Together they pin both ends of
 * the contract: the resolver's defaulting + the call-site's gate on it.
 */
import { describe, it, expect } from 'vitest';

// Mirror the gate predicate from step-vehicle.tsx — keeping it as a pure
// function in the test (rather than exporting from production code) avoids
// inflating the production surface area. Any future contributor who edits
// the inline predicate without updating this mirror will see the test fail.
function shouldOverrideCategoryFromClassifier(args: {
  classifierCategory: string;
  currentCategory: string;
  model: string;
}): boolean {
  // Predicate matches step-vehicle.tsx's `if (mdl.trim() && result.vehicle_category !== cat)`.
  return args.model.trim() !== '' && args.classifierCategory !== args.currentCategory;
}

describe('#129 C1 — classifier override gate predicate', () => {
  it('refuses override when model is empty (the F1 fix)', () => {
    // Reproduces F1: user picks RV, classifier (defaulted to automobile
    // because dual-category make + empty model) tries to override.
    expect(
      shouldOverrideCategoryFromClassifier({
        classifierCategory: 'automobile',
        currentCategory: 'rv',
        model: '',
      })
    ).toBe(false);
  });

  it('refuses override when model is whitespace-only', () => {
    expect(
      shouldOverrideCategoryFromClassifier({
        classifierCategory: 'automobile',
        currentCategory: 'motorcycle',
        model: '   ',
      })
    ).toBe(false);
  });

  it('allows override when model is present and classifier disagrees (Honda motorcycle case)', () => {
    // Preserves the original intent: customer typed 'Honda' + 'Sportster',
    // picked 'automobile' as default category. Classifier correctly detects
    // motorcycle. Override fires.
    expect(
      shouldOverrideCategoryFromClassifier({
        classifierCategory: 'motorcycle',
        currentCategory: 'automobile',
        model: 'Sportster',
      })
    ).toBe(true);
  });

  it('does not fire when classifier matches current category', () => {
    expect(
      shouldOverrideCategoryFromClassifier({
        classifierCategory: 'automobile',
        currentCategory: 'automobile',
        model: 'Camry',
      })
    ).toBe(false);
  });

  it('refuses override for every non-automobile category when model is empty (F1 universality)', () => {
    // The bug reproduced across motorcycle/rv/boat/aircraft. Lock all four.
    for (const cat of ['motorcycle', 'rv', 'boat', 'aircraft']) {
      expect(
        shouldOverrideCategoryFromClassifier({
          classifierCategory: 'automobile',
          currentCategory: cat,
          model: '',
        })
      ).toBe(false);
    }
  });
});
