import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-iv — Scenario C end-to-end pin for POST /api/pos/jobs
// (walk-in synthetic appointment).
//
// Layer 15g-ii added a 7-field modifier-snapshot payload on this route so that
// a POS-converted quote (via quote-ticket-panel handleCreateJob) carries the
// operator's coupon / loyalty / manual-discount state onto the synthetic
// appointment row. A pure walk-in (no upstream quote) passes nothing and the
// route writes safe defaults.
//
// This test pins the contract: appointment insert payload reflects each
// scenario's modifier shape, including the manual-discount percent → dollar
// resolution against the subtotal.
// ──────────────────────────────────────────────────────────────────────────────

interface InsertCapture {
  table: string;
  row: Record<string, unknown>;
}

const captured: InsertCapture[] = [];
const state = {
  authedEmployee: {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  } as
    | null
    | {
        employee_id: string;
        auth_user_id: string;
        role: string;
        first_name: string;
        last_name: string;
        email: string;
      },
  permissionGranted: true,
  appointmentId: 'appt-walkin-1',
  jobId: 'job-walkin-1',
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.authedEmployee,
}));
vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => state.permissionGranted,
}));
vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(async () => undefined),
  getRequestIp: () => '127.0.0.1',
}));
vi.mock('@/lib/utils/mobile-address-action', () => ({
  resolveMobileAddressAction: vi.fn(async () => null),
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
    if (table === 'jobs') {
      if (pendingInsert) {
        const row = {
          id: state.jobId,
          ...pendingInsert,
          customer: { id: 'c-1', first_name: 'Wal', last_name: 'King', phone: null },
          vehicle: null,
          assigned_staff: null,
        };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }
    if (table === 'appointments') {
      if (pendingInsert) {
        const row = { id: state.appointmentId, ...pendingInsert };
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
        return { data: row, error: null };
      }
      return { data: null, error: null };
    }
    if (table === 'appointment_services') {
      if (pendingInsert) {
        captured.push({ table, row: pendingInsert });
        pendingInsert = null;
      }
      return { data: null, error: null };
    }
    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    limit: () => builder,
    order: () => builder,
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingInsert = Array.isArray(payload) ? { _array: payload } : payload;
      return builder;
    },
    update: () => builder,
    delete: () => builder,
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
  return new NextRequest('http://localhost/api/pos/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildWalkInBody(overrides: Record<string, unknown> = {}) {
  return {
    customer_id: 'cust-walkin-1',
    vehicle_id: null,
    services: [
      { id: 'svc-1', name: 'Full Detail', price: 200 },
    ],
    is_mobile: false,
    ...overrides,
  };
}

function getAppointmentInsert(): Record<string, unknown> {
  const row = captured.find((c) => c.table === 'appointments');
  if (!row) throw new Error('No appointments insert captured');
  return row.row;
}

beforeEach(() => {
  captured.length = 0;
  state.authedEmployee = {
    employee_id: 'emp-1',
    auth_user_id: 'auth-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  };
  state.permissionGranted = true;
});

describe('POST /api/pos/jobs — Item 15g Layer 15g-iv walk-in modifier persistence (Scenario C)', () => {
  it('writes safe defaults for a pure walk-in (no modifiers in body)', async () => {
    const res = await POST(makeReq(buildWalkInBody()));
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    expect(appt.coupon_code).toBeNull();
    expect(appt.coupon_discount).toBeNull();
    expect(appt.loyalty_points_redeemed).toBe(0);
    expect(appt.loyalty_discount).toBe(0);
    expect(appt.manual_discount_value).toBeNull();
    expect(appt.manual_discount_label).toBeNull();
    expect(appt.discount_amount).toBe(0);
    expect(appt.subtotal).toBe(200);
    expect(appt.total_amount).toBe(200);
  });

  it('persists coupon + loyalty + manual-discount snapshot from a quote-bridged walk-in', async () => {
    const res = await POST(
      makeReq(
        buildWalkInBody({
          coupon_code: 'POS25',
          coupon_discount: 25,
          loyalty_points_to_redeem: 400,
          loyalty_discount: 20,
          manual_discount_type: 'dollar',
          manual_discount_value: 15,
          manual_discount_label: 'Friend rate',
        })
      )
    );
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    expect(appt.coupon_code).toBe('POS25');
    expect(appt.coupon_discount).toBe(25);
    expect(appt.loyalty_points_redeemed).toBe(400);
    expect(appt.loyalty_discount).toBe(20);
    expect(appt.manual_discount_value).toBe(15);
    expect(appt.manual_discount_label).toBe('Friend rate');

    // Combined canonical discount field.
    expect(appt.discount_amount).toBe(60); // 25 + 20 + 15
    expect(appt.subtotal).toBe(200);
    expect(appt.total_amount).toBe(140); // 200 - 60
  });

  it('resolves manual_discount_type=percent to dollar amount against subtotal', async () => {
    const res = await POST(
      makeReq(
        buildWalkInBody({
          manual_discount_type: 'percent',
          manual_discount_value: 10, // 10% of $200 subtotal = $20
          manual_discount_label: 'Loyalty perk',
        })
      )
    );
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    expect(appt.manual_discount_value).toBe(20);
    expect(appt.manual_discount_label).toBe('Loyalty perk');
    expect(appt.discount_amount).toBe(20);
    expect(appt.total_amount).toBe(180);
  });

  it('clamps total_amount to ≥ 0 when modifiers exceed the subtotal (over-discount safety)', async () => {
    const res = await POST(
      makeReq(
        buildWalkInBody({
          coupon_discount: 150,
          loyalty_discount: 100,
        })
      )
    );
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    // discount_amount records the actual modifier sum; total clamps at 0.
    expect(appt.discount_amount).toBe(250);
    expect(appt.total_amount).toBe(0);
  });

  it('drops manual_discount_label when manual_discount_value resolves to null (no manual discount)', async () => {
    const res = await POST(
      makeReq(
        buildWalkInBody({
          // Label without a value should not leak into the row.
          manual_discount_label: 'Should not appear',
        })
      )
    );
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    expect(appt.manual_discount_value).toBeNull();
    expect(appt.manual_discount_label).toBeNull();
  });

  // Item 15f Phase 1 Layer 8e — walk-in path was originally writing
  // HH:MM:SS values for `scheduled_start_time` (capturing wall-clock
  // seconds), which broke the Admin Appointment dialog's HTML5
  // `<input type="time">` step=60 validator. Layer 8e normalizes the
  // creator path to minute precision (HH:MM:00). This test pins the
  // shape so a future "let's capture seconds again" refactor breaks
  // loudly. End time follows the same shape via addMinutesToTime.
  it('writes minute-precision scheduled_start_time / scheduled_end_time (no seconds, Layer 8e)', async () => {
    const res = await POST(makeReq(buildWalkInBody()));
    expect(res.status).toBeLessThan(400);

    const appt = getAppointmentInsert();
    const start = appt.scheduled_start_time as string;
    const end = appt.scheduled_end_time as string;
    expect(start).toMatch(/^\d{2}:\d{2}:00$/);
    expect(end).toMatch(/^\d{2}:\d{2}:00$/);
    // Defense-in-depth: the seconds segment must be exactly "00", never
    // any other 2-digit number that might happen to slip through.
    expect(start.slice(6)).toBe('00');
    expect(end.slice(6)).toBe('00');
  });
});
