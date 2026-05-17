import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Item 15f Phase 1 Layer 8a — pure-helper tests for
 * `editAppointmentServices` in `src/lib/appointments/service-edit.ts`.
 *
 * Route-level tests
 * (`src/app/api/admin/appointments/[id]/services/__tests__/route.test.ts`
 * + `src/app/api/pos/appointments/[id]/services/__tests__/route.test.ts`)
 * exercise the full HTTP path through both auth surfaces. This file pins
 * the helper's contract directly:
 *
 *   - Structured `ServiceEditError` with code + httpStatus per failure mode
 *   - Input validation (Zod) preserves Item 15a's schema
 *   - `source` discriminator threads to the audit row unchanged
 *   - Modifier preservation contract (Item 15g Layer 15g-iii) holds at the
 *     helper level — the per-modifier columns are read + the canonical
 *     combined `discount_amount` is written, but the per-modifier columns
 *     themselves are NEVER written by the cascade
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

const state = {
  appointment: null as null | ApptRow,
  existingServices: [] as Array<{
    id: string;
    service_id: string;
    price_at_booking: number;
    tier_name: string | null;
  }>,
  serviceLookup: [] as Array<{ id: string; name: string; is_active: boolean }>,
  linkedJob: null as null | { id: string; services: unknown },
  inserts: [] as Array<{ table: string; rows: unknown }>,
  updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  deletes: [] as Array<{ table: string }>,
  auditCalls: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
}));

function mockSupabase() {
  return {
    from(table: string) {
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
            eq: (_col: string, _val: unknown) => {
              state.updates.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'appointment_services') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) =>
              Promise.resolve({ data: state.existingServices, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, _val: unknown) => {
              state.deletes.push({ table });
              return Promise.resolve({ error: null });
            },
          }),
          insert: (rows: unknown) => {
            state.inserts.push({ table, rows });
            return Promise.resolve({ error: null });
          },
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
            eq: (_col: string, _val: unknown) => {
              state.updates.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

// Imported AFTER mocks so binding picks up the mocked deps.
import {
  editAppointmentServices,
  ServiceEditError,
} from '../service-edit';

const APPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SVC_A = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const BASE_ACTOR = {
  employeeId: 'emp-1',
  authUserId: 'auth-1',
  email: 'a@b.com',
  name: 'A B',
};

beforeEach(() => {
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
  ];
  state.linkedJob = null;
  state.inserts = [];
  state.updates = [];
  state.deletes = [];
  state.auditCalls = [];
});

describe('editAppointmentServices — structured error contract', () => {
  it('throws INVALID_INPUT (400) on empty services array with Zod details', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: '127.0.0.1',
      })
    ).rejects.toMatchObject({
      name: 'ServiceEditError',
      code: 'INVALID_INPUT',
      httpStatus: 400,
    });
  });

  it('throws INVALID_INPUT (400) with Zod flatten() details on shape violation', async () => {
    try {
      await editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: 'not-a-uuid', price_at_booking: -5 }] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: '127.0.0.1',
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ServiceEditError);
      const e = err as ServiceEditError;
      expect(e.code).toBe('INVALID_INPUT');
      expect(e.details).toBeDefined();
    }
  });

  it('throws NOT_FOUND (404) when appointment is missing', async () => {
    state.appointment = null;
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
  });

  it('throws INVALID_STATUS (400) when appointment is completed', async () => {
    state.appointment = { ...state.appointment!, status: 'completed' };
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: null,
      })
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      httpStatus: 400,
      message: expect.stringContaining('completed'),
    });
  });

  it('throws INVALID_STATUS (400) when appointment is cancelled', async () => {
    state.appointment = { ...state.appointment!, status: 'cancelled' };
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATUS', httpStatus: 400 });
  });

  it('throws UNKNOWN_SERVICE (400) when a service id is not in the lookup', async () => {
    state.serviceLookup = [];
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'UNKNOWN_SERVICE', httpStatus: 400 });
  });

  it('throws INACTIVE_SERVICE (400) when a service is marked inactive', async () => {
    state.serviceLookup = [{ id: SVC_A, name: 'Full Detail', is_active: false }];
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'admin',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INACTIVE_SERVICE', httpStatus: 400 });
  });
});

describe('editAppointmentServices — source discriminator', () => {
  it('threads source="admin" into the audit row', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: BASE_ACTOR,
      source: 'admin',
      ipAddress: '127.0.0.1',
    });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].source).toBe('admin');
  });

  it('threads source="pos" into the audit row', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: { ...BASE_ACTOR, employeeId: 'emp-pos-1' },
      source: 'pos',
      ipAddress: '10.0.0.1',
    });
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].source).toBe('pos');
  });

  it('threads ipAddress="" when null is supplied (audit-row contract)', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    expect(state.auditCalls[0].ipAddress).toBe('');
  });
});

describe('editAppointmentServices — return shape', () => {
  it('returns { data, cascadedToJobId: null } when no job is linked', async () => {
    const result = await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: BASE_ACTOR,
      source: 'admin',
      ipAddress: null,
    });
    expect(result.cascadedToJobId).toBeNull();
    expect(result.data).toBeDefined();
  });

  it('returns { data, cascadedToJobId: <id> } when a job is linked', async () => {
    state.linkedJob = { id: 'job-1', services: [] };
    const result = await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: BASE_ACTOR,
      source: 'admin',
      ipAddress: null,
    });
    expect(result.cascadedToJobId).toBe('job-1');
  });
});

describe('editAppointmentServices — modifier preservation contract (Item 15g Layer 15g-iii)', () => {
  it('writes the canonical combined discount_amount but does NOT touch per-modifier columns', async () => {
    state.appointment = {
      ...state.appointment!,
      subtotal: 200,
      total_amount: 150,
      discount_amount: 50,
      coupon_discount: 25,
      loyalty_discount: 10,
      manual_discount_value: 15,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 400 }] },
      actor: BASE_ACTOR,
      source: 'admin',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(400);
    // total = 400 - (25 + 10 + 15) = 350
    expect(apptUpd?.payload.total_amount).toBe(350);
    // canonical combined discount written back
    expect(apptUpd?.payload.discount_amount).toBe(50);
    // per-modifier columns NEVER appear in the update payload
    expect('coupon_discount' in apptUpd!.payload).toBe(false);
    expect('loyalty_discount' in apptUpd!.payload).toBe(false);
    expect('manual_discount_value' in apptUpd!.payload).toBe(false);
  });

  it('falls back to legacy combined discount_amount when per-modifier columns are null', async () => {
    state.appointment = {
      ...state.appointment!,
      subtotal: 200,
      total_amount: 180,
      discount_amount: 20,
      coupon_discount: null,
      loyalty_discount: null,
      manual_discount_value: null,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 300 }] },
      actor: BASE_ACTOR,
      source: 'admin',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(300);
    // total = 300 - 20 (legacy combined) = 280
    expect(apptUpd?.payload.total_amount).toBe(280);
    expect(apptUpd?.payload.discount_amount).toBe(20);
  });
});
