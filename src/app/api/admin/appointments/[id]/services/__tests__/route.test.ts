import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Cascade test matrix for PUT /api/admin/appointments/[id]/services
 * (Item 15a, Wave 1.5):
 *
 *   - No job linked: only appointment_services + appointment totals updated
 *   - Job linked:    cascade extends to jobs.services JSONB
 *   - Permission denied: 403, no DB writes
 *   - Unauthenticated: 401
 *   - Completed/cancelled appointment: 400, no DB writes
 *   - Unknown service id: 400, no DB writes
 *   - Inactive service id: 400, no DB writes
 *   - Insert fails: snapshot restored, no totals update
 *   - Totals update fails: insert reversed, snapshot restored
 *   - Job services update fails: appointment totals reverted, snapshot restored
 *   - No SMS / email / webhook sent at any point (verified via sentinel mocks)
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
  employee: {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'a@b.com',
    first_name: 'A',
    last_name: 'B',
  } as null | {
    id: string;
    auth_user_id: string;
    email: string;
    first_name: string;
    last_name: string;
  },
  permissionDenied: false,
  appointment: null as null | ApptRow,
  existingServices: [] as ApptServiceRow[],
  serviceLookup: [] as ServiceLookupRow[],
  linkedJob: null as JobRow | null,

  // Failure injection
  failOnInsertNew: false,
  failOnTotalsUpdate: false,
  failOnJobServicesUpdate: false,

  // Captured side effects (for assertions)
  inserts: [] as Array<{ table: string; rows: unknown }>,
  deletes: [] as Array<{ table: string; filter: { col: string; val: unknown } }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; filter: { col: string; val: unknown } }>,
  auditCalls: [] as Array<Record<string, unknown>>,
  smsSends: [] as unknown[],
  emailSends: [] as unknown[],
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
      : null,
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
}));

// Sentinels: any code path that tries to send SMS, email, or fire a
// webhook will flip these arrays — assertions verify they stay empty.
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
  // Select chain — handles .select().eq().single() and
  // .select().eq().maybeSingle(), plus .select().in() lookup variant.
  const selectChain = () => ({
    select: (_cols: string) => ({
      eq: (col: string, val: unknown) => ({
        single: async () => {
          if (table === 'appointments') {
            if (!state.appointment) {
              return { data: null, error: { message: 'not found' } };
            }
            return { data: state.appointment, error: null };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => {
          if (table === 'jobs') {
            return { data: state.linkedJob, error: null };
          }
          return { data: null, error: null };
        },
        // .select().eq() for appointment_services (no .single)
        then: undefined as unknown,
      }),
      in: (_col: string, _vals: string[]) => {
        if (table === 'services') {
          return Promise.resolve({ data: state.serviceLookup, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
    }),
  });

  // For appointment_services .select() that returns a plain list keyed by
  // appointment_id we need to support `.select(...).eq(col, val)` ending the
  // chain (no .single).
  if (table === 'appointment_services') {
    return {
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) =>
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
        if (state.failOnInsertNew && Array.isArray(rows) && !('id' in (rows[0] ?? {}))) {
          // Distinguishes new-row insert (no id in payload) from rollback restore
          // (snapshot rows include id).
          return Promise.resolve({ error: { message: 'insert failed' } });
        }
        return Promise.resolve({ error: null });
      },
    };
  }

  if (table === 'appointments') {
    return {
      select: (_cols: string) => ({
        eq: (col: string, val: unknown) => ({
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
          if (state.failOnTotalsUpdate && 'subtotal' in payload) {
            return Promise.resolve({ error: { message: 'totals update failed' } });
          }
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
        eq: (col: string, val: unknown) => ({
          maybeSingle: async () => ({ data: state.linkedJob, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: (col: string, val: unknown) => {
          state.updates.push({ table, payload, filter: { col, val } });
          if (state.failOnJobServicesUpdate && 'services' in payload) {
            return Promise.resolve({ error: { message: 'job services update failed' } });
          }
          return Promise.resolve({ error: null });
        },
      }),
    };
  }

  return selectChain();
}

// Imported AFTER mocks so binding picks up the mocked deps.
import { PUT } from '../route';

const APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SVC_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_B = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function req(body: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/appointments/${APPT_ID}/services`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

const params = { params: Promise.resolve({ id: APPT_ID }) };

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'a@b.com',
    first_name: 'A',
    last_name: 'B',
  };
  state.permissionDenied = false;
  state.appointment = {
    id: APPT_ID,
    status: 'confirmed',
    subtotal: 200,
    total_amount: 200,
    tax_amount: 0,
    discount_amount: 0,
    is_mobile: false,
    mobile_surcharge: 0,
    mobile_zone_name_snapshot: null,
  };
  state.existingServices = [
    {
      id: 'aps-1',
      service_id: SVC_A,
      price_at_booking: 200,
      tier_name: null,
    },
  ];
  state.serviceLookup = [
    { id: SVC_A, name: 'Full Detail', is_active: true },
    { id: SVC_B, name: 'Wax', is_active: true },
  ];
  state.linkedJob = null;
  state.failOnInsertNew = false;
  state.failOnTotalsUpdate = false;
  state.failOnJobServicesUpdate = false;
  state.inserts = [];
  state.deletes = [];
  state.updates = [];
  state.auditCalls = [];
  state.smsSends = [];
  state.emailSends = [];
  state.webhookFires = [];
});

describe('PUT /api/admin/appointments/[id]/services', () => {
  it('returns 401 when unauthenticated', async () => {
    state.employee = null;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(401);
    expect(state.inserts).toHaveLength(0);
  });

  it('returns 403 when permission denied', async () => {
    state.permissionDenied = true;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(403);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it('returns 400 on invalid body', async () => {
    const res = await PUT(req({ services: [] }), params);
    expect(res.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it('returns 404 on missing appointment', async () => {
    state.appointment = null;
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on cancelled appointment', async () => {
    state.appointment = { ...state.appointment!, status: 'cancelled' };
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
  });

  it('returns 400 on completed appointment', async () => {
    state.appointment = { ...state.appointment!, status: 'completed' };
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a service id is unknown', async () => {
    state.serviceLookup = []; // no matches
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
    expect(state.inserts).toHaveLength(0);
    expect(state.deletes).toHaveLength(0);
  });

  it('returns 400 when a service is inactive', async () => {
    state.serviceLookup = [{ id: SVC_A, name: 'Full Detail', is_active: false }];
    const res = await PUT(
      req({ services: [{ service_id: SVC_A, price_at_booking: 200 }] }),
      params
    );
    expect(res.status).toBe(400);
    expect(state.deletes).toHaveLength(0);
  });

  it('add service, no job linked: only appointment_services + totals updated', async () => {
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
    expect(state.deletes.find((d) => d.table === 'appointment_services')).toBeDefined();
    const insertNew = state.inserts.find(
      (i) => i.table === 'appointment_services' && Array.isArray(i.rows) && (i.rows as unknown[]).length === 2
    );
    expect(insertNew).toBeDefined();
    // Totals updated to sum (275)
    const apptUpdate = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpdate?.payload.subtotal).toBe(275);
    expect(apptUpdate?.payload.total_amount).toBe(275);
    // Job services NOT updated because no linked job
    expect(state.updates.find((u) => u.table === 'jobs')).toBeUndefined();
  });

  it('add service, job linked: both appointment_services AND jobs.services updated', async () => {
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
    expect(jobUpd).toBeDefined();
    expect(jobUpd?.payload.services).toEqual([
      { id: SVC_A, name: 'Full Detail', price: 200 },
      { id: SVC_B, name: 'Wax', price: 75 },
    ]);
    const body = await res.json();
    expect(body.cascaded_to_job_id).toBe('job-1');
  });

  it('mobile appointment with linked job: jobs.services receives mobile-fee row', async () => {
    state.appointment = {
      ...state.appointment!,
      is_mobile: true,
      mobile_surcharge: 25,
      mobile_zone_name_snapshot: 'Zone A',
    };
    state.linkedJob = { id: 'job-1', services: [] };
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const jobUpd = state.updates.find((u) => u.table === 'jobs');
    expect(jobUpd?.payload.services).toEqual([
      { id: SVC_A, name: 'Full Detail', price: 200 },
      { id: null, name: 'Zone A', price: 25, is_mobile_fee: true },
    ]);
    // Subtotal = 200 + 25 mobile = 225
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(225);
  });

  it('remove service: delete old + insert smaller set + totals shrink', async () => {
    state.existingServices = [
      { id: 'aps-1', service_id: SVC_A, price_at_booking: 200, tier_name: null },
      { id: 'aps-2', service_id: SVC_B, price_at_booking: 75, tier_name: null },
    ];
    state.appointment = { ...state.appointment!, subtotal: 275, total_amount: 275 };
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(res.status).toBe(200);
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(200);
    expect(apptUpd?.payload.total_amount).toBe(200);
  });

  it('rolls back when appointment_services insert of new rows fails', async () => {
    state.failOnInsertNew = true;
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(res.status).toBe(500);
    // Insert of new rows attempted, then snapshot restored via a 2nd insert
    // containing the original rows (each carrying its `id`).
    const restoreInsert = state.inserts.find(
      (i) =>
        i.table === 'appointment_services' &&
        Array.isArray(i.rows) &&
        (i.rows as Array<{ id?: string }>)[0]?.id === 'aps-1'
    );
    expect(restoreInsert).toBeDefined();
    // Totals were NEVER updated
    expect(state.updates.find((u) => u.table === 'appointments')).toBeUndefined();
  });

  it('rolls back when appointment totals update fails', async () => {
    state.failOnTotalsUpdate = true;
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(res.status).toBe(500);
    // Snapshot inserts should appear: original aps-1 rebuilt after the new
    // rows were deleted on rollback.
    const restoreInsert = state.inserts.find(
      (i) =>
        i.table === 'appointment_services' &&
        Array.isArray(i.rows) &&
        (i.rows as Array<{ id?: string }>)[0]?.id === 'aps-1'
    );
    expect(restoreInsert).toBeDefined();
    // 2 deletes of appointment_services: initial purge + rollback purge.
    const deletes = state.deletes.filter((d) => d.table === 'appointment_services');
    expect(deletes.length).toBeGreaterThanOrEqual(2);
  });

  it('rolls back when jobs.services cascade update fails', async () => {
    state.linkedJob = { id: 'job-1', services: [] };
    state.failOnJobServicesUpdate = true;
    const res = await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(res.status).toBe(500);
    // Two appointment updates: one to set new totals, one to revert.
    const apptUpdates = state.updates.filter((u) => u.table === 'appointments');
    expect(apptUpdates.length).toBe(2);
    expect(apptUpdates[1].payload.subtotal).toBe(200); // original
    expect(apptUpdates[1].payload.total_amount).toBe(200);
    // Snapshot row restored.
    const restoreInsert = state.inserts.find(
      (i) =>
        i.table === 'appointment_services' &&
        Array.isArray(i.rows) &&
        (i.rows as Array<{ id?: string }>)[0]?.id === 'aps-1'
    );
    expect(restoreInsert).toBeDefined();
  });

  it('never sends SMS / email / webhook on the success path', async () => {
    state.linkedJob = { id: 'job-1', services: [] };
    await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(state.smsSends).toEqual([]);
    expect(state.emailSends).toEqual([]);
    expect(state.webhookFires).toEqual([]);
  });

  it('writes an audit log entry tagged notification_suppressed', async () => {
    await PUT(
      req({
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
      }),
      params
    );
    expect(state.auditCalls).toHaveLength(1);
    const details = state.auditCalls[0].details as Record<string, unknown>;
    expect(details.notification_suppressed).toBe(true);
    expect(details.field).toBe('services');
  });
});
