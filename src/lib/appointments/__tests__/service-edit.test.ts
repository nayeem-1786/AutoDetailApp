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
  coupon_code?: string | null;
  coupon_discount?: number | null;
  loyalty_points_redeemed?: number | null;
  loyalty_discount?: number | null;
  manual_discount_value?: number | null;
  manual_discount_label?: string | null;
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
    coupon_code: null,
    coupon_discount: null,
    loyalty_points_redeemed: null,
    loyalty_discount: null,
    manual_discount_value: null,
    manual_discount_label: null,
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

  it('throws INVALID_STATUS (400) when appointment is no_show (Layer 8d-bis audit #5)', async () => {
    // Lockstep with the load endpoint's guard at
    // /api/pos/appointments/[id]/load — refusing the same set so a
    // successful load implies a successful save on status.
    state.appointment = { ...state.appointment!, status: 'no_show' };
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({
      code: 'INVALID_STATUS',
      httpStatus: 400,
      message: expect.stringContaining('no_show'),
    });
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

// ---------------------------------------------------------------------------
// Item 15f Phase 1 Layer 8c — modifier-edit extension
// ---------------------------------------------------------------------------
// The cascade endpoint now accepts six OPTIONAL modifier fields. When
// provided (including with value `null`), they write to the appointment row;
// when omitted, Layer 15g-iii's preservation contract holds (existing
// columns untouched). Per `docs/dev/LOYALTY_REVERSIBILITY_AUDIT_2026-05-17.md`,
// pre-transaction modifier edits do NOT mutate customers.loyalty_points_balance,
// loyalty_ledger, or coupons.use_count — those are transaction-bound writers
// the cascade endpoint never touches.

describe('editAppointmentServices — Layer 8c modifier-edit extension', () => {
  it('writes coupon_code + coupon_discount when both provided', async () => {
    state.appointment = {
      ...state.appointment!,
      coupon_code: null,
      coupon_discount: null,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        coupon_code: 'SUMMER10',
        coupon_discount: 20,
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.coupon_code).toBe('SUMMER10');
    expect(apptUpd?.payload.coupon_discount).toBe(20);
    // totals reflect the new coupon: 200 - 20 = 180
    expect(apptUpd?.payload.total_amount).toBe(180);
    expect(apptUpd?.payload.discount_amount).toBe(20);
  });

  it('clears coupon when payload sends coupon_code=null + coupon_discount=null', async () => {
    state.appointment = {
      ...state.appointment!,
      coupon_code: 'SUMMER10',
      coupon_discount: 20,
      discount_amount: 20,
      total_amount: 180,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        coupon_code: null,
        coupon_discount: null,
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    // Null is explicitly written (operator removed the coupon)
    expect(apptUpd?.payload.coupon_code).toBeNull();
    expect(apptUpd?.payload.coupon_discount).toBeNull();
    // totals revert to subtotal (no discount applied)
    expect(apptUpd?.payload.total_amount).toBe(200);
    expect(apptUpd?.payload.discount_amount).toBe(0);
  });

  it('writes loyalty_points_redeemed + loyalty_discount on edit', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        loyalty_points_to_redeem: 50,
        loyalty_discount: 2.5,
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.loyalty_points_redeemed).toBe(50);
    expect(apptUpd?.payload.loyalty_discount).toBe(2.5);
    expect(apptUpd?.payload.total_amount).toBe(197.5);
  });

  it('maps loyalty null → 0 (column is NOT NULL DEFAULT 0)', async () => {
    state.appointment = {
      ...state.appointment!,
      loyalty_points_redeemed: 152,
      loyalty_discount: 7.6,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        loyalty_points_to_redeem: null,
        loyalty_discount: null,
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.loyalty_points_redeemed).toBe(0);
    expect(apptUpd?.payload.loyalty_discount).toBe(0);
  });

  it('writes manual_discount_value + manual_discount_label together', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        manual_discount_value: 15,
        manual_discount_label: 'VIP',
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.manual_discount_value).toBe(15);
    expect(apptUpd?.payload.manual_discount_label).toBe('VIP');
    expect(apptUpd?.payload.total_amount).toBe(185);
  });

  it('rejects manual_discount_value without label (coherence)', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: {
          services: [{ service_id: SVC_A, price_at_booking: 200 }],
          manual_discount_value: 15,
          manual_discount_label: null,
        },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', httpStatus: 400 });
  });

  it('rejects manual_discount_label without value (coherence)', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: {
          services: [{ service_id: SVC_A, price_at_booking: 200 }],
          manual_discount_value: null,
          manual_discount_label: 'VIP',
        },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', httpStatus: 400 });
  });

  it('rejects negative coupon_discount', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: {
          services: [{ service_id: SVC_A, price_at_booking: 200 }],
          coupon_discount: -10,
        },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', httpStatus: 400 });
  });

  it('rejects non-integer loyalty_points_to_redeem', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_ID,
        body: {
          services: [{ service_id: SVC_A, price_at_booking: 200 }],
          loyalty_points_to_redeem: 50.5,
        },
        actor: BASE_ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT', httpStatus: 400 });
  });

  it('services-only payload preserves existing modifier columns (15g-iii contract)', async () => {
    state.appointment = {
      ...state.appointment!,
      coupon_code: 'KEEP10',
      coupon_discount: 25,
      loyalty_points_redeemed: 50,
      loyalty_discount: 2.5,
      manual_discount_value: 5,
      manual_discount_label: 'VIP',
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 400 }] },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = state.updates.find((u) => u.table === 'appointments');
    // Modifier columns NEVER appear in the update payload when services-only.
    expect('coupon_code' in apptUpd!.payload).toBe(false);
    expect('coupon_discount' in apptUpd!.payload).toBe(false);
    expect('loyalty_points_redeemed' in apptUpd!.payload).toBe(false);
    expect('loyalty_discount' in apptUpd!.payload).toBe(false);
    expect('manual_discount_value' in apptUpd!.payload).toBe(false);
    expect('manual_discount_label' in apptUpd!.payload).toBe(false);
    // But the canonical combined discount_amount IS written (15g-iii).
    expect(apptUpd?.payload.discount_amount).toBe(32.5); // 25+2.5+5
  });

  it('audit details captures modifier diff when modifier fields provided', async () => {
    state.appointment = {
      ...state.appointment!,
      coupon_code: null,
      coupon_discount: null,
    };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        coupon_code: 'SUMMER10',
        coupon_discount: 20,
      },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const audit = state.auditCalls[0];
    expect(audit).toBeDefined();
    const details = audit.details as Record<string, unknown>;
    expect(details.field).toBe('services_and_modifiers');
    expect(details.modifiers_before).toMatchObject({ coupon_code: null, coupon_discount: null });
    expect(details.modifiers_after).toMatchObject({ coupon_code: 'SUMMER10', coupon_discount: 20 });
  });

  it('audit details has field="services" + NO modifier diff when payload is services-only', async () => {
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_ID,
      body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
      actor: BASE_ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const audit = state.auditCalls[0];
    const details = audit.details as Record<string, unknown>;
    expect(details.field).toBe('services');
    expect('modifiers_before' in details).toBe(false);
    expect('modifiers_after' in details).toBe(false);
  });
});

