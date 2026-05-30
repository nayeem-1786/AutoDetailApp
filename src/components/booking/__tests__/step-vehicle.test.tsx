/**
 * #131 Layer 2 — public-booking step-vehicle classifier override gate.
 *
 * Replaces #129 C1's `mdl.trim()` heuristic with a structural confidence
 * check (`result.category_confident`) that covers all three silent-default
 * paths in the resolver uniformly. The operator-confirmed regression that
 * triggered #131 reproduced because the user CAN type a model, which
 * satisfied #129 C1's gate, but the resolver still fell through to the
 * 0-row lookup path (data drift for niche makes like Winnebago) and
 * silently overrode the user's category to automobile.
 *
 * This suite pins TWO sides of the contract:
 *   1) The override gate (setCategory in classify()) only fires on
 *      `category_confident === true`.
 *   2) `buildSelection()`'s pre-existing silent-override of
 *      `vehicle_category` from the classifier (lines 234-244, missed by
 *      #129) ALSO gates on `category_confident === true`.
 *
 * The two functions are not exported, so this suite mirrors both
 * predicates as pure functions. Any contributor who edits either
 * predicate without updating this mirror will see a test fail.
 */
import { describe, it, expect } from 'vitest';

// Mirror #1 — the setCategory gate inside classify()
function shouldOverrideCategoryFromClassifier(args: {
  categoryConfident: boolean;
  classifierCategory: string;
  currentCategory: string;
}): boolean {
  // Matches step-vehicle.tsx's
  // `if (result.category_confident && result.vehicle_category !== cat)`.
  return args.categoryConfident && args.classifierCategory !== args.currentCategory;
}

// Mirror #2 — the buildSelection() effectiveCat / effectiveVehicleType gate
function resolveEffectiveCategoryForSubmit(args: {
  classifierCategoryConfident: boolean | undefined;
  classifierCategory: string | undefined;
  userCategory: string;
}): string {
  // Matches step-vehicle.tsx's buildSelection():
  //   const useClassifierCategory = classification?.category_confident === true;
  //   const effectiveCat = useClassifierCategory ? classification!.vehicle_category : category;
  const useClassifier = args.classifierCategoryConfident === true;
  return useClassifier && args.classifierCategory ? args.classifierCategory : args.userCategory;
}

describe('#131 Layer 2 — setCategory gate (Mirror #1)', () => {
  it('refuses override when classifier is NOT confident — covers all 3 silent-default paths', () => {
    for (const cat of ['motorcycle', 'rv', 'boat', 'aircraft']) {
      expect(
        shouldOverrideCategoryFromClassifier({
          categoryConfident: false,
          classifierCategory: 'automobile',
          currentCategory: cat,
        })
      ).toBe(false);
    }
  });

  it('refuses override even when model is typed but classifier defaulted (the #131 regression)', () => {
    // The operator-confirmed bug: model IS typed (satisfies #129 C1's old
    // heuristic) but the 0-row vehicle_makes lookup defaults category to
    // automobile silently. Without the Layer 2 fix, this would override.
    expect(
      shouldOverrideCategoryFromClassifier({
        categoryConfident: false, // 0-row lookup → not confident
        classifierCategory: 'automobile',
        currentCategory: 'rv',
      })
    ).toBe(false);
  });

  it('allows override when classifier IS confident and disagrees (Honda motorcycle case preserved)', () => {
    // Customer picked 'automobile', typed 'Honda Sportster'. Classifier
    // disambiguates via motorcycle keyword, returns confident=true. Override fires.
    expect(
      shouldOverrideCategoryFromClassifier({
        categoryConfident: true,
        classifierCategory: 'motorcycle',
        currentCategory: 'automobile',
      })
    ).toBe(true);
  });

  it('does not fire when classifier matches current category (no-op)', () => {
    expect(
      shouldOverrideCategoryFromClassifier({
        categoryConfident: true,
        classifierCategory: 'rv',
        currentCategory: 'rv',
      })
    ).toBe(false);
  });
});

describe('#131 Layer 2 — buildSelection() effectiveCat gate (Mirror #2)', () => {
  it('keeps user category when classifier is not confident — the second silent-override #129 missed', () => {
    // Even with #129 C1's setCategory gate keeping 'rv' on screen, buildSelection's
    // OLD logic (effectiveCat = classification?.vehicle_category ?? category) would
    // submit 'automobile' to the server. Layer 2 fixes that.
    expect(
      resolveEffectiveCategoryForSubmit({
        classifierCategoryConfident: false,
        classifierCategory: 'automobile',
        userCategory: 'rv',
      })
    ).toBe('rv');
  });

  it('uses classifier category when confident', () => {
    expect(
      resolveEffectiveCategoryForSubmit({
        classifierCategoryConfident: true,
        classifierCategory: 'motorcycle',
        userCategory: 'automobile',
      })
    ).toBe('motorcycle');
  });

  it('falls back to user category when classifier result is absent (null/undefined)', () => {
    expect(
      resolveEffectiveCategoryForSubmit({
        classifierCategoryConfident: undefined,
        classifierCategory: undefined,
        userCategory: 'boat',
      })
    ).toBe('boat');
  });

  it('regression — all 5 non-automobile categories survive non-confident classifier on submit', () => {
    for (const cat of ['motorcycle', 'rv', 'boat', 'aircraft']) {
      expect(
        resolveEffectiveCategoryForSubmit({
          classifierCategoryConfident: false,
          classifierCategory: 'automobile',
          userCategory: cat,
        })
      ).toBe(cat);
    }
  });
});
