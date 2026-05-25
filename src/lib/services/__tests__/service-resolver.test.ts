import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePrice, resolveServiceByName, type ResolvedService } from '../service-resolver';
import type { ServicePricing } from '@/lib/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Item 15f Layer 3d — service-resolver tests.
 *
 * Pin the four pre-Layer-3d bugs as red-line cases, then assert the
 * canonical-engine-wrapped behavior. The bugs were:
 *
 *  1. Missing exotic + classic size_class cases — both fell through to sedan
 *     column, silently mis-pricing exotic / classic vehicles.
 *  2. per_unit returned $0 (no service_pricing rows, fell through to flat_price
 *     which is null for per_unit services).
 *  3. specialty returned `tiers[0]` regardless of the vehicle's specialty_tier
 *     value.
 *  4. custom returned $0 (same `pricing.length === 0` fallthrough as per_unit).
 *
 * `resolveServiceByName` is NOT covered here — it's a thin Supabase wrapper
 * and is exercised by integration tests / real-world callers.
 */

function mockTier(overrides: Partial<ServicePricing> = {}): ServicePricing {
  return {
    id: 'p1',
    service_id: 's1',
    tier_name: 'sedan',
    tier_label: 'Sedan',
    price: 100,
    sale_price: null,
    display_order: 0,
    is_vehicle_size_aware: false,
    vehicle_size_sedan_price: null,
    vehicle_size_truck_suv_price: null,
    vehicle_size_suv_van_price: null,
    vehicle_size_exotic_price: null,
    vehicle_size_classic_price: null,
    max_qty: null,
    qty_label: null,
    created_at: '',
    ...overrides,
  };
}

function mockService(overrides: Partial<ResolvedService> = {}): ResolvedService {
  return {
    id: 'svc-1',
    name: 'Test Service',
    pricing_model: 'flat',
    flat_price: null,
    per_unit_price: null,
    custom_starting_price: null,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [],
    ...overrides,
  };
}

// ───────────────────────────────────────────────────────────────
// flat
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — flat pricing_model', () => {
  it('returns service.flat_price ignoring size class', () => {
    const svc = mockService({ pricing_model: 'flat', flat_price: 199 });
    expect(resolvePrice(svc, 'sedan').price).toBe(199);
    expect(resolvePrice(svc, 'exotic').price).toBe(199);
    expect(resolvePrice(svc, 'classic').price).toBe(199);
  });

  it('applies service-level sale when active and discounted', () => {
    const svc = mockService({
      pricing_model: 'flat',
      flat_price: 199,
      sale_price: 149,
      sale_starts_at: new Date(Date.now() - 60_000).toISOString(),
      sale_ends_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const r = resolvePrice(svc, 'sedan');
    expect(r.price).toBe(199);
    expect(r.salePrice).toBe(149);
    expect(r.isOnSale).toBe(true);
    expect(r.tierName).toBeNull();
  });

  it('returns flat_price of 0 when flat_price is null (no crash)', () => {
    const svc = mockService({ pricing_model: 'flat', flat_price: null });
    expect(resolvePrice(svc, 'sedan').price).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────
// vehicle_size / scope — Bug 1 (exotic + classic)
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — vehicle_size pricing_model (Bug 1: exotic + classic)', () => {
  // Canonical fixture: 1-Year Ceramic Shield — size-aware single tier with
  // distinct per-size columns. Pre-Layer-3d, exotic + classic silently
  // returned the sedan column ($425).
  const ceramicShield = (): ResolvedService =>
    mockService({
      id: 'ceramic',
      name: '1-Year Ceramic Shield',
      pricing_model: 'vehicle_size',
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'standard',
          price: 425,
          vehicle_size_sedan_price: 425,
          vehicle_size_truck_suv_price: 525,
          vehicle_size_suv_van_price: 625,
          vehicle_size_exotic_price: 725,
          vehicle_size_classic_price: 625,
        }),
      ],
    });

  it('Ferrari (exotic) returns $725 — not the sedan column ($425)', () => {
    const r = resolvePrice(ceramicShield(), 'exotic');
    expect(r.price).toBe(725);
  });

  it('Model A (classic) returns $625 — not the sedan column ($425)', () => {
    const r = resolvePrice(ceramicShield(), 'classic');
    expect(r.price).toBe(625);
  });

  it('still returns correct per-size pricing for sedan / truck / van', () => {
    const svc = ceramicShield();
    expect(resolvePrice(svc, 'sedan').price).toBe(425);
    expect(resolvePrice(svc, 'truck_suv_2row').price).toBe(525);
    expect(resolvePrice(svc, 'suv_3row_van').price).toBe(625);
  });

  it('falls back to pricing.price when a per-size column is null', () => {
    const svc = mockService({
      pricing_model: 'vehicle_size',
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'standard',
          price: 425,
          vehicle_size_sedan_price: 425,
          // exotic/classic columns intentionally null
        }),
      ],
    });
    expect(resolvePrice(svc, 'exotic').price).toBe(425);
    expect(resolvePrice(svc, 'classic').price).toBe(425);
  });

  it('row-pattern (tier_name = size_class) resolves exotic/classic correctly', () => {
    // Pattern B: one ServicePricing row per size_class
    const svc = mockService({
      pricing_model: 'vehicle_size',
      service_pricing: [
        mockTier({ tier_name: 'sedan', price: 100 }),
        mockTier({ tier_name: 'truck_suv_2row', price: 150 }),
        mockTier({ tier_name: 'suv_3row_van', price: 200 }),
        mockTier({ tier_name: 'exotic', price: 350 }),
        mockTier({ tier_name: 'classic', price: 280 }),
      ],
    });
    expect(resolvePrice(svc, 'exotic').price).toBe(350);
    expect(resolvePrice(svc, 'classic').price).toBe(280);
  });

  it('tier-level sale applies when active and discounted', () => {
    const svc = mockService({
      pricing_model: 'vehicle_size',
      sale_starts_at: new Date(Date.now() - 60_000).toISOString(),
      sale_ends_at: new Date(Date.now() + 60_000).toISOString(),
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'standard',
          price: 425,
          sale_price: 350,
          vehicle_size_sedan_price: 425,
          vehicle_size_exotic_price: 725,
        }),
      ],
    });
    const r = resolvePrice(svc, 'exotic');
    expect(r.price).toBe(725);
    expect(r.salePrice).toBe(350);
    expect(r.isOnSale).toBe(true);
  });

  it('"scope" pricing_model uses the same dispatch as "vehicle_size"', () => {
    const svc = mockService({
      pricing_model: 'scope',
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'complete-interior',
          price: 100,
          vehicle_size_exotic_price: 250,
        }),
      ],
    });
    expect(resolvePrice(svc, 'exotic').price).toBe(250);
  });

  it('falls through to flat_price when service_pricing is misconfigured (empty)', () => {
    const svc = mockService({
      pricing_model: 'vehicle_size',
      flat_price: 99,
      service_pricing: [],
    });
    expect(resolvePrice(svc, 'sedan').price).toBe(99);
  });
});

// ───────────────────────────────────────────────────────────────
// per_unit — Bug 2 ($0 instead of per_unit_price)
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — per_unit pricing_model (Bug 2: returned $0)', () => {
  it('returns service.per_unit_price (not $0)', () => {
    // Canonical fixture: Scratch Repair — pricing_model 'per_unit',
    // per_unit_price 150, no service_pricing rows. Pre-Layer-3d returned $0.
    const svc = mockService({
      name: 'Scratch Repair',
      pricing_model: 'per_unit',
      per_unit_price: 150,
      flat_price: null,
      service_pricing: [],
    });
    const r = resolvePrice(svc, 'sedan');
    expect(r.price).toBe(150);
    expect(r.tierName).toBeNull();
    expect(r.isOnSale).toBe(false);
  });

  it('returns 0 when per_unit_price is null (no crash)', () => {
    const svc = mockService({
      pricing_model: 'per_unit',
      per_unit_price: null,
      service_pricing: [],
    });
    expect(resolvePrice(svc, 'sedan').price).toBe(0);
  });

  it('does not silently apply size class to per-unit price', () => {
    const svc = mockService({
      pricing_model: 'per_unit',
      per_unit_price: 150,
      service_pricing: [],
    });
    expect(resolvePrice(svc, 'exotic').price).toBe(150);
    expect(resolvePrice(svc, 'classic').price).toBe(150);
  });
});

// ───────────────────────────────────────────────────────────────
// specialty — Bug 3 (always returned tiers[0])
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — specialty pricing_model (Bug 3: ignored specialty_tier)', () => {
  // Canonical fixture: aircraft hangar wash — multiple tiers, one per
  // specialty class. Pre-Layer-3d always returned tiers[0].
  const aircraftService = (): ResolvedService =>
    mockService({
      pricing_model: 'specialty',
      service_pricing: [
        mockTier({ tier_name: 'aircraft_single_engine', price: 400, display_order: 0 }),
        mockTier({ tier_name: 'aircraft_twin', price: 600, display_order: 1 }),
        mockTier({ tier_name: 'aircraft_jet', price: 1200, display_order: 2 }),
      ],
    });

  it('resolves vehicle.specialty_tier — single_engine returns $400', () => {
    const r = resolvePrice(aircraftService(), null, { specialtyTier: 'aircraft_single_engine' });
    expect(r.price).toBe(400);
    expect(r.tierName).toBe('aircraft_single_engine');
  });

  it('resolves twin engine correctly — returns $600, not first tier', () => {
    const r = resolvePrice(aircraftService(), null, { specialtyTier: 'aircraft_twin' });
    expect(r.price).toBe(600);
    expect(r.tierName).toBe('aircraft_twin');
  });

  it('resolves jet correctly — returns $1200, not first tier', () => {
    const r = resolvePrice(aircraftService(), null, { specialtyTier: 'aircraft_jet' });
    expect(r.price).toBe(1200);
    expect(r.tierName).toBe('aircraft_jet');
  });

  it('falls back to first tier when specialtyTier is not provided', () => {
    const r = resolvePrice(aircraftService(), null);
    expect(r.price).toBe(400);
    expect(r.tierName).toBe('aircraft_single_engine');
  });

  it('falls back to first tier when specialtyTier does not match any row', () => {
    const r = resolvePrice(aircraftService(), null, { specialtyTier: 'aircraft_helicopter' });
    expect(r.price).toBe(400);
  });

  it('size class is irrelevant for specialty pricing', () => {
    const r1 = resolvePrice(aircraftService(), 'sedan', { specialtyTier: 'aircraft_twin' });
    const r2 = resolvePrice(aircraftService(), 'exotic', { specialtyTier: 'aircraft_twin' });
    expect(r1.price).toBe(600);
    expect(r2.price).toBe(600);
  });

  it('applies tier-level sale price when active', () => {
    const svc = mockService({
      pricing_model: 'specialty',
      sale_starts_at: new Date(Date.now() - 60_000).toISOString(),
      sale_ends_at: new Date(Date.now() + 60_000).toISOString(),
      service_pricing: [
        mockTier({ tier_name: 'rv_class_a', price: 500, sale_price: 425 }),
        mockTier({ tier_name: 'rv_class_b', price: 350 }),
      ],
    });
    const r = resolvePrice(svc, null, { specialtyTier: 'rv_class_a' });
    expect(r.price).toBe(500);
    expect(r.salePrice).toBe(425);
    expect(r.isOnSale).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────
// custom — Bug 4 (returned $0)
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — custom pricing_model (Bug 4: returned $0)', () => {
  it('returns service.custom_starting_price (not $0)', () => {
    // Canonical fixture: Flood Damage / Mold Extraction — custom_starting_price 475.
    const svc = mockService({
      name: 'Flood Damage / Mold Extraction',
      pricing_model: 'custom',
      custom_starting_price: 475,
      flat_price: null,
      service_pricing: [],
    });
    const r = resolvePrice(svc, 'sedan');
    expect(r.price).toBe(475);
    expect(r.tierName).toBeNull();
    expect(r.isOnSale).toBe(false);
  });

  it('returns 0 when custom_starting_price is null (no crash)', () => {
    const svc = mockService({
      pricing_model: 'custom',
      custom_starting_price: null,
      service_pricing: [],
    });
    expect(resolvePrice(svc, 'sedan').price).toBe(0);
  });

  it('does not apply sale logic to custom services', () => {
    // Custom services are operator-assessed at quote time; sale pricing is
    // not meaningful. This is a deliberate design choice — operator can
    // discount manually on the quote.
    const svc = mockService({
      pricing_model: 'custom',
      custom_starting_price: 475,
      sale_price: 350,
      sale_starts_at: new Date(Date.now() - 60_000).toISOString(),
      sale_ends_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const r = resolvePrice(svc, 'sedan');
    expect(r.price).toBe(475);
    expect(r.salePrice).toBeNull();
    expect(r.isOnSale).toBe(false);
  });

  it('does not silently apply size class to custom pricing', () => {
    const svc = mockService({
      pricing_model: 'custom',
      custom_starting_price: 475,
    });
    expect(resolvePrice(svc, 'exotic').price).toBe(475);
    expect(resolvePrice(svc, 'classic').price).toBe(475);
  });
});

// ───────────────────────────────────────────────────────────────
// Size-class coercion — null / unknown / undefined
// ───────────────────────────────────────────────────────────────

describe('resolvePrice — size class edge cases', () => {
  it('null sizeClass treated as no-vehicle for vehicle_size services', () => {
    const svc = mockService({
      pricing_model: 'vehicle_size',
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'standard',
          price: 425,
          vehicle_size_sedan_price: 425,
          vehicle_size_exotic_price: 725,
        }),
      ],
    });
    // Canonical engine returns pricing.price when sized is null.
    expect(resolvePrice(svc, null).price).toBe(425);
  });

  it('unknown sizeClass string falls back to pricing.price', () => {
    const svc = mockService({
      pricing_model: 'vehicle_size',
      service_pricing: [
        mockTier({
          is_vehicle_size_aware: true,
          tier_name: 'standard',
          price: 425,
          vehicle_size_sedan_price: 425,
          vehicle_size_exotic_price: 725,
        }),
      ],
    });
    expect(resolvePrice(svc, 'spaceship').price).toBe(425);
  });
});

// ───────────────────────────────────────────────────────────────
// D42 (2026-05-24) — Issue 37: prefix-match fallback. The voice
// agent verbalizes "Hot Shampoo Extraction Complete" to the customer
// (service name + tier label) and then passes the same string to
// send_quote_sms. Pre-D42 the resolver used .ilike() (case-insensitive
// exact match), so the call missed and the quote-send flow degraded
// to notify_staff. D42 adds two fallback tiers after the exact-match
// path; Tier 1 behavior is unchanged.
// ───────────────────────────────────────────────────────────────

interface MockServiceRow {
  id: string;
  name: string;
  pricing_model: string;
  flat_price: number | null;
  per_unit_price: number | null;
  custom_starting_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  service_pricing: ServicePricing[];
}

function makeRow(name: string, id = `svc-${name.toLowerCase().replace(/\s+/g, '-')}`): MockServiceRow {
  return {
    id,
    name,
    pricing_model: 'flat',
    flat_price: 100,
    per_unit_price: null,
    custom_starting_price: null,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [],
  };
}

/**
 * Build a minimal Supabase-shaped mock that records the query chain
 * and dispatches to in-memory state. The resolver issues two distinct
 * shapes:
 *   - Tier 1: .from('services').select(...).ilike('name', q).eq('is_active', true).limit(1).maybeSingle()
 *   - Tier 2/3 fallback: .from('services').select(...).eq('is_active', true) (no ilike, no limit)
 *
 * The mock decides based on whether `.ilike()` was called: with → run
 * the case-insensitive exact match against `services`; without → return
 * all `services` as the fallback fetch.
 */
function makeAdminMock(services: MockServiceRow[]): SupabaseClient {
  const factory = (state: { ilikeName: string | null }) => {
    const builder = {
      _table: 'services',
      select() { return builder; },
      ilike(col: string, value: string) {
        if (col === 'name') state.ilikeName = value;
        return builder;
      },
      eq() { return builder; },
      in() { return builder; },
      limit() { return builder; },
      maybeSingle: async () => {
        if (state.ilikeName == null) return { data: null, error: null };
        const q = state.ilikeName.toLowerCase();
        const hit = services.find((s) => s.name.toLowerCase() === q);
        return { data: hit ?? null, error: hit ? null : { message: 'no rows' } };
      },
      // Tier 2/3 fallback path resolves the promise without .maybeSingle().
      // The resolver awaits the builder directly after `.eq('is_active', true)`.
      then(resolve: (v: { data: MockServiceRow[]; error: null }) => void) {
        resolve({ data: state.ilikeName == null ? services : [], error: null });
      },
    };
    return builder;
  };

  return {
    from(_table: string) {
      const state = { ilikeName: null as string | null };
      return factory(state);
    },
  } as unknown as SupabaseClient;
}

describe('resolveServiceByName — D42 prefix-match fallback (Issue 37)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('Tier 1 — exact case-sensitive match', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'Hot Shampoo Extraction');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 1 — case-insensitive exact match', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'hot shampoo extraction');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 1 — trims surrounding whitespace before match', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, '  Hot Shampoo Extraction  ');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 2 — tier-suffixed agent verbalization (the Issue 37 case)', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'Hot Shampoo Extraction Complete');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 2 — case-insensitive tier suffix', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'hot shampoo extraction complete');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 2 — multi-word tier suffix ("Complete Interior")', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'Hot Shampoo Extraction Complete Interior');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 2 — longest catalog match wins among prefix candidates', async () => {
    const admin = makeAdminMock([
      makeRow('Express Wash'),
      makeRow('Express Wash Premium'),
    ]);
    const out = await resolveServiceByName(admin, 'Express Wash Premium Complete');
    expect(out?.name).toBe('Express Wash Premium');
  });

  it('Tier 2 — separator requirement blocks substring false positive ("Express" does not match "Express Wash")', async () => {
    const admin = makeAdminMock([makeRow('Express Wash')]);
    // "Express" alone has no separator after it in the query, so it
    // must NOT match "Express Wash" via Tier 2. Tier 3 (reverse-prefix)
    // catches it instead since "Express Wash" starts with "Express " — but only
    // if Tier 3 is unique. In this fixture, the single match resolves successfully.
    const out = await resolveServiceByName(admin, 'Express');
    expect(out?.name).toBe('Express Wash');
  });

  it('Tier 2 — separator types: comma + hyphen', async () => {
    const admin = makeAdminMock([makeRow('Engine Bay Detail')]);
    const commaOut = await resolveServiceByName(admin, 'Engine Bay Detail,Standard');
    expect(commaOut?.name).toBe('Engine Bay Detail');
    const hyphenOut = await resolveServiceByName(admin, 'Engine Bay Detail-Premium');
    expect(hyphenOut?.name).toBe('Engine Bay Detail');
  });

  it('Tier 3 — partial query matches unique catalog name', async () => {
    const admin = makeAdminMock([
      makeRow('Hot Shampoo Extraction'),
      makeRow('Engine Bay Detail'),
    ]);
    const out = await resolveServiceByName(admin, 'Hot Shampoo');
    expect(out?.name).toBe('Hot Shampoo Extraction');
  });

  it('Tier 3 — ambiguous match returns null + warns (does not guess)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const admin = makeAdminMock([
      makeRow('Hot Shampoo Extraction'),
      makeRow('Hot Shampoo Spot Treatment'),
    ]);
    const out = await resolveServiceByName(admin, 'Hot Shampoo');
    expect(out).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg = warnSpy.mock.calls[0][0] as string;
    expect(msg).toContain('Ambiguous reverse-prefix match');
    expect(msg).toContain('Hot Shampoo Extraction');
    expect(msg).toContain('Hot Shampoo Spot Treatment');
  });

  it('No match at any tier returns null', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, 'Nonexistent Service');
    expect(out).toBeNull();
  });

  it('Empty string returns null without querying', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, '');
    expect(out).toBeNull();
  });

  it('Whitespace-only string returns null without querying', async () => {
    const admin = makeAdminMock([makeRow('Hot Shampoo Extraction')]);
    const out = await resolveServiceByName(admin, '   \t  ');
    expect(out).toBeNull();
  });
});
