/**
 * GET /api/voice-agent/services — service catalog endpoint tests.
 *
 * Coverage focus (Issue 33 Layer 2): the new optional `size_class` query
 * parameter. When provided AND valid, size-aware addons
 * (`pricing_model in ('vehicle_size', 'scope')`) get a concrete
 * `standard_price` + computed `savings` via the canonical
 * `resolvePrice` engine. When omitted or invalid, the endpoint preserves
 * the legacy `standard_price: null` for size-aware addons so existing
 * callers stay backward-compatible.
 *
 * Pattern: per-test canned data drives a chainable Supabase admin stub.
 * Auth is mocked open by default; one test flips it closed to confirm
 * the 401 path is unaffected by the new param.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---- auth ---------------------------------------------------------------

const authState = { valid: true as boolean };
vi.mock('@/lib/auth/api-key', () => ({
  validateApiKey: async () => ({
    valid: authState.valid,
    error: authState.valid ? undefined : 'Invalid API key',
  }),
}));

// ---- perf timer (no-op) ------------------------------------------------

vi.mock('@/lib/utils/voice-perf', () => ({
  createPerfTimer: () => ({
    now: () => 0,
    mark: () => undefined,
    done: () => undefined,
  }),
}));

// ---- supabase admin stub -----------------------------------------------
//
// Canned per-table responses; tests override via `dbState` before
// invoking the handler. The endpoint runs three queries:
//   1. services (with embedded service_pricing)
//   2. service_addon_suggestions (with embedded addon_service + nested service_pricing)
//   3. service_prerequisites (with embedded prerequisite_service)
//
// The stub returns dbState.{services,addons,prereqs} on .order() / await
// resolution.

interface CannedServiceRow {
  id: string;
  name: string;
  description: string | null;
  classification: string | null;
  pricing_model: string;
  flat_price: number | null;
  sale_price: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  per_unit_price: number | null;
  per_unit_label: string | null;
  per_unit_max: number | null;
  custom_starting_price: number | null;
  base_duration_minutes: number | null;
  mobile_eligible: boolean | null;
  vehicle_compatibility: string[] | null;
  special_requirements: string | null;
  service_categories: { name: string } | null;
  service_pricing: unknown[];
}

interface CannedAddonRow {
  primary_service_id: string;
  addon_service_id: string;
  combo_price: number | null;
  is_seasonal: boolean;
  seasonal_start: string | null;
  seasonal_end: string | null;
  addon_service: {
    id: string;
    name: string;
    flat_price: number | null;
    pricing_model: string;
    per_unit_price: number | null;
    custom_starting_price: number | null;
    sale_price: number | null;
    sale_starts_at: string | null;
    sale_ends_at: string | null;
    service_pricing: unknown[];
  } | null;
}

const dbState: {
  services: CannedServiceRow[];
  addons: CannedAddonRow[];
  prereqs: unknown[];
} = {
  services: [],
  addons: [],
  prereqs: [],
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const builder = {
        _table: table,
        select() { return builder; },
        eq() { return builder; },
        in() { return builder; },
        async order() {
          if (builder._table === 'services') {
            return { data: dbState.services, error: null };
          }
          if (builder._table === 'service_addon_suggestions') {
            return { data: dbState.addons, error: null };
          }
          return { data: [], error: null };
        },
        // service_prerequisites is awaited without .order(), via .in().
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          if (builder._table === 'service_prerequisites') {
            resolve({ data: dbState.prereqs, error: null });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
  }),
}));

// Import AFTER mocks so vi.mock factories win.
import { GET } from '@/app/api/voice-agent/services/route';

// ---- helpers ------------------------------------------------------------

function buildRequest(searchParams: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost:3000/api/voice-agent/services');
  for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
  return new NextRequest(url, {
    method: 'GET',
    headers: { Authorization: 'Bearer test-key' },
  });
}

function makeAnchorService(overrides: Partial<CannedServiceRow> = {}): CannedServiceRow {
  return {
    id: 'svc-anchor',
    name: 'Express Interior Clean',
    description: 'Quick interior refresh',
    classification: 'interior',
    pricing_model: 'flat',
    flat_price: 85,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    per_unit_price: null,
    per_unit_label: null,
    per_unit_max: null,
    custom_starting_price: null,
    base_duration_minutes: 60,
    mobile_eligible: true,
    vehicle_compatibility: [],
    special_requirements: null,
    service_categories: { name: 'Interior' },
    service_pricing: [],
    ...overrides,
  };
}

function makeSizeAwareAddonService(): CannedAddonRow['addon_service'] {
  // `pricing_model = 'vehicle_size'` with a single tier carrying the
  // per-size columns (column-pattern A). resolvePrice will pick this
  // tier and dispatch to the engine which selects the right per-size
  // column.
  return {
    id: 'svc-addon-engine-bay',
    name: 'Engine Bay Detail',
    flat_price: null,
    pricing_model: 'vehicle_size',
    per_unit_price: null,
    custom_starting_price: null,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [
      {
        id: 'sp-1',
        service_id: 'svc-addon-engine-bay',
        tier_name: 'standard',
        tier_label: null,
        price: 175,
        sale_price: null,
        display_order: 0,
        is_vehicle_size_aware: true,
        vehicle_size_sedan_price: 175,
        vehicle_size_truck_suv_price: 200,
        vehicle_size_suv_van_price: 225,
        vehicle_size_exotic_price: 300,
        vehicle_size_classic_price: 250,
        max_qty: null,
        qty_label: null,
        created_at: '',
      },
    ],
  };
}

function makeFlatAddonService(): CannedAddonRow['addon_service'] {
  return {
    id: 'svc-addon-pet-hair',
    name: 'Pet Hair & Dander Removal',
    flat_price: 125,
    pricing_model: 'flat',
    per_unit_price: null,
    custom_starting_price: null,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [],
  };
}

function makeCustomAddonService(): CannedAddonRow['addon_service'] {
  return {
    id: 'svc-addon-paint-corr',
    name: 'Paint Correction',
    flat_price: null,
    pricing_model: 'custom',
    per_unit_price: null,
    custom_starting_price: 500,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    service_pricing: [],
  };
}

beforeEach(() => {
  authState.valid = true;
  dbState.services = [];
  dbState.addons = [];
  dbState.prereqs = [];
});

// ---- tests --------------------------------------------------------------

describe('GET /api/voice-agent/services — auth', () => {
  it('returns 401 when validateApiKey rejects (size_class param does not bypass)', async () => {
    authState.valid = false;
    const res = await GET(buildRequest({ size_class: 'sedan' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/voice-agent/services — size_class backward compatibility', () => {
  it('without size_class: size-aware addons return standard_price=null and savings=null (legacy behavior)', async () => {
    dbState.services = [makeAnchorService()];
    dbState.addons = [
      {
        primary_service_id: 'svc-anchor',
        addon_service_id: 'svc-addon-engine-bay',
        combo_price: 140,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        addon_service: makeSizeAwareAddonService(),
      },
    ];
    const res = await GET(buildRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    const anchor = body.services[0];
    expect(anchor.addon_suggestions).toHaveLength(1);
    expect(anchor.addon_suggestions[0]).toMatchObject({
      addon_name: 'Engine Bay Detail',
      addon_id: 'svc-addon-engine-bay',
      standard_price: null,
      combo_price: 140,
      savings: null,
    });
  });
});

describe('GET /api/voice-agent/services — size_class enables size-aware addon pricing', () => {
  beforeEach(() => {
    dbState.services = [makeAnchorService()];
    dbState.addons = [
      {
        primary_service_id: 'svc-anchor',
        addon_service_id: 'svc-addon-engine-bay',
        combo_price: 140,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        addon_service: makeSizeAwareAddonService(),
      },
    ];
  });

  it('size_class=sedan → addon returns sedan-priced standard_price + computed savings', async () => {
    const res = await GET(buildRequest({ size_class: 'sedan' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      standard_price: 175,
      combo_price: 140,
      savings: 35,
    });
  });

  it('size_class=truck_suv_2row → addon returns truck/SUV-priced standard_price + savings', async () => {
    const res = await GET(buildRequest({ size_class: 'truck_suv_2row' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      standard_price: 200,
      combo_price: 140,
      savings: 60,
    });
  });

  it('size_class=suv_3row_van → addon returns 3-row/van-priced standard_price + savings', async () => {
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      standard_price: 225,
      combo_price: 140,
      savings: 85,
    });
  });

  it('size_class=exotic → endpoint surfaces exotic standalone price (escalation enforcement is prompt-level, not endpoint-level)', async () => {
    const res = await GET(buildRequest({ size_class: 'exotic' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      standard_price: 300,
      combo_price: 140,
      savings: 160,
    });
  });

  it('size_class=classic → endpoint surfaces classic standalone price', async () => {
    const res = await GET(buildRequest({ size_class: 'classic' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      standard_price: 250,
      combo_price: 140,
      savings: 110,
    });
  });
});

describe('GET /api/voice-agent/services — size_class validation', () => {
  beforeEach(() => {
    dbState.services = [makeAnchorService()];
    dbState.addons = [
      {
        primary_service_id: 'svc-anchor',
        addon_service_id: 'svc-addon-engine-bay',
        combo_price: 140,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        addon_service: makeSizeAwareAddonService(),
      },
    ];
  });

  it('invalid size_class value (not in VEHICLE_SIZE_CLASS_KEYS) is silently ignored — falls back to null', async () => {
    const res = await GET(buildRequest({ size_class: 'not_a_real_size' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0].standard_price).toBeNull();
    expect(body.services[0].addon_suggestions[0].savings).toBeNull();
  });

  it('empty string size_class is silently ignored — falls back to null', async () => {
    const res = await GET(buildRequest({ size_class: '' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0].standard_price).toBeNull();
  });
});

describe('GET /api/voice-agent/services — non-size-aware addons unaffected by size_class', () => {
  it('flat-priced addon: standard_price=flat_price regardless of size_class (existing branch order preserved)', async () => {
    dbState.services = [makeAnchorService()];
    dbState.addons = [
      {
        primary_service_id: 'svc-anchor',
        addon_service_id: 'svc-addon-pet-hair',
        combo_price: 100,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        addon_service: makeFlatAddonService(),
      },
    ];
    const res = await GET(buildRequest({ size_class: 'sedan' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      addon_name: 'Pet Hair & Dander Removal',
      standard_price: 125,
      combo_price: 100,
      savings: 25,
    });
  });

  it('custom-priced addon: standard_price=custom_starting_price regardless of size_class', async () => {
    dbState.services = [makeAnchorService()];
    dbState.addons = [
      {
        primary_service_id: 'svc-anchor',
        addon_service_id: 'svc-addon-paint-corr',
        combo_price: 450,
        is_seasonal: false,
        seasonal_start: null,
        seasonal_end: null,
        addon_service: makeCustomAddonService(),
      },
    ];
    const res = await GET(buildRequest({ size_class: 'sedan' }));
    const body = await res.json();
    expect(body.services[0].addon_suggestions[0]).toMatchObject({
      addon_name: 'Paint Correction',
      standard_price: 500,
      combo_price: 450,
      savings: 50,
    });
  });
});

// ---------------------------------------------------------------------------
// D41 (2026-05-24) — Issue 36 final endpoint fix. Pre-D41 the main-tier
// resolution at services/route.ts:268 + 325 passed `null` to
// resolveServicePriceWithSale, silently disabling size-aware resolution
// for the main `services[i].pricing[]` array even when size_class
// arrived at the endpoint (via D40 dispatcher injection). D41 changes
// both sites to pass `sizeClass`. Hot Shampoo Extraction "complete"
// tier is the empirical Q-0084-class scenario — pricing_model='scope'
// with one is_vehicle_size_aware=true tier (price=300 fallback,
// vehicle_size_suv_van_price=450 for a 2018 Suburban).
//
// Pre-D41 the existing test corpus only exercised the addon_suggestions
// enrichment path; the anchor fixture is hard-coded pricing_model='flat'
// so no test covered the broken main-tier path. These tests close that
// coverage gap.
// ---------------------------------------------------------------------------

// Mirrors the real Hot Shampoo Extraction DB shape: pricing_model='scope'
// with 4 tiers, only the "complete" tier size-aware. Per-size values
// match the production data (DB query confirmed 2026-05-24).
function makeHotShampooService(): CannedServiceRow {
  return {
    id: 'svc-hot-shampoo',
    name: 'Hot Shampoo Extraction',
    description: 'Deep carpet cleaning',
    classification: 'both',
    pricing_model: 'scope',
    flat_price: null,
    sale_price: null,
    sale_starts_at: null,
    sale_ends_at: null,
    per_unit_price: null,
    per_unit_label: null,
    per_unit_max: null,
    custom_starting_price: null,
    base_duration_minutes: 90,
    mobile_eligible: true,
    vehicle_compatibility: [],
    special_requirements: null,
    service_categories: { name: 'Interior' },
    service_pricing: [
      {
        id: 'sp-floor-mats',
        service_id: 'svc-hot-shampoo',
        tier_name: 'floor_mats',
        tier_label: 'Floor Mats Only',
        price: 75,
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
      },
      {
        id: 'sp-per-row',
        service_id: 'svc-hot-shampoo',
        tier_name: 'per_row',
        tier_label: 'Per Seat Row',
        price: 125,
        sale_price: null,
        display_order: 1,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        vehicle_size_exotic_price: null,
        vehicle_size_classic_price: null,
        max_qty: null,
        qty_label: null,
        created_at: '',
      },
      {
        id: 'sp-carpet-mats',
        service_id: 'svc-hot-shampoo',
        tier_name: 'carpet_mats',
        tier_label: 'Carpet & Mats Package',
        price: 175,
        sale_price: null,
        display_order: 2,
        is_vehicle_size_aware: false,
        vehicle_size_sedan_price: null,
        vehicle_size_truck_suv_price: null,
        vehicle_size_suv_van_price: null,
        vehicle_size_exotic_price: null,
        vehicle_size_classic_price: null,
        max_qty: null,
        qty_label: null,
        created_at: '',
      },
      {
        id: 'sp-complete',
        service_id: 'svc-hot-shampoo',
        tier_name: 'complete',
        tier_label: 'Complete Interior',
        price: 300,
        sale_price: null,
        display_order: 3,
        is_vehicle_size_aware: true,
        vehicle_size_sedan_price: 325,
        vehicle_size_truck_suv_price: 375,
        vehicle_size_suv_van_price: 450,
        vehicle_size_exotic_price: 350,
        vehicle_size_classic_price: 350,
        max_qty: null,
        qty_label: null,
        created_at: '',
      },
    ],
  };
}

function pricingByTier(
  body: { services: Array<{ pricing: Array<{ tier_name: string; price: number | null }> }> },
  serviceIdx: number,
): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const t of body.services[serviceIdx].pricing) map.set(t.tier_name, t.price);
  return map;
}

describe('D41: size-aware main-tier resolution (Issue 36 final fix)', () => {
  beforeEach(() => {
    dbState.services = [makeHotShampooService()];
    dbState.addons = [];
  });

  it('Q-0084 scenario — Hot Shampoo "complete" tier with size_class=suv_3row_van returns $450 (was $300 pre-D41)', async () => {
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    const tiers = pricingByTier(body, 0);
    expect(tiers.get('complete')).toBe(450);
  });

  it('Sedan classification (Honda Accord) — Hot Shampoo "complete" returns $325', async () => {
    const res = await GET(buildRequest({ size_class: 'sedan' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(325);
  });

  it('Truck/SUV classification (Tacoma) — Hot Shampoo "complete" returns $375', async () => {
    const res = await GET(buildRequest({ size_class: 'truck_suv_2row' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(375);
  });

  it('Exotic classification — Hot Shampoo "complete" returns $350 (escalation enforcement is prompt-level via Critical Rule 4, not endpoint)', async () => {
    const res = await GET(buildRequest({ size_class: 'exotic' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(350);
  });

  it('Classic classification — Hot Shampoo "complete" returns $350', async () => {
    const res = await GET(buildRequest({ size_class: 'classic' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(350);
  });

  it('No size_class query param — Hot Shampoo "complete" returns $300 fallback (backward compat for legacy callers)', async () => {
    const res = await GET(buildRequest());
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(300);
  });

  it('Invalid size_class — Hot Shampoo "complete" returns $300 fallback (validation matches addon-path behavior)', async () => {
    const res = await GET(buildRequest({ size_class: 'foo' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(300);
  });

  it('Non-size-aware tiers (floor_mats / per_row / carpet_mats) unchanged regardless of size_class', async () => {
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    const body = await res.json();
    const tiers = pricingByTier(body, 0);
    // Per-tier engine check: is_vehicle_size_aware=false → short-circuit to pricing.price.
    expect(tiers.get('floor_mats')).toBe(75);
    expect(tiers.get('per_row')).toBe(125);
    expect(tiers.get('carpet_mats')).toBe(175);
  });

  it('Multi-tier mixed service emits all 4 tiers in display_order; only complete tier resolves to size-aware price', async () => {
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    const body = await res.json();
    expect(body.services[0].pricing).toHaveLength(4);
    expect(body.services[0].pricing.map((t: { tier_name: string }) => t.tier_name)).toEqual([
      'floor_mats',
      'per_row',
      'carpet_mats',
      'complete',
    ]);
    expect(body.services[0].pricing.map((t: { price: number }) => t.price)).toEqual([
      75, 125, 175, 450,
    ]);
  });

  it('Raw vehicle_size_*_price columns are NOT exposed to the LLM (response shape unchanged by D41)', async () => {
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    const body = await res.json();
    const completeTier = body.services[0].pricing.find((t: { tier_name: string }) => t.tier_name === 'complete');
    expect(completeTier).toBeDefined();
    // Endpoint MUST only emit { tier_name, price, sale_price? } —
    // raw size columns stripped (otherwise the LLM would couple to schema).
    expect(completeTier).not.toHaveProperty('vehicle_size_sedan_price');
    expect(completeTier).not.toHaveProperty('vehicle_size_suv_van_price');
    expect(completeTier).not.toHaveProperty('is_vehicle_size_aware');
  });

  it('Default switch fallthrough also receives sizeClass (line 325 fix mirrors line 268 — future-proof)', async () => {
    // Synthesize a service with an unknown pricing_model so the switch
    // falls through to the default branch. The default branch resolves
    // tiers identically to the scope/vehicle_size/specialty case.
    const futureService = { ...makeHotShampooService(), id: 'svc-future', pricing_model: 'future_unknown_model' };
    dbState.services = [futureService];
    const res = await GET(buildRequest({ size_class: 'suv_3row_van' }));
    const body = await res.json();
    expect(pricingByTier(body, 0).get('complete')).toBe(450);
  });
});

