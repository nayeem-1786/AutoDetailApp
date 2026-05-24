/**
 * Issue 33 Layer 1 — booking-form combo coverage (operator-locked Q5).
 *
 * Before Layer 1, the booking form's server endpoint accepted addon
 * prices from the client AS-IS and wrote `pricing_type: 'standard'`,
 * `standard_price: addon.price` for every addon — even when the client
 * UI submitted a combo price. Combo total flowed through to receipts but
 * the audit trail was incoherent.
 *
 * Layer 1 adoption: the addon write path now runs through
 * `applyCombosToQuoteItems`, which detects the (primary, addon) combo
 * pair from `service_addon_suggestions` and rewrites the
 * `transaction_items` row with `pricing_type='combo'` and the resolved
 * `standard_price`.
 *
 * Boundary pin (audit Target 8b): the booking schema restricts
 * `vehicle.size_class` to `CUSTOMER_SELF_SERVICE_SIZE_CLASSES`
 * (sedan / truck_suv_2row / suv_3row_van). Exotic/classic submissions
 * are rejected by Zod at the schema layer BEFORE reaching the combo
 * helper. These tests verify that invariant did not regress.
 */

import { describe, it, expect } from 'vitest';
import { bookingSubmitSchema } from '@/lib/utils/validation';
import {
  applyCombosFromSuggestions,
  type ResolvedQuoteItem,
  type ServiceAddonSuggestion,
} from '@/lib/services/combo-resolver';
import { CUSTOMER_SELF_SERVICE_SIZE_CLASSES } from '@/lib/utils/constants';

// ---------------------------------------------------------------------------
// Boundary pin — exotic/classic rejected by booking schema
// ---------------------------------------------------------------------------

describe('booking schema — vehicle.size_class boundary (customer self-service only)', () => {
  function baseBookingPayload(sizeClass: string) {
    return {
      service_id: '550e8400-e29b-41d4-a716-446655440000',
      tier_name: 'sedan',
      price: 85,
      date: '2026-06-01',
      time: '10:00',
      duration_minutes: 60,
      customer: {
        first_name: 'Test',
        last_name: 'User',
        phone: '(424) 555-1234',
        email: 'test@example.com',
        sms_consent: false,
        email_consent: false,
      },
      vehicle: {
        vehicle_category: 'automobile' as const,
        vehicle_type: 'standard' as const,
        size_class: sizeClass,
        year: 2023,
        make: 'Honda',
        model: 'Accord',
        color: 'Black',
      },
      addons: [],
      channel: 'online' as const,
    };
  }

  it('accepts sedan (customer-facing subset)', () => {
    const result = bookingSubmitSchema.safeParse(baseBookingPayload('sedan'));
    expect(result.success).toBe(true);
  });

  it('accepts truck_suv_2row (customer-facing subset)', () => {
    const result = bookingSubmitSchema.safeParse(baseBookingPayload('truck_suv_2row'));
    expect(result.success).toBe(true);
  });

  it('accepts suv_3row_van (customer-facing subset)', () => {
    const result = bookingSubmitSchema.safeParse(baseBookingPayload('suv_3row_van'));
    expect(result.success).toBe(true);
  });

  it('REJECTS exotic at the schema layer (no exotic via booking form)', () => {
    const result = bookingSubmitSchema.safeParse(baseBookingPayload('exotic'));
    expect(result.success).toBe(false);
  });

  it('REJECTS classic at the schema layer (no classic via booking form)', () => {
    const result = bookingSubmitSchema.safeParse(baseBookingPayload('classic'));
    expect(result.success).toBe(false);
  });

  it('exposed subset constant matches what schema accepts', () => {
    expect([...CUSTOMER_SELF_SERVICE_SIZE_CLASSES].sort()).toEqual(
      ['sedan', 'suv_3row_van', 'truck_suv_2row'],
    );
  });
});

// ---------------------------------------------------------------------------
// Combo-resolver behavior on booking-shaped items
//
// The booking form invokes `applyCombosToQuoteItems(supabase, comboInputItems)`
// inside the deposit-transaction branch. The input array is [primary, ...addons].
// These tests pin the pure function's behavior on that exact shape so any
// future change to the booking flow's item construction is caught.
// ---------------------------------------------------------------------------

const PRIMARY_ID = 'service-express-interior-id';
const ADDON_ID = 'service-pet-hair-id';

function bookingShapedItem(overrides: Partial<ResolvedQuoteItem> = {}): ResolvedQuoteItem {
  return {
    service_id: 'svc',
    item_name: 'Service',
    quantity: 1,
    unit_price: 100,
    tier_name: null,
    standard_price: null,
    pricing_type: 'standard',
    ...overrides,
  };
}

function suggestion(overrides: Partial<ServiceAddonSuggestion> = {}): ServiceAddonSuggestion {
  return {
    id: 'sug-booking',
    primary_service_id: PRIMARY_ID,
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

describe('booking-flow combo application (booking-shaped items)', () => {
  it('combo HIT — Express Interior + Pet Hair → addon row gets pricing_type=combo, standard_price=125', () => {
    // Mirrors how the booking route builds comboInputItems for the
    // transaction_items insert: primary first, addons after.
    const items: ResolvedQuoteItem[] = [
      bookingShapedItem({
        service_id: PRIMARY_ID,
        item_name: 'Express Interior Clean',
        unit_price: 85,
        tier_name: 'sedan',
      }),
      bookingShapedItem({
        service_id: ADDON_ID,
        item_name: 'Pet Hair & Dander Removal',
        unit_price: 125,
      }),
    ];

    const out = applyCombosFromSuggestions(items, [suggestion()]);

    expect(out[0]).toEqual(items[0]); // primary unchanged
    expect(out[1]).toMatchObject({
      service_id: ADDON_ID,
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
    });
  });

  it('combo HIT — when client already submitted combo_price as addon.price, helper does NOT apply twice (lowest wins)', () => {
    // Today the booking client UI shows "Add for $100" and submits
    // addon.price = 100 directly. The combo helper should detect the
    // combo and rewrite pricing_type → 'combo', but with combo_price ===
    // current unit_price the value doesn't change — only the audit trail
    // (standard_price) does. This is the data-coherence fix the
    // diagnostic flagged at lines 470-484.
    const items: ResolvedQuoteItem[] = [
      bookingShapedItem({
        service_id: PRIMARY_ID,
        item_name: 'Express Interior Clean',
        unit_price: 85,
      }),
      bookingShapedItem({
        service_id: ADDON_ID,
        item_name: 'Pet Hair & Dander Removal',
        unit_price: 100, // client already submitted combo price
      }),
    ];

    const out = applyCombosFromSuggestions(items, [suggestion({ combo_price: 100 })]);
    expect(out[1].unit_price).toBe(100);
    expect(out[1].standard_price).toBe(100); // captures prior unit_price
    expect(out[1].pricing_type).toBe('combo');
  });

  it('combo MISS — only primary service, no addons → no rewrites', () => {
    const items: ResolvedQuoteItem[] = [
      bookingShapedItem({ service_id: PRIMARY_ID, unit_price: 85 }),
    ];
    const out = applyCombosFromSuggestions(items, [suggestion()]);
    expect(out).toEqual(items);
  });

  it('addon-only booking (primary missing from suggestions) → addon row keeps pricing_type=standard', () => {
    // The booking flow always includes a primary service; this is a
    // sanity check that an unrelated addon does NOT get a combo applied.
    const items: ResolvedQuoteItem[] = [
      bookingShapedItem({ service_id: 'service-some-other-primary', unit_price: 50 }),
      bookingShapedItem({ service_id: ADDON_ID, unit_price: 125 }),
    ];
    const out = applyCombosFromSuggestions(items, [suggestion()]);
    expect(out[1].unit_price).toBe(125);
    expect(out[1].pricing_type).toBe('standard');
  });

  it('lowestWins prevents combo from raising the addon price', () => {
    // Edge case: combo_price is HIGHER than the client-submitted price.
    // The helper's lowestWins default protects the customer.
    const items: ResolvedQuoteItem[] = [
      bookingShapedItem({ service_id: PRIMARY_ID, unit_price: 85 }),
      bookingShapedItem({ service_id: ADDON_ID, unit_price: 90 }),
    ];
    const out = applyCombosFromSuggestions(items, [suggestion({ combo_price: 100 })]);
    expect(out[1].unit_price).toBe(90);
    expect(out[1].pricing_type).toBe('standard');
  });
});
