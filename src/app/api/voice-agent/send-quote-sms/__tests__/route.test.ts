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
  quote_items: Array<{ service_id: string | null }> | null;
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
  // isActive=false makes the route skip Twilio without touching it
  renderSmsTemplate: async () => ({ isActive: false, body: null }),
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
  quotesIdempotencyState.recentQuotes = [];
  quotesIdempotencyState.shouldThrow = false;

  resolveServiceByNameMock.mockImplementation(async () => SIGNATURE_SERVICE);
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
        quote_items: [{ service_id: 'service-signature-id' }],
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
        quote_items: [{ service_id: 'service-signature-id' }],
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
