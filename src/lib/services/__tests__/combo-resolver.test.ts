import { describe, it, expect, vi } from 'vitest';
import {
  applyCombosFromSuggestions,
  applyCombosToQuoteItems,
  isComboInSeason,
  type ResolvedQuoteItem,
  type ServiceAddonSuggestion,
} from '../combo-resolver';

// ───────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────

const ANCHOR_A_ID = 'service-anchor-a';
const ANCHOR_B_ID = 'service-anchor-b';
const ADDON_ID = 'service-addon';
const OTHER_ID = 'service-other';

function makeItem(overrides: Partial<ResolvedQuoteItem> = {}): ResolvedQuoteItem {
  return {
    service_id: 'svc',
    item_name: 'Item',
    quantity: 1,
    unit_price: 100,
    tier_name: null,
    standard_price: null,
    pricing_type: 'standard',
    ...overrides,
  };
}

function makeSuggestion(
  overrides: Partial<ServiceAddonSuggestion> = {},
): ServiceAddonSuggestion {
  return {
    id: 'sug-1',
    primary_service_id: ANCHOR_A_ID,
    addon_service_id: ADDON_ID,
    combo_price: 100,
    auto_suggest: true,
    is_seasonal: false,
    seasonal_start: null,
    seasonal_end: null,
    display_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// Today fixed during tests for reproducibility
const FIXED_TODAY = new Date('2026-05-24T12:00:00Z');

// ───────────────────────────────────────────────────────────────
// isComboInSeason
// ───────────────────────────────────────────────────────────────

describe('isComboInSeason', () => {
  it('returns true when is_seasonal is false (regardless of start/end)', () => {
    const s = makeSuggestion({ is_seasonal: false, seasonal_start: '2030-01-01', seasonal_end: '2031-01-01' });
    expect(isComboInSeason(s, FIXED_TODAY)).toBe(true);
  });

  it('returns true when is_seasonal is true and both dates are null', () => {
    const s = makeSuggestion({ is_seasonal: true, seasonal_start: null, seasonal_end: null });
    expect(isComboInSeason(s, FIXED_TODAY)).toBe(true);
  });

  it('returns true when today is within the seasonal window', () => {
    const s = makeSuggestion({
      is_seasonal: true,
      seasonal_start: '2026-05-01',
      seasonal_end: '2026-06-30',
    });
    expect(isComboInSeason(s, FIXED_TODAY)).toBe(true);
  });

  it('returns false when today is BEFORE seasonal_start', () => {
    const s = makeSuggestion({
      is_seasonal: true,
      seasonal_start: '2026-06-01',
      seasonal_end: null,
    });
    expect(isComboInSeason(s, FIXED_TODAY)).toBe(false);
  });

  it('returns false when today is AFTER seasonal_end', () => {
    const s = makeSuggestion({
      is_seasonal: true,
      seasonal_start: null,
      seasonal_end: '2026-05-01',
    });
    expect(isComboInSeason(s, FIXED_TODAY)).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────
// applyCombosFromSuggestions — pure function
// ───────────────────────────────────────────────────────────────

describe('applyCombosFromSuggestions', () => {
  it('returns input unchanged when items list is empty', () => {
    const out = applyCombosFromSuggestions([], [makeSuggestion()]);
    expect(out).toEqual([]);
  });

  it('returns input unchanged when suggestions list is empty', () => {
    const items = [makeItem({ service_id: ADDON_ID })];
    const out = applyCombosFromSuggestions(items, []);
    expect(out).toEqual(items);
  });

  it('combo HIT — anchor + addon both in quote → addon gets combo_price, standard_price set, pricing_type=combo', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, item_name: 'Anchor A', unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, item_name: 'Addon', unit_price: 125 }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[0]).toEqual(items[0]); // anchor unchanged
    expect(out[1]).toMatchObject({
      service_id: ADDON_ID,
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
    });
  });

  it('combo MISS — anchor missing → addon unchanged', () => {
    const items = [
      makeItem({ service_id: ADDON_ID, item_name: 'Addon', unit_price: 125 }),
      makeItem({ service_id: OTHER_ID, item_name: 'Other', unit_price: 50 }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out).toEqual(items);
  });

  it('combo MISS — addon missing → no change (nothing to discount)', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: OTHER_ID, unit_price: 50 }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out).toEqual(items);
  });

  it('combo MISS — auto_suggest=false → suggestion filtered, no application', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [makeSuggestion({ auto_suggest: false, combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(125);
    expect(out[1].pricing_type).toBe('standard');
  });

  it('combo MISS — seasonal_end in the past → filtered', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [
      makeSuggestion({
        is_seasonal: true,
        seasonal_end: '2026-05-01',
        combo_price: 100,
      }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(125);
    expect(out[1].pricing_type).toBe('standard');
  });

  it('combo MISS — seasonal_start in the future → filtered', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [
      makeSuggestion({
        is_seasonal: true,
        seasonal_start: '2026-06-01',
        combo_price: 100,
      }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(125);
  });

  it('combo HIT — non-seasonal applies regardless of null start/end', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [
      makeSuggestion({ is_seasonal: false, seasonal_start: null, seasonal_end: null, combo_price: 100 }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(100);
    expect(out[1].pricing_type).toBe('combo');
  });

  it('multiple anchors, lowest_price tiebreak (default) → addon gets the lowest combo_price', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ANCHOR_B_ID, unit_price: 90 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [
      makeSuggestion({ id: 's1', primary_service_id: ANCHOR_A_ID, combo_price: 100 }),
      makeSuggestion({ id: 's2', primary_service_id: ANCHOR_B_ID, combo_price: 90 }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[2].unit_price).toBe(90);
    expect(out[2].standard_price).toBe(125);
    expect(out[2].pricing_type).toBe('combo');
  });

  it('multiple anchors, first_match tiebreak → addon gets iteration-order first', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ANCHOR_B_ID, unit_price: 90 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [
      makeSuggestion({ id: 's1', primary_service_id: ANCHOR_A_ID, combo_price: 110 }),
      makeSuggestion({ id: 's2', primary_service_id: ANCHOR_B_ID, combo_price: 90 }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, {
      today: FIXED_TODAY,
      multipleAnchorTiebreak: 'first_match',
    });

    expect(out[2].unit_price).toBe(110);
  });

  it('lowestWins=true BLOCKS combo when combo_price > current unit_price (addon already on sale at $80)', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({
        service_id: ADDON_ID,
        unit_price: 80,
        standard_price: 125,
        pricing_type: 'sale',
      }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(80);
    expect(out[1].pricing_type).toBe('sale');
    expect(out[1].standard_price).toBe(125);
  });

  it('lowestWins=false FORCES combo even when combo_price > current price', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({
        service_id: ADDON_ID,
        unit_price: 80,
        standard_price: 125,
        pricing_type: 'sale',
      }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, {
      today: FIXED_TODAY,
      lowestWins: false,
    });

    expect(out[1].unit_price).toBe(100);
    expect(out[1].pricing_type).toBe('combo');
    expect(out[1].standard_price).toBe(80);
  });

  it('standard_price captures PRIOR unit_price (preserves sale price when sale → combo transition wins)', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({
        service_id: ADDON_ID,
        unit_price: 110,
        standard_price: 125,
        pricing_type: 'sale',
      }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 90 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(90);
    expect(out[1].standard_price).toBe(110);
    expect(out[1].pricing_type).toBe('combo');
  });

  it('pricing_type transitions from sale → combo when both apply and combo wins', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({
        service_id: ADDON_ID,
        unit_price: 110,
        pricing_type: 'sale',
      }),
    ];
    const out = applyCombosFromSuggestions(
      items,
      [makeSuggestion({ combo_price: 90 })],
      { today: FIXED_TODAY },
    );
    expect(out[1].pricing_type).toBe('combo');
  });

  it('does NOT mutate input array', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const itemsSnapshot = items.map((i) => ({ ...i }));
    const suggestions = [makeSuggestion({ combo_price: 100 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(items).toEqual(itemsSnapshot);
    expect(out).not.toBe(items);
  });

  it('multiple addons in quote — each evaluated independently', () => {
    const ADDON_2_ID = 'service-addon-2';
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
      makeItem({ service_id: ADDON_2_ID, unit_price: 175 }),
    ];
    const suggestions = [
      makeSuggestion({ id: 's1', addon_service_id: ADDON_ID, combo_price: 100 }),
      makeSuggestion({ id: 's2', addon_service_id: ADDON_2_ID, combo_price: 150 }),
    ];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1]).toMatchObject({ unit_price: 100, pricing_type: 'combo' });
    expect(out[2]).toMatchObject({ unit_price: 150, pricing_type: 'combo' });
  });

  it('combo_price null is ignored', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [makeSuggestion({ combo_price: null })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(125);
    expect(out[1].pricing_type).toBe('standard');
  });

  it('combo_price <= 0 is ignored (defensive)', () => {
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const suggestions = [makeSuggestion({ combo_price: 0 })];
    const out = applyCombosFromSuggestions(items, suggestions, { today: FIXED_TODAY });

    expect(out[1].unit_price).toBe(125);
  });
});

// ───────────────────────────────────────────────────────────────
// applyCombosToQuoteItems — admin-injected wrapper
// ───────────────────────────────────────────────────────────────

describe('applyCombosToQuoteItems', () => {
  function makeAdminStub(opts: {
    suggestions?: ServiceAddonSuggestion[];
    error?: { message: string } | null;
    queryAssert?: (calls: {
      primary_service_id?: string[];
      addon_service_id?: string[];
      auto_suggest?: boolean;
    }) => void;
  }) {
    const inCalls: { col: string; vals: string[] }[] = [];
    let eqCol: string | undefined;
    let eqVal: unknown;
    const queryBuilder = {
      select(_cols: string) { return this; },
      in(col: string, vals: string[]) {
        inCalls.push({ col, vals });
        return this;
      },
      eq(col: string, val: unknown) { eqCol = col; eqVal = val; return this; },
      then<T>(
        onF?: (v: { data: ServiceAddonSuggestion[] | null; error: { message: string } | null }) => T | PromiseLike<T>,
        onR?: (r: unknown) => T | PromiseLike<T>,
      ) {
        if (opts.queryAssert) {
          opts.queryAssert({
            primary_service_id: inCalls.find((c) => c.col === 'primary_service_id')?.vals,
            addon_service_id: inCalls.find((c) => c.col === 'addon_service_id')?.vals,
            auto_suggest: eqCol === 'auto_suggest' ? (eqVal as boolean) : undefined,
          });
        }
        return Promise.resolve({
          data: opts.suggestions ?? [],
          error: opts.error ?? null,
        }).then(onF, onR);
      },
    };
    return {
      from(_table: string) {
        return queryBuilder;
      },
    } as unknown as Parameters<typeof applyCombosToQuoteItems>[0];
  }

  it('returns empty when items is empty (no DB call)', async () => {
    const fromSpy = vi.fn();
    const admin = { from: fromSpy } as unknown as Parameters<typeof applyCombosToQuoteItems>[0];
    const out = await applyCombosToQuoteItems(admin, []);
    expect(out).toEqual([]);
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it('queries service_addon_suggestions with both primary_service_id IN and addon_service_id IN + auto_suggest=true', async () => {
    let assertedQuery = false;
    const admin = makeAdminStub({
      suggestions: [],
      queryAssert: ({ primary_service_id, addon_service_id, auto_suggest }) => {
        expect(primary_service_id).toEqual(expect.arrayContaining([ANCHOR_A_ID, ADDON_ID]));
        expect(addon_service_id).toEqual(expect.arrayContaining([ANCHOR_A_ID, ADDON_ID]));
        expect(auto_suggest).toBe(true);
        assertedQuery = true;
      },
    });
    await applyCombosToQuoteItems(admin, [
      makeItem({ service_id: ANCHOR_A_ID }),
      makeItem({ service_id: ADDON_ID }),
    ]);
    expect(assertedQuery).toBe(true);
  });

  it('delegates to applyCombosFromSuggestions and returns the combo-applied items', async () => {
    const admin = makeAdminStub({
      suggestions: [
        makeSuggestion({ combo_price: 100 }),
      ],
    });
    const items = [
      makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 }),
      makeItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const out = await applyCombosToQuoteItems(admin, items, { today: FIXED_TODAY });

    expect(out[1]).toMatchObject({
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
    });
  });

  it('throws when the suggestions query errors (caller decides recovery)', async () => {
    const admin = makeAdminStub({
      error: { message: 'connection lost' },
    });
    await expect(
      applyCombosToQuoteItems(admin, [makeItem({ service_id: ANCHOR_A_ID })]),
    ).rejects.toThrow(/connection lost/);
  });

  it('handles null data gracefully (defensive — Postgrest sometimes returns null)', async () => {
    const queryBuilder = {
      select() { return this; },
      in() { return this; },
      eq() { return this; },
      then<T>(
        onF?: (v: { data: ServiceAddonSuggestion[] | null; error: null }) => T | PromiseLike<T>,
      ) {
        return Promise.resolve({ data: null, error: null }).then(onF);
      },
    };
    const admin = { from: () => queryBuilder } as unknown as Parameters<typeof applyCombosToQuoteItems>[0];
    const items = [makeItem({ service_id: ANCHOR_A_ID, unit_price: 85 })];
    const out = await applyCombosToQuoteItems(admin, items);
    expect(out).toEqual(items);
  });
});
