import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { renderTierToken } from '@/lib/quotes/tier-display';

describe('renderTierToken — D45 (Issue 41 audit Option U) low-level tier rendering', () => {
  // ---------------------------------------------------------------------
  // Operator-locked qty=1 path: tier_label preferred, snake_case→Title
  // Case fallback when tier_label is missing.
  // ---------------------------------------------------------------------

  it('qty=1 with tier_label returns the tier_label verbatim', () => {
    expect(
      renderTierToken({
        tier_name: 'per_row',
        tier_label: 'Per Seat Row',
        quantity: 1,
      }),
    ).toBe('Per Seat Row');
  });

  it('qty=1 with null tier_label falls back to titleCase(tier_name)', () => {
    expect(
      renderTierToken({
        tier_name: 'floor_mats',
        tier_label: null,
        quantity: 1,
      }),
    ).toBe('Floor Mats');
  });

  it('qty=1 with empty-string tier_label falls back to titleCase(tier_name)', () => {
    expect(
      renderTierToken({
        tier_name: 'touring_bagger',
        tier_label: '',
        quantity: 1,
      }),
    ).toBe('Touring Bagger');
  });

  it('qty=1 with tier_name="default" returns null (synthesized non-tier sentinel)', () => {
    expect(
      renderTierToken({
        tier_name: 'default',
        tier_label: 'Default',
        quantity: 1,
      }),
    ).toBeNull();
  });

  it('qty=1 with tier_name=null returns null (no tier configured)', () => {
    expect(
      renderTierToken({
        tier_name: null,
        tier_label: 'Some Label',
        quantity: 1,
      }),
    ).toBeNull();
  });

  it('quantity defaults to 1 when omitted', () => {
    expect(
      renderTierToken({
        tier_name: 'carpet_mats',
        tier_label: 'Carpet & Mats',
      }),
    ).toBe('Carpet & Mats');
  });

  // ---------------------------------------------------------------------
  // Operator-locked qty>1 path: "${qty} ${pluralize(qty_label)}" with
  // first-letter capitalization (everything else preserved). qty_label
  // is the unit noun (row, patch, dish, etc.).
  // ---------------------------------------------------------------------

  it('qty=2 with qty_label="row" returns "2 Rows" (operator empirical case)', () => {
    expect(
      renderTierToken({
        tier_name: 'per_row',
        tier_label: 'Per Seat Row',
        qty_label: 'row',
        quantity: 2,
      }),
    ).toBe('2 Rows');
  });

  it('qty=3 with qty_label="row" returns "3 Rows"', () => {
    expect(
      renderTierToken({
        tier_name: 'per_row',
        tier_label: 'Per Seat Row',
        qty_label: 'row',
        quantity: 3,
      }),
    ).toBe('3 Rows');
  });

  it('qty=2 with qty_label="patch" returns "2 Patches" (+es for ch-ending)', () => {
    expect(
      renderTierToken({
        tier_name: 'per_patch',
        tier_label: 'Per Patch',
        qty_label: 'patch',
        quantity: 2,
      }),
    ).toBe('2 Patches');
  });

  it('qty=2 with qty_label="bus" returns "2 Buses" (+es for s-ending)', () => {
    expect(
      renderTierToken({
        tier_name: 'per_bus',
        tier_label: 'Per Bus',
        qty_label: 'bus',
        quantity: 2,
      }),
    ).toBe('2 Buses');
  });

  it('qty=2 with qty_label="dish" returns "2 Dishes" (+es for sh-ending)', () => {
    expect(
      renderTierToken({
        tier_name: 'per_dish',
        tier_label: 'Per Dish',
        qty_label: 'dish',
        quantity: 2,
      }),
    ).toBe('2 Dishes');
  });

  it('qty=2 with qty_label="box" returns "2 Boxes" (+es for x-ending)', () => {
    expect(
      renderTierToken({
        tier_name: 'per_box',
        tier_label: 'Per Box',
        qty_label: 'box',
        quantity: 2,
      }),
    ).toBe('2 Boxes');
  });

  // ---------------------------------------------------------------------
  // Defensive: qty > 1 with qty_label=NULL. Unreachable in production
  // today (D43 max_qty validation gates this) but the helper still
  // produces a sensible fallback + warning so future admin-UI
  // misconfiguration surfaces in logs.
  // ---------------------------------------------------------------------

  it('qty>1 without qty_label emits console.warn and returns "${qty} × ${tier_label}" fallback', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = renderTierToken({
        tier_name: 'misconfigured_tier',
        tier_label: 'Misconfigured Tier',
        qty_label: null,
        quantity: 2,
      });
      expect(out).toBe('2 × Misconfigured Tier');
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0][0]).toMatch(/qty>1.*qty_label is null/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('qty>1 without qty_label OR tier_label uses titleCase(tier_name) fallback', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const out = renderTierToken({
        tier_name: 'floor_mats',
        tier_label: null,
        qty_label: null,
        quantity: 3,
      });
      expect(out).toBe('3 × Floor Mats');
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------
  // titleCase fallback covers snake_case slugs the way customers expect.
  // Pinned via the qty=1 fallback path so internal helper coverage stays
  // public-API only.
  // ---------------------------------------------------------------------

  it('titleCase fallback converts snake_case slugs correctly across multiple shapes', () => {
    expect(
      renderTierToken({ tier_name: 'floor_mats', tier_label: null, quantity: 1 }),
    ).toBe('Floor Mats');
    expect(
      renderTierToken({ tier_name: 'per_row', tier_label: null, quantity: 1 }),
    ).toBe('Per Row');
    expect(
      renderTierToken({
        tier_name: 'standard_cruiser',
        tier_label: null,
        quantity: 1,
      }),
    ).toBe('Standard Cruiser');
    expect(
      renderTierToken({ tier_name: 'truck_suv_2row', tier_label: null, quantity: 1 }),
    ).toBe('Truck Suv 2row');
  });
});

// Restore console state between describe blocks just in case a spy
// leaked from a prior failing case.
beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());
