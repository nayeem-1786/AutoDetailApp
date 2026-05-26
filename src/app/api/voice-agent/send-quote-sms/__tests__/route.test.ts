/**
 * Bug A regression suite for POST /api/voice-agent/send-quote-sms.
 *
 * Pinned defect: before 2026-05-20 the endpoint hardcoded
 *   const sizeClass = 'sedan';
 * before running the service price-resolution loop, regardless of the
 * agent-provided vehicle_year/make/model. Q-0076 (Joselyn Reyes, 2015
 * Chevy Tahoe) shipped at sedan-tier $210 instead of suv_3row_van $320.
 *
 * The fix reorders the handler so findOrCreateVehicle runs BEFORE the
 * price loop, and resolvePrice receives the classified size_class
 * from the returned FindOrCreateVehicleResult.
 *
 * These tests verify the size_class flows correctly for all 5 tiers,
 * the missing-vehicle fallback is explicit (warning + sedan), and a
 * named regression test reconstructs the Q-0076 failure surface.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// --- auth ---
const authState = { valid: true as boolean };
vi.mock('@/lib/auth/api-key', () => ({
  validateApiKey: async () => ({
    valid: authState.valid,
    error: authState.valid ? undefined : 'Invalid API key',
  }),
}));

// --- supabase admin: a chainable stub that resolves the shapes the route reads ---
//
// Routes accesses (all via admin.from(table).select|insert|update|...):
//   customers   select → existing (returns null = create branch)
//   customers   insert(...).select(...).single() → newCustomer
//   customers   update(...).eq(...)
//   business_settings select('value').eq('key', 'quote_validity_days').maybeSingle()
//   quotes      update({status:'sent', sent_at}).eq('id', ...)
//   quote_communications insert({...})
//
// We model with thenable terminal methods (.maybeSingle, .single) returning
// fixed shapes and chain-returning intermediates returning `this`.

const fakeCustomerRow = {
  id: 'customer-fake-id',
  first_name: 'Test',
  last_name: 'Customer',
  email: null,
  phone: '+14245551234',
  sms_consent: true,
};
const fakeValiditySetting = { value: '10' };

// Workstream J Session 4 — seed for the 60s idempotency guard's
// SELECT from `quotes`. Tests opt in to dedup hits by populating this.
// Default empty array → guard finds no duplicate → normal flow runs.
interface SeededQuoteRow {
  id: string;
  quote_number: string;
  access_token: string | null;
  created_at: string;
  // Issue 38 D43 — the guard now compares (service_id, tier_name, quantity)
  // triples. tier_name/quantity are optional here so legacy seeds (which only
  // set service_id) still typecheck; the route's buildItemTripleKey collapses
  // a missing tier_name to '' and a missing quantity to 1 (matching the real
  // pre-D43 row shape).
  quote_items: Array<{
    service_id: string | null;
    tier_name?: string | null;
    quantity?: number | null;
  }> | null;
}
const quotesIdempotencyState: {
  recentQuotes: SeededQuoteRow[];
  shouldThrow: boolean;
} = {
  recentQuotes: [],
  shouldThrow: false,
};

function makeAdminStub() {
  const builder = {
    _table: '',
    _action: '' as 'select' | 'insert' | 'update' | '',
    _insertPayload: null as unknown,

    from(table: string) {
      this._table = table;
      this._action = '';
      this._insertPayload = null;
      return this;
    },
    select(_cols?: string) { this._action = this._action || 'select'; return this; },
    insert(payload: unknown) { this._action = 'insert'; this._insertPayload = payload; return this; },
    update(_payload: unknown) { this._action = 'update'; return this; },
    eq(_col: string, _val: unknown) { return this; },
    is(_col: string, _val: unknown) { return this; },
    in(_col: string, _vals: unknown[]) { return this; },
    gte(_col: string, _val: unknown) { return this; },
    order(_col: string, _opts?: unknown) { return this; },
    limit(_n: number) { return this; },
    async maybeSingle() {
      if (this._table === 'customers') return { data: fakeCustomerRow, error: null };
      if (this._table === 'business_settings') return { data: fakeValiditySetting, error: null };
      return { data: null, error: null };
    },
    async single() {
      if (this._table === 'customers' && this._action === 'insert') {
        return { data: { ...fakeCustomerRow, id: 'customer-new-id' }, error: null };
      }
      return { data: null, error: null };
    },
    // PostgREST-style "await without terminal" for fire-and-forget updates/inserts
    // AND for unconstrained SELECTs (e.g. the dedup guard's quotes query).
    // make the builder itself thenable.
    then<TResolved = unknown>(
      onFulfilled?: (v: { data: unknown; error: { message: string } | null }) => TResolved | PromiseLike<TResolved>,
      onRejected?: (reason: unknown) => TResolved | PromiseLike<TResolved>,
    ) {
      // Idempotency-guard quotes SELECT — route reads { data: array }.
      if (this._table === 'quotes' && this._action === 'select') {
        if (quotesIdempotencyState.shouldThrow) {
          return Promise.reject(new Error('simulated quotes SELECT failure')).then(
            onFulfilled,
            onRejected,
          );
        }
        return Promise.resolve({
          data: quotesIdempotencyState.recentQuotes,
          error: null,
        }).then(onFulfilled, onRejected);
      }
      return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminStub() as unknown,
}));

// --- format helpers (real implementations are fine; no DB needed) ---
// normalizePhone is pure; let real impl run.

// --- vehicle helpers: mock findOrCreateVehicle per-test, real sanitizeVehicleField ---
const findOrCreateVehicleMock = vi.fn();
vi.mock('@/lib/utils/vehicle-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/vehicle-helpers')>(
    '@/lib/utils/vehicle-helpers',
  );
  return {
    ...actual,
    findOrCreateVehicle: (...args: Parameters<typeof actual.findOrCreateVehicle>) =>
      findOrCreateVehicleMock(...args),
  };
});

// --- service resolver: mock resolveServiceByName + resolvePrice ---
// resolvePrice is the critical assertion target — it MUST receive the
// vehicle's actual size_class, not 'sedan'.
const resolveServiceByNameMock = vi.fn();
const resolvePriceMock = vi.fn();
vi.mock('@/lib/services/service-resolver', () => ({
  resolveServiceByName: (...args: unknown[]) => resolveServiceByNameMock(...args),
  resolvePrice: (...args: unknown[]) => resolvePriceMock(...args),
}));

// --- combo resolver: pass-through by default; tests can override to
//     simulate combo application without seeding the suggestions table ---
const applyCombosToQuoteItemsMock = vi.fn();
vi.mock('@/lib/services/combo-resolver', () => ({
  applyCombosToQuoteItems: (
    ...args: unknown[]
  ) => applyCombosToQuoteItemsMock(...args),
}));

// --- quote service: mock createQuote — assert quote_items.tier_name + unit_price ---
const createQuoteMock = vi.fn();
vi.mock('@/lib/quotes/quote-service', () => ({
  createQuote: (...args: unknown[]) => createQuoteMock(...args),
}));

// --- short link, sms, business info, template render: stubbed cheap ---
vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: async (url: string) => `short:${url}`,
}));
vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async () => undefined),
}));
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'TestBiz' }),
}));
vi.mock('@/lib/sms/render-sms-template', () => ({
  // isActive=false makes the route skip Twilio without touching it.
  // Wrapped in vi.fn() so individual describe blocks can override
  // (e.g., Issue 46 refinement block forces isActive:true to reach
  // the sendSms call and inspect notificationType).
  renderSmsTemplate: vi.fn(async () => ({ isActive: false, body: null })),
}));

// Import the route AFTER all mocks are wired
import { POST } from '@/app/api/voice-agent/send-quote-sms/route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice-agent/send-quote-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
    body: JSON.stringify(body),
  });
}

const SIGNATURE_SERVICE = {
  id: 'service-signature-id',
  name: 'Signature Complete Detail',
  pricing_model: 'vehicle_size',
  service_pricing: [],
};

beforeEach(() => {
  authState.valid = true;
  findOrCreateVehicleMock.mockReset();
  resolveServiceByNameMock.mockReset();
  resolvePriceMock.mockReset();
  createQuoteMock.mockReset();
  applyCombosToQuoteItemsMock.mockReset();
  quotesIdempotencyState.recentQuotes = [];
  quotesIdempotencyState.shouldThrow = false;

  resolveServiceByNameMock.mockImplementation(async () => SIGNATURE_SERVICE);
  // Default: combo resolver is a pass-through (no combos applied)
  applyCombosToQuoteItemsMock.mockImplementation(
    async (_admin: unknown, items: unknown[]) => items,
  );
  createQuoteMock.mockImplementation(async () => ({
    quote: {
      id: 'quote-fake-id',
      quote_number: 'Q-9999',
      access_token: 'tok-fake',
    },
  }));
});

describe('POST /api/voice-agent/send-quote-sms — size_class flows from vehicle, not hardcoded', () => {
  it('401 when auth invalid', async () => {
    authState.valid = false;
    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
    }));
    expect(res.status).toBe(401);
  });

  it('sedan vehicle → resolvePrice receives "sedan", quote items priced at sedan tier', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce({
      id: 'v-sedan',
      created: true,
      vehicle_category: 'automobile',
      size_class: 'sedan',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValueOnce({
      price: 210,
      salePrice: null,
      tierName: 'sedan',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'sedan');
    expect(createQuoteMock).toHaveBeenCalled();
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'sedan', unit_price: 210 });
  });

  it('truck_suv_2row vehicle → resolvePrice receives "truck_suv_2row", $260 tier', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce({
      id: 'v-tesla',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'truck_suv_2row',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValueOnce({
      price: 260,
      salePrice: null,
      tierName: 'truck_suv_2row',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Tesla',
      vehicle_model: 'Model Y',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'truck_suv_2row');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'truck_suv_2row', unit_price: 260 });
  });

  it('regression: Q-0076 — Tahoe quote uses suv_3row_van tier ($320), not sedan ($210)', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce({
      id: 'v-tahoe',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'suv_3row_van',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValueOnce({
      price: 320,
      salePrice: null,
      tierName: 'suv_3row_van',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14243396994',
      customer_name: 'Joselyn Reyes',
      services: 'Signature Complete Detail',
      vehicle_year: 2015,
      vehicle_make: 'Chevy',
      vehicle_model: 'Tahoe',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'suv_3row_van');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'suv_3row_van', unit_price: 320 });
    // Pin the defect-history value too — Q-0076's wrong stored values must
    // never reappear on this code path.
    expect(items[0].tier_name).not.toBe('sedan');
    expect(items[0].unit_price).not.toBe(210);
  });

  it('exotic vehicle → resolvePrice receives "exotic", $425 tier', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce({
      id: 'v-ferrari',
      created: true,
      vehicle_category: 'automobile',
      size_class: 'exotic',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValueOnce({
      price: 425,
      salePrice: null,
      tierName: 'exotic',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2024,
      vehicle_make: 'Ferrari',
      vehicle_model: 'Roma Spider',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'exotic');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'exotic', unit_price: 425 });
  });

  it('classic vehicle → resolvePrice receives "classic", $425 tier', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce({
      id: 'v-mustang',
      created: true,
      vehicle_category: 'automobile',
      size_class: 'classic',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValueOnce({
      price: 425,
      salePrice: null,
      tierName: 'classic',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 1969,
      vehicle_make: 'Ford',
      vehicle_model: 'Mustang',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'classic');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'classic', unit_price: 425 });
  });

  it('missing vehicle_make → falls back to sedan tier with explicit warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    resolvePriceMock.mockReturnValueOnce({
      price: 210,
      salePrice: null,
      tierName: 'sedan',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      // no vehicle_make
    }));

    expect(res.status).toBe(200);
    // findOrCreateVehicle was NOT invoked (the `if (vehicle_make)` gate)
    expect(findOrCreateVehicleMock).not.toHaveBeenCalled();
    // resolvePrice still gets a sizeClass — the explicit fallback, not silent
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'sedan');
    // the warning is logged so this case is observable in prod logs
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('No vehicle_make supplied'),
    );
    warnSpy.mockRestore();
  });

  it('findOrCreateVehicle returns null (race/RLS failure) → falls back to sedan tier, quote still created without vehicle_id', async () => {
    findOrCreateVehicleMock.mockResolvedValueOnce(null);
    resolvePriceMock.mockReturnValueOnce({
      price: 210,
      salePrice: null,
      tierName: 'sedan',
      isOnSale: false,
    });

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2015,
      vehicle_make: 'Chevy',
      vehicle_model: 'Tahoe',
    }));

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(SIGNATURE_SERVICE, 'sedan');
    // createQuote called with vehicle_id undefined since vehicleResult was null
    const arg = createQuoteMock.mock.calls[0][1];
    expect(arg.vehicle_id).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 4 — 60-second idempotency guard (D36, Issue 31)
//
// Catches the intermittent double-send pattern from Test 1 (2026-05-23):
// LLM confabulation triggers a second send_quote_sms with identical inputs
// within the same conversation, seconds after the first one succeeded.
// Guard returns the existing quote with `was_duplicate: true` instead of
// creating a duplicate row + sending a second SMS.
// ---------------------------------------------------------------------------

describe('POST /api/voice-agent/send-quote-sms — 60s idempotency guard', () => {
  // Default service resolver + price mocks for all dedup tests
  beforeEach(() => {
    findOrCreateVehicleMock.mockResolvedValue({
      id: 'v-honda',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'sedan',
      specialty_tier: null,
    });
    resolvePriceMock.mockReturnValue({
      price: 210,
      salePrice: null,
      tierName: 'sedan',
      isOnSale: false,
    });
  });

  it('happy path — no recent quote → creates new quote, response does NOT contain was_duplicate', async () => {
    // recentQuotes already empty from outer beforeEach
    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.was_duplicate).toBeUndefined();
    expect(body.quote_number).toBe('Q-9999');
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('idempotency HIT within 60s — same customer + vehicle + service set → returns existing quote, no createQuote', async () => {
    // Seed a 30-second-old quote with the exact service set the request
    // resolves to (resolveServiceByNameMock returns SIGNATURE_SERVICE with
    // id 'service-signature-id', so quoteItems[0].service_id = that).
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-existing',
        quote_number: 'Q-0084',
        access_token: 'tok-existing',
        created_at: new Date(Date.now() - 30_000).toISOString(),
        // tier_name + quantity reflect what the route now SELECTs and what the
        // real DB stored (this describe block's resolvePriceMock returns
        // tierName='sedan'); the triple must match the candidate to HIT.
        quote_items: [{ service_id: 'service-signature-id', tier_name: 'sedan', quantity: 1 }],
      },
    ];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.was_duplicate).toBe(true);
    expect(body.quote_number).toBe('Q-0084');
    expect(typeof body.quote_link).toBe('string');
    expect(body.quote_link).toContain('tok-existing');
    expect(typeof body.instructions_for_agent).toBe('string');
    expect(body.instructions_for_agent).toMatch(/duplicate quote/i);
    expect(body.instructions_for_agent).toMatch(/do NOT inform the customer/i);
    // createQuote NOT called — no duplicate row created
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it('idempotency MISS past 60s — existing quote is 90s old → normal flow creates new quote', async () => {
    // 90s > 60s window. The endpoint's .gte('created_at', now-60s) filter
    // is server-side; the test stub doesn't enforce date filtering, so we
    // simulate the upstream filter by passing an EMPTY seed array (which is
    // what the real DB would return when nothing matches the 60s window).
    quotesIdempotencyState.recentQuotes = [];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('idempotency MISS — different service set → normal flow creates new quote', async () => {
    // Existing quote has a different service_id than the resolver returns.
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-other',
        quote_number: 'Q-0083',
        access_token: 'tok-other',
        created_at: new Date(Date.now() - 30_000).toISOString(),
        quote_items: [{ service_id: 'service-DIFFERENT-id' }],
      },
    ];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(body.quote_number).toBe('Q-9999');
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('idempotency MISS — different service set (extra item in candidate) → normal flow', async () => {
    // Candidate has 1 service; existing has 2. Even though one overlaps,
    // sets differ → no dedup hit.
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-overlap',
        quote_number: 'Q-0082',
        access_token: 'tok-overlap',
        created_at: new Date(Date.now() - 10_000).toISOString(),
        quote_items: [
          { service_id: 'service-signature-id' },
          { service_id: 'service-add-on-id' },
        ],
      },
    ];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('idempotency MISS — different vehicle → normal flow (handled by .eq(vehicle_id) filter upstream)', async () => {
    // The test stub doesn't enforce the .eq('vehicle_id', vehicleId) filter
    // server-side; the empty seed simulates what the DB returns when the
    // existing quote's vehicle_id doesn't match. This pins the test
    // contract — when no row matches the vehicle filter, the dedup loop
    // sees zero candidates and normal flow runs.
    quotesIdempotencyState.recentQuotes = [];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('idempotency MISS — declined/expired status filtered by upstream .in() → normal flow', async () => {
    // Endpoint filters .in('status', ['sent','viewed']); declined/expired
    // never appear in the seed. Empty seed simulates that filter outcome.
    quotesIdempotencyState.recentQuotes = [];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  it('dedup query failure does NOT block — error logged, normal flow proceeds', async () => {
    quotesIdempotencyState.shouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Idempotency check failed'),
      expect.any(String),
    );
    errSpy.mockRestore();
  });

  it('response shape on dedup hit — instructions_for_agent guides agent to silent acknowledgment', async () => {
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-dup',
        quote_number: 'Q-0099',
        access_token: 'tok-dup',
        created_at: new Date(Date.now() - 15_000).toISOString(),
        // tier_name + quantity match the candidate triple (sedan / 1) so the
        // guard registers a HIT under the Issue 38 D43 triple comparison.
        quote_items: [{ service_id: 'service-signature-id', tier_name: 'sedan', quantity: 1 }],
      },
    ];

    const res = await POST(buildRequest({
      phone: '+14245551234',
      services: 'Signature Complete Detail',
      vehicle_year: 2023,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    }));

    const body = await res.json();
    // Required keys for the agent to follow Rule 16 silently
    expect(body.success).toBe(true);
    expect(body.was_duplicate).toBe(true);
    expect(body.quote_number).toBe('Q-0099');
    expect(body.quote_link).toContain('tok-dup');
    // instructions_for_agent text covers the three load-bearing directives:
    // (1) don't tell the customer about the dedup, (2) acknowledge naturally,
    // (3) don't call send_quote_sms again.
    expect(body.instructions_for_agent).toMatch(/do NOT inform the customer/i);
    expect(body.instructions_for_agent).toMatch(/acknowledge naturally/i);
    expect(body.instructions_for_agent).toMatch(/do not call send_quote_sms again/i);
  });
});

// ---------------------------------------------------------------------------
// Issue 33 Layer 1 — combo pricing application
//
// Reproduces the Q-0084 (Test 4) failure surface: agent says "Express Interior
// $85 + Pet Hair bundles for $100 (saves $25)" but quote total shipped without
// combo applied. Layer 1 adoption wraps the resolved items through the combo
// resolver helper, which rewrites the addon line item with combo_price.
// ---------------------------------------------------------------------------

const EXPRESS_INTERIOR_ID = 'service-express-interior-id';
const PET_HAIR_ID = 'service-pet-hair-id';

const EXPRESS_INTERIOR = {
  id: EXPRESS_INTERIOR_ID,
  name: 'Express Interior Clean',
  pricing_model: 'vehicle_size',
  service_pricing: [],
};
const PET_HAIR = {
  id: PET_HAIR_ID,
  name: 'Pet Hair & Dander Removal',
  pricing_model: 'flat',
  service_pricing: [],
};

describe('POST /api/voice-agent/send-quote-sms — combo pricing application (Issue 33)', () => {
  beforeEach(() => {
    findOrCreateVehicleMock.mockResolvedValue({
      id: 'v-honda',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'sedan',
      specialty_tier: null,
    });
  });

  it('combo HIT — Q-0084 reproduction: Express Interior + Pet Hair → Pet Hair rewritten with combo_price=$100', async () => {
    // Each call to resolveServiceByName returns the matching service.
    resolveServiceByNameMock
      .mockResolvedValueOnce(EXPRESS_INTERIOR)
      .mockResolvedValueOnce(PET_HAIR);
    // resolvePrice: anchor $85 sedan tier, addon $125 standalone
    resolvePriceMock
      .mockReturnValueOnce({ price: 85, salePrice: null, tierName: 'sedan', isOnSale: false })
      .mockReturnValueOnce({ price: 125, salePrice: null, tierName: null, isOnSale: false });

    // Simulate the combo helper applying the combo: Pet Hair gets $100,
    // standard_price=$125, pricing_type='combo'.
    applyCombosToQuoteItemsMock.mockImplementation(
      async (
        _admin: unknown,
        items: Array<{
          service_id: string;
          unit_price: number;
          standard_price: number | null;
          pricing_type: string | null;
          [k: string]: unknown;
        }>,
      ) =>
        items.map((it) =>
          it.service_id === PET_HAIR_ID
            ? { ...it, unit_price: 100, standard_price: 125, pricing_type: 'combo' }
            : it,
        ),
    );

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Express Interior Clean, Pet Hair & Dander Removal',
        vehicle_year: 2023,
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(res.status).toBe(200);
    expect(applyCombosToQuoteItemsMock).toHaveBeenCalledTimes(1);
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items).toHaveLength(2);
    const petHair = items.find((i: { service_id: string }) => i.service_id === PET_HAIR_ID);
    expect(petHair).toMatchObject({
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
    });
  });

  it('combo MISS — only addon, no anchor → addon stays at standalone', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(PET_HAIR);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: null,
      isOnSale: false,
    });
    // Combo resolver returns items unchanged (no anchor in set)
    applyCombosToQuoteItemsMock.mockImplementation(async (_admin: unknown, items: unknown[]) => items);

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Pet Hair & Dander Removal',
        vehicle_year: 2023,
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(res.status).toBe(200);
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({
      service_id: PET_HAIR_ID,
      unit_price: 125,
      pricing_type: 'standard',
    });
  });

  it('combo helper is invoked with the resolved item set (admin, items[, options])', async () => {
    resolveServiceByNameMock
      .mockResolvedValueOnce(EXPRESS_INTERIOR)
      .mockResolvedValueOnce(PET_HAIR);
    resolvePriceMock
      .mockReturnValueOnce({ price: 85, salePrice: null, tierName: 'sedan', isOnSale: false })
      .mockReturnValueOnce({ price: 125, salePrice: null, tierName: null, isOnSale: false });

    await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Express Interior Clean, Pet Hair & Dander Removal',
        vehicle_year: 2023,
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(applyCombosToQuoteItemsMock).toHaveBeenCalled();
    const passedItems = applyCombosToQuoteItemsMock.mock.calls[0][1];
    expect(passedItems).toHaveLength(2);
    expect(passedItems[0]).toMatchObject({ service_id: EXPRESS_INTERIOR_ID, unit_price: 85 });
    expect(passedItems[1]).toMatchObject({ service_id: PET_HAIR_ID, unit_price: 125 });
  });

  it('exotic size_class still resolves through combo helper (no special bypass)', async () => {
    // Boundary pin (not a behavior change): exotic vehicles still reach the
    // combo helper. The existing exotic/classic agent escalation lives at
    // the prompt layer (out of scope for this session). This test pins that
    // the combo helper itself does not crash or throw on exotic size_class.
    findOrCreateVehicleMock.mockReset();
    findOrCreateVehicleMock.mockResolvedValue({
      id: 'v-ferrari',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'exotic',
      specialty_tier: null,
    });
    resolveServiceByNameMock.mockResolvedValueOnce(EXPRESS_INTERIOR);
    resolvePriceMock.mockReturnValueOnce({
      price: 425,
      salePrice: null,
      tierName: 'exotic',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Express Interior Clean',
        vehicle_year: 2024,
        vehicle_make: 'Ferrari',
        vehicle_model: 'Roma',
      }),
    );

    expect(res.status).toBe(200);
    expect(applyCombosToQuoteItemsMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Issue 38 D43 — tier + quantity handling (Session C route integration)
//
// Closes the Q-0084 fidelity gap: agent verbalized "Per Row × 2 = $250" but
// the quote shipped at $450 (the size-aware `complete` tier auto-picked by
// resolvePrice). Session A added resolvePrice's `options.tierName`; Session B
// added the `tiers` + `quantities` tool-schema params + Critical Rule 7; this
// session (C) wires them through the route: parse the parallel CSVs, pass
// tierName into resolvePrice, enforce max_qty, propagate quantity to the
// quote_item, and extend the D36 idempotency guard to compare
// (service_id, tier_name, quantity) triples.
//
// resolvePrice is mocked here (its own behavior is pinned by Session A's
// service-resolver tests). These tests pin the ROUTE contract: what it passes
// to resolvePrice, how it reacts to a null return (unknown tier), how it
// enforces max_qty from service.service_pricing, and what it writes to the
// quote_item.
// ---------------------------------------------------------------------------

const HOT_SHAMPOO_ID = 'service-hot-shampoo-id';
const HOT_SHAMPOO = {
  id: HOT_SHAMPOO_ID,
  name: 'Hot Shampoo Extraction',
  pricing_model: 'scope',
  // Only the fields the ROUTE reads directly matter here (tier_name for the
  // available-tiers error list, max_qty + qty_label for the bound check).
  // resolvePrice is mocked, so price columns are irrelevant.
  service_pricing: [
    { tier_name: 'floor_mats', max_qty: null, qty_label: null },
    { tier_name: 'per_row', max_qty: 3, qty_label: 'row' },
    { tier_name: 'carpet_mats', max_qty: null, qty_label: null },
    { tier_name: 'complete', max_qty: null, qty_label: null },
  ],
};

const MOTORCYCLE_ID = 'service-motorcycle-id';
const MOTORCYCLE = {
  id: MOTORCYCLE_ID,
  name: 'Complete Motorcycle Detail',
  pricing_model: 'specialty',
  service_pricing: [
    { tier_name: 'standard_cruiser', max_qty: null, qty_label: null },
    { tier_name: 'touring_bagger', max_qty: null, qty_label: null },
  ],
};

describe('POST /api/voice-agent/send-quote-sms — Issue 38 D43 tier + quantity handling', () => {
  beforeEach(() => {
    // Default vehicle: 2018 Suburban → suv_3row_van (the empirical Q-0084 case).
    findOrCreateVehicleMock.mockResolvedValue({
      id: 'v-suburban',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'suv_3row_van',
      specialty_tier: null,
    });
  });

  // --- Happy paths (6) ---

  it('Hot Shampoo + tiers="per_row" + quantities="2" → quote_item per_row × 2 @ $125 = $250', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '2',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    // Route opts into the fail-loud overload by passing the tier intent.
    expect(resolvePriceMock).toHaveBeenCalledWith(HOT_SHAMPOO, 'suv_3row_van', {
      tierName: 'per_row',
    });
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      service_id: HOT_SHAMPOO_ID,
      tier_name: 'per_row',
      quantity: 2,
      unit_price: 125,
    });
    // total_price is computed downstream in createQuote (quantity * unit_price).
    expect(items[0].quantity * items[0].unit_price).toBe(250);
  });

  it('Hot Shampoo + tiers="complete" (no quantities) → quote_item complete × 1 @ $450', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 450,
      salePrice: null,
      tierName: 'complete',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'complete',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(HOT_SHAMPOO, 'suv_3row_van', {
      tierName: 'complete',
    });
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'complete', quantity: 1, unit_price: 450 });
  });

  it('Complete Motorcycle Detail + tiers="touring_bagger" → touring_bagger (not the default standard_cruiser)', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(MOTORCYCLE);
    resolvePriceMock.mockReturnValueOnce({
      price: 350,
      salePrice: null,
      tierName: 'touring_bagger',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Complete Motorcycle Detail',
        tiers: 'touring_bagger',
        vehicle_year: 2022,
        vehicle_make: 'Harley-Davidson',
        vehicle_model: 'Street Glide',
      }),
    );

    expect(res.status).toBe(200);
    expect(resolvePriceMock).toHaveBeenCalledWith(MOTORCYCLE, expect.any(String), {
      tierName: 'touring_bagger',
    });
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0].tier_name).toBe('touring_bagger');
    expect(items[0].tier_name).not.toBe('standard_cruiser');
  });

  it('two services, only second has tier intent: tiers=",per_row" + quantities="1,2" → first auto-picks, second per_row × 2', async () => {
    resolveServiceByNameMock
      .mockResolvedValueOnce(EXPRESS_INTERIOR)
      .mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock
      .mockReturnValueOnce({ price: 85, salePrice: null, tierName: 'sedan', isOnSale: false })
      .mockReturnValueOnce({ price: 125, salePrice: null, tierName: 'per_row', isOnSale: false });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Express Interior Clean, Hot Shampoo Extraction',
        tiers: ',per_row',
        quantities: '1,2',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    // First service: empty tier token → legacy auto-pick (2-arg call, no options).
    expect(resolvePriceMock).toHaveBeenNthCalledWith(1, EXPRESS_INTERIOR, 'suv_3row_van');
    // Second service: explicit tier intent (3-arg call).
    expect(resolvePriceMock).toHaveBeenNthCalledWith(2, HOT_SHAMPOO, 'suv_3row_van', {
      tierName: 'per_row',
    });
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ service_id: EXPRESS_INTERIOR_ID, tier_name: 'sedan', quantity: 1 });
    expect(items[1]).toMatchObject({ service_id: HOT_SHAMPOO_ID, tier_name: 'per_row', quantity: 2, unit_price: 125 });
  });

  it('quantities omitted entirely → defaults to 1 (legacy regression: byte-identical pre-D43)', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0].quantity).toBe(1);
  });

  it('tiers omitted entirely → auto-pick per item (legacy regression: 2-arg resolvePrice, never null)', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 450,
      salePrice: null,
      tierName: 'complete',
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    // No tier token → legacy 2-arg call (no options object).
    expect(resolvePriceMock).toHaveBeenCalledWith(HOT_SHAMPOO, 'suv_3row_van');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ tier_name: 'complete', quantity: 1 });
  });

  // --- Error paths (5) ---

  it('unknown tier_name → 400 + instructions_for_agent listing available tiers + do_not_share_with_customer', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    // Session A's resolver returns null when the named tier doesn't exist.
    resolvePriceMock.mockReturnValueOnce(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'bogus_tier',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Tier not found');
    expect(body.instructions_for_agent).toContain('bogus_tier');
    expect(body.instructions_for_agent).toContain('Hot Shampoo Extraction');
    // Available tiers from service_pricing are surfaced verbatim for recovery.
    expect(body.instructions_for_agent).toMatch(/floor_mats/);
    expect(body.instructions_for_agent).toMatch(/per_row/);
    expect(body.instructions_for_agent).toMatch(/complete/);
    expect(body.do_not_share_with_customer).toBe(true);
    expect(createQuoteMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('quantity > max_qty (per_row × 4, max_qty=3) → 400 + instructions citing max + qty_label', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '4',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Quantity exceeds maximum');
    expect(body.instructions_for_agent).toContain('3'); // max_qty
    expect(body.instructions_for_agent).toContain('row'); // qty_label
    expect(body.instructions_for_agent).toContain('per_row');
    expect(body.do_not_share_with_customer).toBe(true);
    expect(createQuoteMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('non-integer quantity ("two") → 400 + instructions_for_agent (rejected before resolution)', async () => {
    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: 'two',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid quantity');
    expect(body.do_not_share_with_customer).toBe(true);
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it('negative quantity ("-1") → 400 + instructions_for_agent', async () => {
    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '-1',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid quantity');
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it('quantity = 0 → 400 + instructions_for_agent', async () => {
    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '0',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid quantity');
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  // --- Idempotency guard (2) ---

  it('idempotency HIT — same service + tier + quantity within 60s → was_duplicate, no createQuote', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-hot-existing',
        quote_number: 'Q-0084',
        access_token: 'tok-hot',
        created_at: new Date(Date.now() - 20_000).toISOString(),
        quote_items: [{ service_id: HOT_SHAMPOO_ID, tier_name: 'per_row', quantity: 2 }],
      },
    ];

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '2',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBe(true);
    expect(body.quote_number).toBe('Q-0084');
    expect(createQuoteMock).not.toHaveBeenCalled();
  });

  it('idempotency MISS — same service but DIFFERENT tier within 60s → new quote at the different tier', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValueOnce({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });
    // Existing quote was the `complete` tier ($450); the new request is
    // `per_row` × 2 ($250). Triples differ → NOT a duplicate.
    quotesIdempotencyState.recentQuotes = [
      {
        id: 'q-hot-complete',
        quote_number: 'Q-0083',
        access_token: 'tok-complete',
        created_at: new Date(Date.now() - 20_000).toISOString(),
        quote_items: [{ service_id: HOT_SHAMPOO_ID, tier_name: 'complete', quantity: 1 }],
      },
    ];

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Hot Shampoo Extraction',
        tiers: 'per_row',
        quantities: '2',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.was_duplicate).toBeUndefined();
    expect(body.quote_number).toBe('Q-9999');
    expect(createQuoteMock).toHaveBeenCalledTimes(1);
  });

  // --- Boundary (1) ---

  it('quantities="2" for a flat-priced service (no tiers, no max_qty) → quantity=2 honored, total = unit_price × 2', async () => {
    resolveServiceByNameMock.mockResolvedValueOnce(PET_HAIR);
    resolvePriceMock.mockReturnValueOnce({
      price: 50,
      salePrice: null,
      tierName: null,
      isOnSale: false,
    });

    const res = await POST(
      buildRequest({
        phone: '+14245551234',
        services: 'Pet Hair & Dander Removal',
        quantities: '2',
        vehicle_year: 2018,
        vehicle_make: 'Chevy',
        vehicle_model: 'Suburban',
      }),
    );

    expect(res.status).toBe(200);
    // No tier token → auto-pick (2-arg call); flat resolves with tierName=null,
    // so the max_qty bound check is skipped and quantity passes through.
    expect(resolvePriceMock).toHaveBeenCalledWith(PET_HAIR, 'suv_3row_van');
    const items = createQuoteMock.mock.calls[0][1].items;
    expect(items[0]).toMatchObject({ service_id: PET_HAIR_ID, tier_name: null, quantity: 2, unit_price: 50 });
    expect(items[0].quantity * items[0].unit_price).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Issue 46 refinement (2026-05-26) — channel-aware notificationType
// branching. Route reads optional `source` from request body and branches
// the `notificationType` passed to sendSms between:
//   - source === 'sms_agent'      →  'sms_agent_quote_sent' (NEW)
//   - otherwise (or missing/invalid) →  'voice_quote_sent' (backward-compat
//                                       default for the ElevenLabs voice
//                                       webhook caller, which doesn't pass
//                                       the field).
// The two values are STABLE machine identifiers persisted in
// messages.metadata for dedup (src/lib/sms/dedup.ts) and audit; only the
// operator-facing Admin Messages log labels differ (rendered via
// NOTIFICATION_LABEL_OVERRIDES in
// src/app/admin/messaging/components/message-bubble.tsx).
// ---------------------------------------------------------------------------

describe('POST /api/voice-agent/send-quote-sms — Issue 46 refinement (channel-aware notificationType)', () => {
  // Import the mocked modules so we can inspect / override per-test.
  // Both were mocked at the top of the file; importing here resolves
  // to the mocked instances under Vitest's mock hoisting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sendSmsMock: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let renderSmsTemplateMock: any;

  beforeEach(async () => {
    // Wire mocks dynamically so the imports resolve to the hoisted mocks.
    const smsMod = await import('@/lib/utils/sms');
    const renderMod = await import('@/lib/sms/render-sms-template');
    sendSmsMock = smsMod.sendSms as unknown as ReturnType<typeof vi.fn>;
    renderSmsTemplateMock = renderMod.renderSmsTemplate as unknown as ReturnType<
      typeof vi.fn
    >;
    sendSmsMock.mockReset();
    sendSmsMock.mockImplementation(async () => undefined);
    // Force the template to be ACTIVE so the route reaches the sendSms
    // call (default mock returns isActive:false → skips sendSms).
    renderSmsTemplateMock.mockImplementation(async () => ({
      isActive: true,
      body: 'Quote ready: https://short/link',
    }));

    // Standard fixture: 2018 Suburban + Hot Shampoo Extraction (matches
    // Q-0087, the empirical case from the Issues 43 + 44 + 46 arc).
    findOrCreateVehicleMock.mockResolvedValue({
      id: 'v-suburban',
      created: false,
      vehicle_category: 'automobile',
      size_class: 'suv_3row_van',
      specialty_tier: null,
    });
    resolveServiceByNameMock.mockResolvedValue(HOT_SHAMPOO);
    resolvePriceMock.mockReturnValue({
      price: 125,
      salePrice: null,
      tierName: 'per_row',
      isOnSale: false,
    });
  });

  function bodyWithSource(source?: unknown) {
    const base: Record<string, unknown> = {
      phone: '+14245551234',
      services: 'Hot Shampoo Extraction',
      tiers: 'per_row',
      quantities: '2',
      vehicle_year: 2018,
      vehicle_make: 'Chevy',
      vehicle_model: 'Suburban',
    };
    if (source !== undefined) base.source = source;
    return base;
  }

  function getNotificationTypeFromSendSms(): string | undefined {
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    const opts = sendSmsMock.mock.calls[0][2] as
      | { notificationType?: string }
      | undefined;
    return opts?.notificationType;
  }

  it('source === "sms_agent" → notificationType: "sms_agent_quote_sent"', async () => {
    const res = await POST(buildRequest(bodyWithSource('sms_agent')));
    expect(res.status).toBe(200);
    expect(getNotificationTypeFromSendSms()).toBe('sms_agent_quote_sent');
  });

  it('source === "voice_agent" → notificationType: "voice_quote_sent" (explicit value)', async () => {
    const res = await POST(buildRequest(bodyWithSource('voice_agent')));
    expect(res.status).toBe(200);
    expect(getNotificationTypeFromSendSms()).toBe('voice_quote_sent');
  });

  it('source missing (ElevenLabs voice webhook backward-compat) → defaults to "voice_quote_sent"', async () => {
    const res = await POST(buildRequest(bodyWithSource(undefined)));
    expect(res.status).toBe(200);
    expect(getNotificationTypeFromSendSms()).toBe('voice_quote_sent');
  });

  it('source is an unrecognized string ("unknown") → defaults to "voice_quote_sent" (defensive fallback)', async () => {
    const res = await POST(buildRequest(bodyWithSource('unknown')));
    expect(res.status).toBe(200);
    expect(getNotificationTypeFromSendSms()).toBe('voice_quote_sent');
  });

  it('source is null → defaults to "voice_quote_sent"', async () => {
    const res = await POST(buildRequest(bodyWithSource(null)));
    expect(res.status).toBe(200);
    expect(getNotificationTypeFromSendSms()).toBe('voice_quote_sent');
  });
});
