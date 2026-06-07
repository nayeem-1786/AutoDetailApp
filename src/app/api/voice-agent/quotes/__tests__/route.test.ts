/**
 * Issue 33 Layer 1 — coverage for POST /api/voice-agent/quotes (ElevenLabs
 * voice agent direct-quote creation path).
 *
 * Before Layer 1, this route did its own pricing (not via resolvePrice) and
 * wrote quote_items WITHOUT `pricing_type` or `standard_price`. Layer 1
 * added:
 *  1) combo detection across the resolved item set via applyCombosToQuoteItems
 *  2) standard_price + pricing_type columns persisted to quote_items
 *
 * No existing test file — this is the first one for this route.
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

// --- supabase admin: chainable stub ---
const ANCHOR_ID = 'service-express-interior-id';
const ADDON_ID = 'service-pet-hair-id';

interface ServiceRow {
  id: string;
  name: string;
  flat_price: number | null;
  pricing_model: string;
  service_pricing: Array<{ tier_name: string; price: number }>;
}

const seededServices: ServiceRow[] = [
  {
    id: ANCHOR_ID,
    name: 'Express Interior Clean',
    flat_price: null,
    pricing_model: 'vehicle_size',
    service_pricing: [
      { tier_name: 'sedan', price: 85 },
      { tier_name: 'truck_suv_2row', price: 100 },
    ],
  },
  {
    id: ADDON_ID,
    name: 'Pet Hair & Dander Removal',
    flat_price: 125,
    pricing_model: 'flat',
    service_pricing: [],
  },
];

const insertedQuoteItems: unknown[] = [];
let inserted: { quote: Record<string, unknown> | null } = { quote: null };

function makeAdminStub() {
  return {
    _table: '' as string,
    _action: '' as 'select' | 'insert' | 'update' | '',
    _filterIds: [] as string[],
    from(table: string) {
      this._table = table;
      this._action = '';
      this._filterIds = [];
      return this;
    },
    select(_cols?: string) { this._action = this._action || 'select'; return this; },
    insert(payload: unknown) {
      this._action = 'insert';
      if (this._table === 'quote_items' && Array.isArray(payload)) {
        insertedQuoteItems.push(...payload);
      }
      if (this._table === 'quotes' && !Array.isArray(payload)) {
        inserted.quote = {
          id: 'q-new-id',
          quote_number: 'Q-1001',
          status: (payload as { status?: string }).status ?? 'draft',
          subtotal: (payload as { subtotal?: number }).subtotal ?? 0,
          total_amount: (payload as { total_amount?: number }).total_amount ?? 0,
          valid_until: (payload as { valid_until?: string }).valid_until ?? null,
          sent_at: (payload as { sent_at?: string | null }).sent_at ?? null,
          created_at: new Date().toISOString(),
        };
      }
      return this;
    },
    update(_payload: unknown) { this._action = 'update'; return this; },
    eq(_col: string, _val: unknown) { return this; },
    is(_col: string, _val: unknown) { return this; },
    in(_col: string, vals: unknown[]) {
      this._filterIds = vals as string[];
      return this;
    },
    limit(_n: number) { return this; },
    async maybeSingle() {
      if (this._table === 'business_settings') return { data: { value: '10' }, error: null };
      return { data: null, error: null };
    },
    async single() {
      if (this._table === 'customers' && this._action === 'select') {
        return { data: null, error: { code: 'PGRST116' } };
      }
      if (this._table === 'customers' && this._action === 'insert') {
        return { data: { id: 'cust-new-id' }, error: null };
      }
      if (this._table === 'quotes' && this._action === 'insert') {
        return { data: inserted.quote, error: null };
      }
      return { data: null, error: null };
    },
    then<T>(
      onF?: (v: { data: unknown; error: unknown }) => T | PromiseLike<T>,
      onR?: (r: unknown) => T | PromiseLike<T>,
    ) {
      if (this._table === 'services' && this._action === 'select') {
        const data = seededServices.filter((s) => this._filterIds.includes(s.id));
        return Promise.resolve({ data, error: null }).then(onF, onR);
      }
      return Promise.resolve({ data: null, error: null }).then(onF, onR);
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminStub() as unknown,
}));

// --- vehicle helpers ---
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

// --- quote number ---
vi.mock('@/lib/utils/quote-number', () => ({
  generateQuoteNumber: async () => 'Q-1001',
}));

// --- combo resolver mock ---
const applyCombosToQuoteItemsMock = vi.fn();
vi.mock('@/lib/services/combo-resolver', () => ({
  applyCombosToQuoteItems: (...args: unknown[]) => applyCombosToQuoteItemsMock(...args),
}));

import { POST } from '@/app/api/voice-agent/quotes/route';

function buildRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/voice-agent/quotes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  authState.valid = true;
  insertedQuoteItems.length = 0;
  inserted = { quote: null };
  findOrCreateVehicleMock.mockReset();
  applyCombosToQuoteItemsMock.mockReset();
  // Default: pass-through
  applyCombosToQuoteItemsMock.mockImplementation(
    async (_admin: unknown, items: unknown[]) => items,
  );
  findOrCreateVehicleMock.mockResolvedValue({
    id: 'v-honda',
    created: false,
    vehicle_category: 'automobile',
    size_class: 'sedan',
    specialty_tier: null,
  });
});

describe('POST /api/voice-agent/quotes — happy path + combo coverage', () => {
  it('401 when auth invalid', async () => {
    authState.valid = false;
    const res = await POST(
      buildRequest({
        customer_name: 'Test',
        customer_phone: '+14245551234',
        services: [{ service_id: ANCHOR_ID, tier_name: 'sedan' }],
      }),
    );
    expect(res.status).toBe(401);
  });

  it('400 when required fields missing', async () => {
    const res = await POST(
      buildRequest({
        customer_name: 'Test',
        customer_phone: '+14245551234',
        services: [],
      }),
    );
    expect(res.status).toBe(400);
  });

  it('happy path — creates quote_items with standard_price + pricing_type columns (Layer 1 alignment)', async () => {
    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [{ service_id: ANCHOR_ID, tier_name: 'sedan' }],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
        vehicle_year: 2023,
      }),
    );

    expect(res.status).toBe(201);
    expect(insertedQuoteItems).toHaveLength(1);
    const item = insertedQuoteItems[0] as Record<string, unknown>;
    expect(item).toMatchObject({
      service_id: ANCHOR_ID,
      unit_price: 85,
      tier_name: 'sedan',
      pricing_type: 'standard',
      standard_price: null,
    });
  });

  it('combo HIT — applyCombosToQuoteItems rewrites addon → quote_items reflect combo_price + standard_price + pricing_type=combo', async () => {
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
          it.service_id === ADDON_ID
            ? { ...it, unit_price: 100, standard_price: 125, pricing_type: 'combo' }
            : it,
        ),
    );

    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [
          { service_id: ANCHOR_ID, tier_name: 'sedan' },
          { service_id: ADDON_ID },
        ],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(res.status).toBe(201);
    expect(applyCombosToQuoteItemsMock).toHaveBeenCalled();

    const addonRow = insertedQuoteItems.find(
      (it): it is Record<string, unknown> =>
        typeof it === 'object' && it !== null && (it as { service_id?: string }).service_id === ADDON_ID,
    );
    expect(addonRow).toMatchObject({
      unit_price: 100,
      standard_price: 125,
      pricing_type: 'combo',
      total_price: 100,
    });
  });

  it('combo MISS — no anchor in quote → addon priced at standalone, pricing_type=standard', async () => {
    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [{ service_id: ADDON_ID }],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(res.status).toBe(201);
    expect(insertedQuoteItems).toHaveLength(1);
    expect(insertedQuoteItems[0]).toMatchObject({
      service_id: ADDON_ID,
      unit_price: 125,
      pricing_type: 'standard',
      standard_price: null,
    });
  });

  it('combo helper is invoked exactly once per request, with the supabase client + items array', async () => {
    await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [
          { service_id: ANCHOR_ID, tier_name: 'sedan' },
          { service_id: ADDON_ID },
        ],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(applyCombosToQuoteItemsMock).toHaveBeenCalledTimes(1);
    const callArgs = applyCombosToQuoteItemsMock.mock.calls[0];
    expect(callArgs[1]).toHaveLength(2);
    expect(callArgs[1][0]).toMatchObject({ service_id: ANCHOR_ID, unit_price: 85 });
    expect(callArgs[1][1]).toMatchObject({ service_id: ADDON_ID, unit_price: 125 });
  });

  it('subtotal calculated from rewritten unit_price (combo wins → subtotal lower)', async () => {
    applyCombosToQuoteItemsMock.mockImplementation(
      async (
        _admin: unknown,
        items: Array<{ service_id: string; unit_price: number; [k: string]: unknown }>,
      ) =>
        items.map((it) =>
          it.service_id === ADDON_ID ? { ...it, unit_price: 100, standard_price: 125, pricing_type: 'combo' } : it,
        ),
    );

    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [
          { service_id: ANCHOR_ID, tier_name: 'sedan' },
          { service_id: ADDON_ID },
        ],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    const body = await res.json();
    // $85 anchor + $100 combo addon = $185 (not $210 if combo failed)
    expect(body.quote.subtotal).toBe(185);
    expect(body.quote.total_amount).toBe(185);
  });

  it('items in response payload use unit_price × quantity (not the dropped total_price field)', async () => {
    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [{ service_id: ANCHOR_ID, tier_name: 'sedan' }],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    const body = await res.json();
    expect(body.quote.items).toHaveLength(1);
    expect(body.quote.items[0]).toMatchObject({
      service_id: ANCHOR_ID,
      price: 85,
    });
  });

  it('multiple anchors and addons — each row carries its own pricing_type', async () => {
    // 2 services, one is the addon. Combo applies only to the addon.
    applyCombosToQuoteItemsMock.mockImplementation(
      async (
        _admin: unknown,
        items: Array<{ service_id: string; unit_price: number; [k: string]: unknown }>,
      ) =>
        items.map((it) =>
          it.service_id === ADDON_ID ? { ...it, unit_price: 100, standard_price: 125, pricing_type: 'combo' } : it,
        ),
    );

    const res = await POST(
      buildRequest({
        customer_name: 'Test User',
        customer_phone: '+14245551234',
        services: [
          { service_id: ANCHOR_ID, tier_name: 'sedan' },
          { service_id: ADDON_ID },
        ],
        vehicle_make: 'Honda',
        vehicle_model: 'Accord',
      }),
    );

    expect(res.status).toBe(201);
    const anchorRow = insertedQuoteItems.find(
      (it): it is Record<string, unknown> =>
        typeof it === 'object' && it !== null && (it as { service_id?: string }).service_id === ANCHOR_ID,
    );
    const addonRow = insertedQuoteItems.find(
      (it): it is Record<string, unknown> =>
        typeof it === 'object' && it !== null && (it as { service_id?: string }).service_id === ADDON_ID,
    );
    expect(anchorRow).toMatchObject({ pricing_type: 'standard' });
    expect(addonRow).toMatchObject({ pricing_type: 'combo' });
  });
});
