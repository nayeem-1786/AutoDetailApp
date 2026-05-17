import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-iv — Scenario A end-to-end pin for POST /api/book.
//
// Pre-15g-ii, the online-booking writer stored loyalty redemption as plaintext
// inside `appointments.internal_notes` ("Loyalty points used: N (D discount)").
// 15g-ii migrated the writes to `loyalty_points_redeemed` + `loyalty_discount`.
// 15g-iv cleans up the stale stop-gap comments and the redundant explicit
// `internal_notes: null` write (column has no DEFAULT — omitting writes NULL
// natively).
//
// This test pins the post-cleanup contract: every persisted column reflects
// the request body shape, no plaintext leakage into `internal_notes`, and the
// no-modifier case writes zero/null defaults without crashing.
// ──────────────────────────────────────────────────────────────────────────────

interface InsertCapture {
  table: string;
  row: Record<string, unknown>;
}

const captured: InsertCapture[] = [];
const state = {
  serviceRow: null as Record<string, unknown> | null,
  overlapping: [] as Record<string, unknown>[],
  existingCustomer: null as Record<string, unknown> | null,
  insertedCustomerId: 'cust-new-1',
  insertedAppointmentId: 'appt-new-1',
};

// External-side mocks — collapse to no-ops so we focus on DB write payloads.
vi.mock('@/lib/utils/sms', () => ({ sendSms: vi.fn(async () => undefined) }));
vi.mock('@/lib/utils/email', () => ({ sendEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/send-templated-email', () => ({
  sendTemplatedEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/email/send-welcome-email', () => ({
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async () => undefined),
}));
vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => undefined),
  getRequestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async () => ({
    body: '',
    isActive: false,
    canSilence: false,
    recipientType: 'customer' as const,
    recipientPhones: null,
  })),
}));
vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: vi.fn(async () => true),
}));
vi.mock('@/lib/utils/sale-pricing', () => ({
  getSaleStatus: () => ({ isOnSale: false }),
}));
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/utils/mobile-address-action', () => ({
  resolveMobileAddressAction: vi.fn(async () => null),
}));
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: vi.fn(async () => ({
    name: 'Smart Details',
    phone: '+15555550100',
    email: 'biz@example.com',
    address: '123 Test St',
  })),
}));
vi.mock('@/lib/utils/assign-detailer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/assign-detailer')>(
    '@/lib/utils/assign-detailer'
  );
  return {
    ...actual,
    findAvailableDetailer: vi.fn(async () => 'emp-detailer-1'),
  };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

function makeBuilder(table: string): unknown {
  let pendingInsert: Record<string, unknown> | null = null;

  async function resolveTerminal(): Promise<{ data: unknown; error: unknown }> {
    if (table === 'services') {
      return {
        data: state.serviceRow ?? {
          id: 'svc-1',
          name: 'Full Detail',
          pricing_model: 'flat',
          flat_price: 200,
          sale_price: null,
          sale_starts_at: null,
          sale_ends_at: null,
          per_unit_price: null,
          is_active: true,
          online_bookable: true,
          vehicle_compatibility: [],
          service_pricing: [],
        },
        error: null,
      };
    }
    if (table === 'appointments') {
      // Two read paths: overlap-check (returns array via .limit) and
      // appointment insert (returns single row via .select().single()).
      if (pendingInsert) {
        const row = { id: state.insertedAppointmentId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: state.overlapping, error: null };
    }
    if (table === 'customers') {
      if (pendingInsert) {
        const row = { id: state.insertedCustomerId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      if (state.existingCustomer) {
        return { data: state.existingCustomer, error: null };
      }
      return { data: null, error: { code: 'PGRST116', message: 'not found' } };
    }
    if (table === 'appointment_services') {
      if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    if (table === 'vehicles') return { data: null, error: null };
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    lt: () => builder,
    gt: () => builder,
    is: () => builder,
    in: () => builder,
    limit: () => builder,
    order: () => builder,
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      // Normalize array insert to a single capture for assertion convenience.
      pendingInsert = Array.isArray(payload) ? { _array: payload } : payload;
      // Some inserts terminate immediately (no .select()) — capture now via
      // a then-resolve so awaiting the builder picks them up.
      return builder;
    },
    update: () => builder,
    single: () => resolveTerminal(),
    maybeSingle: () => resolveTerminal(),
    then: (
      onfulfilled: (v: unknown) => unknown,
      onrejected?: (r: unknown) => unknown
    ) => resolveTerminal().then(onfulfilled, onrejected),
  };

  return builder;
}

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SERVICE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function buildBookingBody(overrides: Record<string, unknown> = {}) {
  return {
    service_id: SERVICE_ID,
    price: 200,
    date: '2026-06-01',
    time: '10:00',
    duration_minutes: 120,
    is_mobile: false,
    customer: {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '(424) 555-1234',
      email: 'jane@example.com',
      sms_consent: false,
      email_consent: false,
    },
    vehicle: {
      vehicle_category: 'automobile',
      vehicle_type: 'standard',
      size_class: 'sedan',
      year: 2024,
      make: 'Tesla',
      model: 'Model 3',
      color: 'White',
    },
    addons: [],
    channel: 'online',
    ...overrides,
  };
}

beforeEach(() => {
  captured.length = 0;
  state.serviceRow = null;
  state.overlapping = [];
  state.existingCustomer = null;
});

function getAppointmentInsert(): Record<string, unknown> {
  const row = captured.find((c) => c.table === 'appointments');
  if (!row) throw new Error('No appointments insert captured');
  return row.row;
}

describe('POST /api/book — Item 15g Layer 15g-iv modifier persistence (Scenario A: online booking)', () => {
  it('persists coupon + loyalty modifiers to dedicated columns; never to internal_notes', async () => {
    const res = await POST(
      makeReq(
        buildBookingBody({
          coupon_code: 'BOOKING25',
          coupon_discount: 25,
          loyalty_points_used: 500,
          loyalty_discount: 25,
        })
      )
    );
    expect(res.status).toBe(201);

    const appt = getAppointmentInsert();

    // Modifier columns — Layer 15g-ii contract.
    expect(appt.coupon_code).toBe('BOOKING25');
    expect(appt.coupon_discount).toBe(25);
    expect(appt.loyalty_points_redeemed).toBe(500);
    expect(appt.loyalty_discount).toBe(25);

    // Canonical combined column — appointments analytics consumer.
    expect(appt.discount_amount).toBe(50);

    // Total reflects discount subtraction.
    expect(appt.total_amount).toBe(150); // 200 subtotal - 50 discount

    // No stop-gap plaintext written to internal_notes (post-15g-iv cleanup
    // also removed the redundant explicit `internal_notes: null` write — the
    // column has no DEFAULT, so omitting writes NULL natively).
    expect(appt).not.toHaveProperty('internal_notes');
  });

  it('writes 0/null defaults for the no-modifier booking case', async () => {
    const res = await POST(makeReq(buildBookingBody()));
    expect(res.status).toBe(201);

    const appt = getAppointmentInsert();
    expect(appt.coupon_code).toBeNull();
    expect(appt.coupon_discount).toBeNull();
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
    expect(appt.discount_amount).toBe(0);
    expect(appt.total_amount).toBe(200);
    expect(appt).not.toHaveProperty('internal_notes');
  });

  it('writes coupon-only when no loyalty redemption', async () => {
    const res = await POST(
      makeReq(
        buildBookingBody({
          coupon_code: 'SAVE10',
          coupon_discount: 10,
        })
      )
    );
    expect(res.status).toBe(201);

    const appt = getAppointmentInsert();
    expect(appt.coupon_code).toBe('SAVE10');
    expect(appt.coupon_discount).toBe(10);
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
    expect(appt.discount_amount).toBe(10);
    expect(appt.total_amount).toBe(190);
  });

  it('writes loyalty-only when no coupon (the column that pre-15g-ii silently leaked into internal_notes)', async () => {
    const res = await POST(
      makeReq(
        buildBookingBody({
          loyalty_points_used: 200,
          loyalty_discount: 10,
        })
      )
    );
    expect(res.status).toBe(201);

    const appt = getAppointmentInsert();
    expect(appt.coupon_code).toBeNull();
    expect(appt.coupon_discount).toBeNull();
    expect(appt.loyalty_points_redeemed).toBe(200);
    expect(appt.loyalty_discount).toBe(10);
    // Important pin: this row is the regression target — pre-15g-ii, loyalty
    // ended up as plaintext in internal_notes. Post-15g-iv: only dedicated
    // columns + no explicit null write.
    expect(appt).not.toHaveProperty('internal_notes');
  });
});
