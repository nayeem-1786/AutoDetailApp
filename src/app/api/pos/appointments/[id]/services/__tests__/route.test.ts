import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PUT /api/pos/appointments/[id]/services — Item 15f Phase 1 Layer 8a
 * POS-authed sibling of the admin cascade endpoint. Verifies:
 *
 *   - Auth pattern: 401 when no PosEmployee; 403 when `pos.jobs.manage` denied
 *   - Cascade behavior parity with admin variant (same helper underneath)
 *   - 400 on invalid body / completed/cancelled status / unknown service / inactive service
 *   - 404 on missing appointment
 *   - Audit row tagged `source: 'pos'` (vs admin's `source: 'admin'`)
 *   - Modifier preservation (Item 15g Layer 15g-iii contract holds via shared helper)
 *   - Notification suppression — no SMS / email / webhook on success path
 *   - Linked-job cascade writes `jobs.services` JSONB
 */

interface ApptRow {
  id: string;
  status: string;
  subtotal: number;
  total_amount: number;
  tax_amount: number;
  discount_amount: number;
  is_mobile: boolean;
  mobile_surcharge: number;
  mobile_zone_name_snapshot: string | null;
  coupon_discount?: number | null;
  loyalty_discount?: number | null;
  manual_discount_value?: number | null;
}

interface ServiceLookupRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface ApptServiceRow {
  id: string;
  service_id: string;
  price_at_booking: number;
  tier_name: string | null;
}

interface JobRow {
  id: string;
  services: unknown;
}

const state = {
  posEmployee: {
    employee_id: 'emp-pos-1',
    auth_user_id: 'auth-pos-1',
    role: 'detailer',
    first_name: 'Sam',
    last_name: 'Detailer',
    email: 'sam@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  manageGranted: true,
  appointment: null as null | ApptRow,
  existingServices: [] as ApptServiceRow[],
  serviceLookup: [] as ServiceLookupRow[],
  linkedJob: null as JobRow | null,

  // Captured side effects
  inserts: [] as Array<{ table: string; rows: unknown }>,
  deletes: [] as Array<{ table: string; filter: { col: string; val: unknown } }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; filter: { col: string; val: unknown } }>,
  auditCalls: [] as Array<Record<string, unknown>>,
  smsSends: [] as unknown[],
  emailSends: [] as unknown[],
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => state.posEmployee,
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async (
    _supabase: unknown,
    _role: string,
    _employeeId: string,
    permissionKey: string
  ) => {
    if (permissionKey === 'pos.jobs.manage') return state.manageGranted;
    return true;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '10.0.0.1',
}));

// Sentinels — endpoint must never send SMS / email / webhooks on this path.
vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async (...args: unknown[]) => {
    state.smsSends.push(args);
    return { ok: true };
  }),
  sendMarketingSms: vi.fn(async (...args: unknown[]) => {
    state.smsSends.push(args);
    return { ok: true };
  }),
}));

vi.mock('@/lib/utils/email', () => ({
  sendEmail: vi.fn(async (...args: unknown[]) => {
    state.emailSends.push(args);
    return { ok: true };
  }),
}));

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async (event: string, payload: unknown) => {
    state.webhookFires.push({ event, payload });
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildTableMock(table),
  }),
}));

function buildTableMock(table: string) {
  if (table === 'appointment_services') {
    return {
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) =>
          Promise.resolve({ data: state.existingServices, error: null }),
      }),
      delete: () => ({
        eq: (col: string, val: unknown) => {
          state.deletes.push({ table, filter: { col, val } });
          return Promise.resolve({ error: null });
        },
      }),
      insert: (rows: unknown) => {
        state.inserts.push({ table, rows });
        return Promise.resolve({ error: null });
      },
    };
  }

  if (table === 'appointments') {
    return {
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          single: async () => {
            if (!state.appointment) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: state.appointment, error: null };
          },
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          state.updates.push({ table, payload, filter: { col, val } });
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  if (table === 'services') {
    return {
      select: (_cols: string) => ({
        in: (_col: string, _vals: string[]) =>
          Promise.resolve({ data: state.serviceLookup, error: null }),
      }),
    };
  }

  if (table === 'jobs') {
    return {
      select: (_cols: string) => ({
        eq: (_col: string, _val: unknown) => ({
          maybeSingle: async () => ({ data: state.linkedJob, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          state.updates.push({ table, payload, filter: { col, val } });
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  return {
    select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
  };
}

// Imported AFTER mocks so binding picks up the mocked deps.
import { PUT } from '../route';

const APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SVC_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function req(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/pos/appointments/${APPT_ID}/services`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: APPT_ID }) };

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-pos-1',
    auth_user_id: 'auth-pos-1',
    role: 'detailer',
    first_name: 'Sam',
    last_name: 'Detailer',
    email: 'sam@example.com',
  };
  state.manageGranted = true;
  state.appointment = {
    id: APPT_ID,
    status: 'scheduled',
    subtotal: 200,
    total_amount: 200,
    tax_amount: 0,
    discount_amount: 0,
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
    coupon_discount: null,
    loyalty_discount: null,
    manual_discount_value: null,
  };
  state.existingServices = [
    { id: 'aps-1', service_id: SVC_A, price_at_booking: 200, tier_name: null },
  ];
  state.serviceLookup = [
    { id: SVC_A, name: 'Full Detail', is_active: true },
    { id: SVC_B, name: 'Wax', is_active: true },
  ];
  state.linkedJob = null;
  state.inserts = [];
  state.deletes = [];
  state.updates = [];
  state.auditCalls = [];
  state.smsSends = [];
  state.emailSends = [];
  state.webhookFires = [];
});

describe('PUT /api/pos/appointments/[id]/services', () => {
  // ---- Auth ----

  it('returns 401 when POS session header is missing / invalid', async () => {
    state.posEmployee = null;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  it('returns 403 when pos.jobs.manage is denied', async () => {
    state.manageGranted = false;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(403);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
  });

  // ---- Validation parity with admin endpoint ----

  it('returns 400 on invalid body (zero services)', async () => {
    const res = await PUT(req({ services: [] }), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid data');
  });

  it('returns 404 on missing appointment', async () => {
    state.appointment = null;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on completed appointment', async () => {
    state.appointment = { ...state.appointment!, status: 'completed' };
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on cancelled appointment', async () => {
    state.appointment = { ...state.appointment!, status: 'cancelled' };
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on no_show appointment (Layer 8d-bis audit finding #5)', async () => {
    // Lockstep with the load endpoint's guard at
    // /api/pos/appointments/[id]/load — refusing the same set so a
    // successful load implies a successful save on status.
    state.appointment = { ...state.appointment!, status: 'no_show' };
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a service id is unknown', async () => {
    state.serviceLookup = [];
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a service is inactive', async () => {
    state.serviceLookup = [{ id: SVC_A, name: 'Full Detail', is_active: false }];
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  // ---- Cascade behavior parity ----

  it('add service, no job linked: appointment_services + totals updated; no jobs update', async () => {
    state.linkedJob = null;
    const res = await PUT(
      req({
        services: [
          { service_id: SVC_A, price_at_booking: 200 },
          { service_id: SVC_B, price_at_booking: 75 },
        ],
      }),
      params
    );
    expect(res.status).toBe(200);
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(275);
    expect(apptUpd?.payload.total_amount).toBe(275);
    expect(state.updates.find((u) => u.table === 'jobs')).toBeUndefined();
  });

  it('add service, job linked: jobs.services cascade writes the new list', async () => {
    state.linkedJob = { id: 'job-1', services: [] };
    const res = await PUT(
      req({
        services: [
          { service_id: SVC_A, price_at_booking: 200 },
          { service_id: SVC_B, price_at_booking: 75 },
        ],
      }),
      params
    );
    expect(res.status).toBe(200);
    const jobUpd = state.updates.find((u) => u.table === 'jobs');
    expect(jobUpd?.payload.services).toEqual([
      { id: SVC_A, name: 'Full Detail', price: 200 },
      { id: SVC_B, name: 'Wax', price: 75 },
    ]);
    const body = await res.json();
    expect(body.cascaded_to_job_id).toBe('job-1');
  });

  // ---- Audit row tagged `source: 'pos'` ----

  it('writes an audit log entry tagged source=pos', async () => {
    await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].source).toBe('pos');
    expect(state.auditCalls[0].userId).toBe('auth-pos-1');
    expect(state.auditCalls[0].employeeName).toBe('Sam Detailer');
    const details = state.auditCalls[0].details as Record<string, unknown>;
    expect(details.notification_suppressed).toBe(true);
    expect(details.field).toBe('services');
  });

  // ---- Notification suppression ----

  it('never sends SMS / email / webhook on success path', async () => {
    state.linkedJob = { id: 'job-1', services: [] };
    await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(state.smsSends).toEqual([]);
    expect(state.emailSends).toEqual([]);
    expect(state.webhookFires).toEqual([]);
  });

  // ---- Modifier preservation (Item 15g Layer 15g-iii contract via shared helper) ----

  it('preserves coupon_discount + writes canonical combined discount_amount when services are edited', async () => {
    state.appointment = {
      ...state.appointment!,
      subtotal: 200,
      total_amount: 175,
      discount_amount: 25,
      coupon_discount: 25,
    };
    const res = await PUT(
      req({
        services: [
          { service_id: SVC_A, price_at_booking: 200 },
          { service_id: SVC_B, price_at_booking: 75 },
        ],
      }),
      params
    );
    expect(res.status).toBe(200);
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(275);
    // total = 275 - 25 (preserved coupon) = 250
    expect(apptUpd?.payload.total_amount).toBe(250);
    expect(apptUpd?.payload.discount_amount).toBe(25);
    // Per-modifier columns NOT touched by the cascade.
    expect(apptUpd?.payload.coupon_discount).toBeUndefined();
    expect(apptUpd?.payload.loyalty_discount).toBeUndefined();
    expect(apptUpd?.payload.manual_discount_value).toBeUndefined();
  });

  it('preserves all three modifiers (coupon + loyalty + manual) across edits', async () => {
    state.appointment = {
      ...state.appointment!,
      subtotal: 200,
      total_amount: 150,
      discount_amount: 50,
      coupon_discount: 25,
      loyalty_discount: 10,
      manual_discount_value: 15,
    };
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 300 }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(300);
    // total = 300 - (25 + 10 + 15) = 250
    expect(apptUpd?.payload.total_amount).toBe(250);
    expect(apptUpd?.payload.discount_amount).toBe(50);
  });

  // ---- Idempotency / repeat-call safety ----

  it('re-calling the endpoint with the same payload produces the same persisted state (no double-write)', async () => {
    // Two PUT calls in sequence. Each fully replaces appointment_services
    // from snapshot — the second call's "before" state equals the first
    // call's "after" state (in real DB; mock state is captured per-test).
    // We assert that the second call's update payload matches the first
    // call's (same totals, same insert payload shape).
    const payload = {
      services: [
        { service_id: SVC_A, price_at_booking: 200 },
        { service_id: SVC_B, price_at_booking: 75 },
      ],
    };
    const res1 = await PUT(req(payload), params);
    expect(res1.status).toBe(200);

    const firstApptUpdate = state.updates.find((u) => u.table === 'appointments');
    const firstInsertNew = state.inserts.find(
      (i) =>
        i.table === 'appointment_services' &&
        Array.isArray(i.rows) &&
        (i.rows as Array<{ id?: string }>)[0]?.id === undefined
    );
    expect(firstApptUpdate?.payload.subtotal).toBe(275);
    expect(firstInsertNew).toBeDefined();

    // Reset captured side effects; simulate the DB row reflecting the first
    // PUT's outcome by updating the existingServices snapshot.
    state.inserts = [];
    state.updates = [];
    state.auditCalls = [];
    state.existingServices = [
      { id: 'aps-new-1', service_id: SVC_A, price_at_booking: 200, tier_name: null },
      { id: 'aps-new-2', service_id: SVC_B, price_at_booking: 75, tier_name: null },
    ];

    const res2 = await PUT(req(payload), params);
    expect(res2.status).toBe(200);
    const secondApptUpdate = state.updates.find((u) => u.table === 'appointments');
    expect(secondApptUpdate?.payload.subtotal).toBe(275);
    expect(secondApptUpdate?.payload.total_amount).toBe(275);
    // Still exactly one audit row per call — no double-emit.
    expect(state.auditCalls).toHaveLength(1);
  });
});
