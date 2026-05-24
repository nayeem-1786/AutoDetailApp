/**
 * Issue 33 Layer 1 — Twilio inbound auto-quote combo integration coverage.
 *
 * Scope: pin the contract between the legacy auto-quote loop at
 * `src/app/api/webhooks/twilio/inbound/route.ts:791-819` and
 * `applyCombosToQuoteItems`. The full webhook is too deeply integrated to
 * drive end-to-end here (signature validation, START_WORDS gate, AI
 * routing decision, business-hours, rate-limit, AI response containing a
 * [GENERATE_QUOTE] block — see start-words-gate.test.ts and
 * sms-ai-v2-routing.test.ts for the heavy lifters that cover surrounding
 * branches).
 *
 * These tests pin the auto-quote loop's data-shape contract with the
 * combo helper. The send-quote-sms route.test.ts already exercises an
 * identical integration shape at the full integration level — that test
 * file is the load-bearing assertion for the wiring. This file documents
 * the auto-quote loop's expectation.
 */

import { describe, it, expect } from 'vitest';
import {
  applyCombosFromSuggestions,
  type ResolvedQuoteItem,
  type ServiceAddonSuggestion,
} from '@/lib/services/combo-resolver';

describe('twilio inbound auto-quote — combo integration contract', () => {
  it('module exports applyCombosToQuoteItems for auto-quote loop import', async () => {
    const mod = await import('@/lib/services/combo-resolver');
    expect(typeof mod.applyCombosToQuoteItems).toBe('function');
  });

  it('combo HIT on auto-quote items → addon priced at combo_price with audit trail', () => {
    // Matches the auto-quote loop shape at route.ts:791-817: a fresh
    // quoteItems array filled by iterating quoteData.services through
    // resolveServiceByName + resolvePrice, then passed through the
    // combo helper.
    const ANCHOR_ID = 'twilio-anchor';
    const ADDON_ID = 'twilio-addon';

    const items: ResolvedQuoteItem[] = [
      {
        service_id: ANCHOR_ID,
        item_name: 'Express Interior Clean',
        quantity: 1,
        unit_price: 85,
        tier_name: 'sedan',
        standard_price: null,
        pricing_type: 'standard',
      },
      {
        service_id: ADDON_ID,
        item_name: 'Pet Hair & Dander Removal',
        quantity: 1,
        unit_price: 125,
        tier_name: null,
        standard_price: null,
        pricing_type: 'standard',
      },
    ];

    const suggestions: ServiceAddonSuggestion[] = [
      {
        id: 'sug-twilio',
        primary_service_id: ANCHOR_ID,
        addon_service_id: ADDON_ID,
        combo_price: 100,
        auto_suggest: true,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];

    const out = applyCombosFromSuggestions(items, suggestions);
    expect(out[1]).toMatchObject({
      service_id: ADDON_ID,
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
    });
  });

  it('combo MISS (no anchor) leaves auto-quote items unchanged', () => {
    const items: ResolvedQuoteItem[] = [
      {
        service_id: 'twilio-addon-alone',
        item_name: 'Pet Hair & Dander Removal',
        quantity: 1,
        unit_price: 125,
        tier_name: null,
        standard_price: null,
        pricing_type: 'standard',
      },
    ];
    // Suggestion exists but anchor isn't in items.
    const suggestions: ServiceAddonSuggestion[] = [
      {
        id: 'sug-twilio-2',
        primary_service_id: 'twilio-anchor-not-present',
        addon_service_id: 'twilio-addon-alone',
        combo_price: 100,
        auto_suggest: true,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const out = applyCombosFromSuggestions(items, suggestions);
    expect(out).toEqual(items);
  });

  it('mapVehicleSizeClass values flow through combo helper without error', () => {
    // The auto-quote sizeClass is derived from mapVehicleSizeClass at
    // route.ts:732 — values are limited to 'sedan' / 'truck_suv_2row' /
    // 'suv_3row_van'. The combo helper does not inspect sizeClass directly
    // (combos are SET-level, not size-level), so the helper's output is
    // identical regardless of which of the 3 values flows in.
    // This test pins that contract: a basic combo applies the same way
    // regardless of upstream tier choice.
    const ANCHOR_ID = 'twilio-tier-anchor';
    const ADDON_ID = 'twilio-tier-addon';

    function makeItemsWithTier(tier: 'sedan' | 'truck_suv_2row' | 'suv_3row_van'): ResolvedQuoteItem[] {
      return [
        {
          service_id: ANCHOR_ID,
          item_name: 'Anchor',
          quantity: 1,
          unit_price: 85,
          tier_name: tier,
          standard_price: null,
          pricing_type: 'standard',
        },
        {
          service_id: ADDON_ID,
          item_name: 'Addon',
          quantity: 1,
          unit_price: 125,
          tier_name: null,
          standard_price: null,
          pricing_type: 'standard',
        },
      ];
    }

    const suggestion: ServiceAddonSuggestion = {
      id: 'sug-tier',
      primary_service_id: ANCHOR_ID,
      addon_service_id: ADDON_ID,
      combo_price: 100,
      auto_suggest: true,
      is_seasonal: false,
      seasonal_start: null,
      seasonal_end: null,
      display_order: 0,
      created_at: '2026-01-01T00:00:00Z',
    };

    for (const tier of ['sedan', 'truck_suv_2row', 'suv_3row_van'] as const) {
      const out = applyCombosFromSuggestions(makeItemsWithTier(tier), [suggestion]);
      expect(out[1].unit_price).toBe(100);
      expect(out[1].pricing_type).toBe('combo');
    }
  });

  it('sale-priced auto-quote item: combo helper respects "lowest wins"', () => {
    // The auto-quote loop writes pricing_type='sale' + standard_price=full
    // when isOnSale=true (route.ts:812-815). A subsequent combo pass must
    // not raise the price.
    const items: ResolvedQuoteItem[] = [
      {
        service_id: 'twilio-anchor',
        item_name: 'Anchor',
        quantity: 1,
        unit_price: 85,
        tier_name: 'sedan',
        standard_price: null,
        pricing_type: 'standard',
      },
      {
        service_id: 'twilio-addon-on-sale',
        item_name: 'On-sale addon',
        quantity: 1,
        unit_price: 70,
        tier_name: null,
        standard_price: 125,
        pricing_type: 'sale',
      },
    ];
    const suggestions: ServiceAddonSuggestion[] = [
      {
        id: 'sug-sale-vs-combo',
        primary_service_id: 'twilio-anchor',
        addon_service_id: 'twilio-addon-on-sale',
        combo_price: 100,
        auto_suggest: true,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        display_order: 0,
        created_at: '2026-01-01T00:00:00Z',
      },
    ];
    const out = applyCombosFromSuggestions(items, suggestions);
    // Sale price ($70) is lower than combo price ($100). Lowest wins.
    expect(out[1].unit_price).toBe(70);
    expect(out[1].pricing_type).toBe('sale');
  });
});
