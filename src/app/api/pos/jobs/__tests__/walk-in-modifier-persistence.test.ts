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

// Phase 3 Theme A (AC-10): pos/jobs/route.ts now generates appointment_number
// via next_identifier('appointment'). The supabase stub below does not
// implement .rpc(), so we short-circuit the helper.
vi.mock('@/lib/utils/appointment-number', () => ({
  generateAppointmentNumber: vi.fn(async () => 'A-WALKIN-10001'),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => makeBuilder(table),
  }),
}));

// Session 2.1.1: walk-in route now calls `materializeJobFromAppointment` after
// the appointment INSERT, so the mock has to be stateful — the helper SELECTs
// the just-INSERTed appointment, checks for an existing job (returns null),
// upserts the job row, then the route does a final SELECT-with-joins for the
// response shape. The `committed` store survives across builders so reads see
// previously-INSERTed rows.
const committed = {
  appointment: null as Record<string, unknown> | null,
  job: null as Record<string, unknown> | null,
};

function makeBuilder(table: string): unknown {
  let pendingOp: 'insert' | 'upsert' | 'update' | 'delete' | 'select' | null = null;
  let pendingPayload: Record<string, unknown> | Record<string, unknown>[] | null = null;

  async function resolveTerminal(): Promise<{ data: unknown; error: unknown }> {
    // INSERT / UPSERT into jobs — capture + materialize a row id.
    if (table === 'jobs' && (pendingOp === 'insert' || pendingOp === 'upsert')) {
      const row = Array.isArray(pendingPayload)
        ? (pendingPayload[0] as Record<string, unknown>)
        : (pendingPayload as Record<string, unknown>);
      captured.push({ table, row });
      const materialized = {
        id: state.jobId,
        ...row,
        customer: { id: 'c-1', first_name: 'Wal', last_name: 'King', phone: null },
        vehicle: null,
        assigned_staff: null,
      };
      committed.job = materialized;
      pendingOp = null;
      pendingPayload = null;
      // Upsert path returns the new id-array; insert path single-row.
      if (pendingOp === 'upsert') {
        return { data: [{ id: state.jobId }], error: null };
      }
      return { data: materialized, error: null };
    }

    // SELECT from jobs — idempotency check (returns null = no existing job)
    // OR the response-shape fetch after helper success (returns the committed row).
    if (table === 'jobs' && pendingOp === 'select') {
      pendingOp = null;
      // The helper's idempotency check runs BEFORE the upsert; at that point
      // committed.job is still null. The response-shape SELECT runs AFTER
      // the upsert; committed.job is populated. The same branch serves both.
      return { data: committed.job, error: null };
    }

    // INSERT into appointments — capture + commit so subsequent SELECTs see it.
    if (table === 'appointments' && pendingOp === 'insert') {
      const row = pendingPayload as Record<string, unknown>;
      captured.push({ table, row });
      committed.appointment = { id: state.appointmentId, ...row };
      pendingOp = null;
      pendingPayload = null;
      return { data: committed.appointment, error: null };
    }

    // SELECT from appointments — the helper reads the just-INSERTed row.
    if (table === 'appointments' && pendingOp === 'select') {
      pendingOp = null;
      return { data: committed.appointment, error: null };
    }

    // UPDATE on appointments — walk-in's appointment is already in_progress
    // so the helper's `if (apptStatus === 'confirmed')` skips the UPDATE; this
    // branch should not fire in the walk-in flow but is here for safety.
    if (table === 'appointments' && pendingOp === 'update') {
      pendingOp = null;
      pendingPayload = null;
      return { data: null, error: null };
    }

    // INSERT into appointment_services — captured but no data needed back.
    if (table === 'appointment_services' && pendingOp === 'insert') {
      captured.push({ table, row: pendingPayload as Record<string, unknown> });
      pendingOp = null;
      pendingPayload = null;
      return { data: null, error: null };
    }

    return { data: null, error: null };
  }

  const builder: Record<string, unknown> = {
    select: () => {
      pendingOp = pendingOp ?? 'select';
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    limit: () => builder,
    order: () => builder,
    insert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingOp = 'insert';
      pendingPayload = payload;
      return builder;
    },
    upsert: (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      pendingOp = 'upsert';
      pendingPayload = payload;
      return builder;
    },
    update: (payload: Record<string, unknown>) => {
      pendingOp = 'update';
      pendingPayload = payload;
      return builder;
    },
    delete: () => {
      pendingOp = 'delete';
      return builder;
    },
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
  committed.appointment = null;
  committed.job = null;
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
