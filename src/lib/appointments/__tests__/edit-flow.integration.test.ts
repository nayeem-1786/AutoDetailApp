import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Item 15f Phase 1 Layer 8f — end-to-end edit-flow integration tests.
 *
 * Joins the three cross-layer surfaces of the edit-via-POS pivot:
 *
 *   1. **Load** — `GET /api/pos/{appointments,jobs}/[id]/{load,checkout-items}`
 *      returns a ticket-shaped payload.
 *   2. **Drain** — `buildTicketStateFromLoad` + `runEditModeDrain` hydrate
 *      `<TicketContext>` via `ENTER_EDIT_MODE` (Layer 8b).
 *   3. **Save** — `editAppointmentServices` writes services + modifiers back
 *      to the appointment row and cascades to `jobs.services` (Layer 8a + 8c).
 *
 * Each prior layer is unit-tested in isolation by its own test file. This
 * suite verifies the *joins* are correct — particularly the
 * Option G4 invariant (source=job's URL `id` is the JOB UUID, while
 * `ticket.sourceId` is the APPOINTMENT UUID resolved from the load response).
 *
 * Save-side mocking matches `service-edit.test.ts` — the same captured
 * mock-supabase pattern, so any drift between the integration and unit
 * tests is mechanical to spot.
 */

import {
  buildTicketStateFromLoad,
  runEditModeDrain,
  type LoadResponseData,
} from '../../../app/pos/hooks/use-edit-mode-drain';

// ---------------------------------------------------------------------------
// Shared mocks (drain side — posFetch + sonner)
// ---------------------------------------------------------------------------

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('../../../app/pos/lib/pos-fetch', () => ({
  posFetch: fetchMock,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Shared mocks (save side — audit + Supabase admin)
// ---------------------------------------------------------------------------

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

const saveState = {
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
    saveState.auditCalls.push(entry);
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
                if (!saveState.appointment) {
                  return { data: null, error: { message: 'not found' } };
                }
                return { data: saveState.appointment, error: null };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: unknown) => {
              saveState.updates.push({ table, payload });
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      if (table === 'appointment_services') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) =>
              Promise.resolve({ data: saveState.existingServices, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, _val: unknown) => {
              saveState.deletes.push({ table });
              return Promise.resolve({ error: null });
            },
          }),
          insert: (rows: unknown) => {
            saveState.inserts.push({ table, rows });
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === 'services') {
        return {
          select: (_cols: string) => ({
            in: (_col: string, _vals: string[]) =>
              Promise.resolve({ data: saveState.serviceLookup, error: null }),
          }),
        };
      }
      if (table === 'jobs') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: unknown) => ({
              maybeSingle: async () => ({ data: saveState.linkedJob, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: unknown) => {
              saveState.updates.push({ table, payload });
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
import { editAppointmentServices } from '../service-edit';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const APPT_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JOB_UUID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SVC_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SVC_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const ACTOR = {
  employeeId: 'emp-pos-1',
  authUserId: 'auth-pos-1',
  email: 'pos@example.com',
  name: 'Sam Detailer',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeLoadData(overrides: Partial<LoadResponseData> = {}): LoadResponseData {
  return {
    customer_id: 'cust-1',
    vehicle_id: 'veh-1',
    customer: {
      id: 'cust-1',
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+13105550000',
      email: 'jane@example.com',
      customer_type: null,
      tags: null,
    },
    vehicle: {
      id: 'veh-1',
      year: 2020,
      make: 'Honda',
      model: 'Civic',
      color: 'Blue',
      size_class: 'sedan',
    },
    items: [
      {
        item_type: 'service',
        service_id: SVC_A,
        item_name: 'Full Detail',
        quantity: 1,
        unit_price: 200,
        is_taxable: false,
        tier_name: 'sedan',
      },
    ],
    coupon_code: null,
    coupon_discount: null,
    loyalty_points_redeemed: null,
    loyalty_discount: null,
    manual_discount_value: null,
    manual_discount_label: null,
    deposit_amount: 0,
    deposit_date: null,
    status: 'scheduled',
    ...overrides,
  };
}

function resetSaveState(overrides: Partial<ApptRow> = {}) {
  saveState.appointment = {
    id: APPT_UUID,
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
    ...overrides,
  };
  saveState.existingServices = [
    { id: 'aps-1', service_id: SVC_A, price_at_booking: 200, tier_name: 'sedan' },
  ];
  saveState.serviceLookup = [
    { id: SVC_A, name: 'Full Detail', is_active: true },
    { id: SVC_B, name: 'Wax', is_active: true },
  ];
  saveState.linkedJob = null;
  saveState.inserts = [];
  saveState.updates = [];
  saveState.deletes = [];
  saveState.auditCalls = [];
}

beforeEach(() => {
  fetchMock.mockReset();
  resetSaveState();
});

// ---------------------------------------------------------------------------
// Source=appointment happy path
// ---------------------------------------------------------------------------

describe('edit-via-POS — source=appointment happy path (drain → save)', () => {
  it('round-trips: load endpoint → drain → ENTER_EDIT_MODE → cascade save with no drift', async () => {
    // Stage 1: load endpoint returns the appointment as a cart-shaped payload.
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: makeLoadData() }));

    // Stage 2: drain dispatches ENTER_EDIT_MODE with the captured sourceId.
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments',
      },
      dispatch
    );
    expect(result.ok).toBe(true);

    const enterCall = dispatch.mock.calls.find(
      (c) => c[0].type === 'ENTER_EDIT_MODE'
    );
    expect(enterCall).toBeTruthy();
    // For source=appointment, sourceId is the URL `id` directly.
    expect(enterCall![0].sourceId).toBe(APPT_UUID);

    // Stage 3: simulate Save Changes — POST through cascade helper.
    const saveResult = await editAppointmentServices(mockSupabase() as never, {
      appointmentId: enterCall![0].sourceId,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200, tier_name: 'sedan' }],
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: '10.0.0.1',
    });
    expect(saveResult.data).toBeDefined();

    // The cascade wrote totals back. Subtotal = 200 (unchanged service price).
    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.subtotal).toBe(200);
    expect(apptUpd?.payload.total_amount).toBe(200);
  });

  it('preserves modifier columns on a services-only edit (Layer 15g-iii)', async () => {
    // Appointment has all three modifiers persisted from quote conversion.
    resetSaveState({
      subtotal: 200,
      total_amount: 150,
      discount_amount: 50,
      coupon_code: 'SUMMER10',
      coupon_discount: 25,
      loyalty_points_redeemed: 200,
      loyalty_discount: 10,
      manual_discount_value: 15,
      manual_discount_label: 'VIP',
    });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: makeLoadData({
          coupon_code: 'SUMMER10',
          coupon_discount: 25,
          loyalty_points_redeemed: 200,
          loyalty_discount: 10,
          manual_discount_value: 15,
          manual_discount_label: 'VIP',
        }),
      })
    );
    // Coupon revalidate succeeds (full discount preserved).
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { id: 'cp-1', code: 'SUMMER10', total_discount: 25 },
      })
    );

    const dispatch = vi.fn();
    await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID,
        returnTo: '/admin/appointments',
      },
      dispatch
    );

    // Save services-only (no modifier fields in body). Per the modifier
    // preservation contract, the cascade reads existing modifier columns to
    // recompute the canonical combined discount_amount but NEVER writes the
    // per-modifier columns themselves.
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_UUID,
      body: {
        services: [
          { service_id: SVC_A, price_at_booking: 200 },
          { service_id: SVC_B, price_at_booking: 100 },
        ],
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });

    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    // Per-modifier columns NEVER appear in the services-only update.
    expect('coupon_code' in apptUpd!.payload).toBe(false);
    expect('coupon_discount' in apptUpd!.payload).toBe(false);
    expect('loyalty_points_redeemed' in apptUpd!.payload).toBe(false);
    expect('loyalty_discount' in apptUpd!.payload).toBe(false);
    expect('manual_discount_value' in apptUpd!.payload).toBe(false);
    expect('manual_discount_label' in apptUpd!.payload).toBe(false);

    // Canonical combined discount_amount = 25 + 10 + 15 = 50, written back.
    expect(apptUpd?.payload.discount_amount).toBe(50);
    // Subtotal = 200 + 100 = 300; total = 300 - 50 = 250.
    expect(apptUpd?.payload.subtotal).toBe(300);
    expect(apptUpd?.payload.total_amount).toBe(250);

    // Audit row stays at field='services' (no modifier payload supplied).
    const details = saveState.auditCalls[0].details as Record<string, unknown>;
    expect(details.field).toBe('services');
  });
});

// ---------------------------------------------------------------------------
// Source=job happy path (Option G4 invariant — URL.id ≠ sourceId)
// ---------------------------------------------------------------------------

describe('edit-via-POS — source=job happy path (Option G4: URL.id=JOB, sourceId=APPT)', () => {
  it('resolves sourceId from response.appointment_id; cascade hits appointment endpoint', async () => {
    // checkout-items endpoint returns the JOB's data PLUS the linked
    // appointment_id (the field Layer 8d-bis added).
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: makeLoadData({ appointment_id: APPT_UUID }),
      })
    );

    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'job',
        id: JOB_UUID, // URL carries the JOB UUID, not the appointment UUID.
        returnTo: '/pos/jobs?jobId=' + JOB_UUID,
      },
      dispatch
    );
    expect(result.ok).toBe(true);

    // checkout-items was hit (not appointments/load).
    expect(fetchMock.mock.calls[0][0]).toBe(
      `/api/pos/jobs/${JOB_UUID}/checkout-items`
    );

    const enterCall = dispatch.mock.calls.find(
      (c) => c[0].type === 'ENTER_EDIT_MODE'
    );
    // **The G4 core invariant**: ticket.sourceId is the APPOINTMENT UUID
    // (from response.appointment_id), NOT the JOB UUID from the URL. Layer
    // 8c's Save POSTs to `/api/pos/appointments/${sourceId}/services`, which
    // expects an appointment UUID — using the JOB UUID would 404 the cascade.
    expect(enterCall![0].sourceId).toBe(APPT_UUID);
    expect(enterCall![0].sourceId).not.toBe(JOB_UUID);

    // Save uses the resolved appointment UUID and cascades to the linked job.
    saveState.linkedJob = { id: JOB_UUID, services: [] };
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: enterCall![0].sourceId,
      body: {
        services: [
          { service_id: SVC_A, price_at_booking: 200, tier_name: 'sedan' },
          { service_id: SVC_B, price_at_booking: 100 },
        ],
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });

    const jobUpd = saveState.updates.find((u) => u.table === 'jobs');
    expect(jobUpd).toBeTruthy();
    expect(jobUpd?.payload.services).toEqual([
      { id: SVC_A, name: 'Full Detail', price: 200 },
      { id: SVC_B, name: 'Wax', price: 100 },
    ]);
  });

  it('refuses drain when source=job and response.appointment_id is null (legacy walk-in)', async () => {
    // Pre-Phase-0a walk-ins have NULL appointment_id. Layer 8d-bis defense
    // in depth — even if the click-site guard slips, the drain stops here
    // because the cascade endpoint hits /api/pos/appointments/<sourceId>
    // and an undefined sourceId would 404.
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: makeLoadData({ appointment_id: null }) })
    );

    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'job',
        id: JOB_UUID,
        returnTo: '/pos/jobs?jobId=' + JOB_UUID,
      },
      dispatch
    );
    expect(result.ok).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Modifier-only edit
// ---------------------------------------------------------------------------

describe('edit-via-POS — modifier-only edit (services unchanged)', () => {
  it('adds a coupon without changing the service list — totals recompute correctly', async () => {
    resetSaveState({
      subtotal: 200,
      total_amount: 200,
      discount_amount: 0,
    });

    // Save: identical services array + new coupon fields.
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_UUID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        coupon_code: 'NEW20',
        coupon_discount: 20,
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });

    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.coupon_code).toBe('NEW20');
    expect(apptUpd?.payload.coupon_discount).toBe(20);
    expect(apptUpd?.payload.subtotal).toBe(200);
    expect(apptUpd?.payload.total_amount).toBe(180);
    // Audit captures modifier diff.
    const details = saveState.auditCalls[0].details as Record<string, unknown>;
    expect(details.field).toBe('services_and_modifiers');
    expect(details.modifiers_after).toMatchObject({
      coupon_code: 'NEW20',
      coupon_discount: 20,
    });
  });

  it('clears coupon (null + null) — total reverts to subtotal', async () => {
    resetSaveState({
      subtotal: 200,
      total_amount: 180,
      discount_amount: 20,
      coupon_code: 'OLD20',
      coupon_discount: 20,
    });

    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_UUID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200 }],
        coupon_code: null,
        coupon_discount: null,
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });

    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    expect(apptUpd?.payload.coupon_code).toBeNull();
    expect(apptUpd?.payload.coupon_discount).toBeNull();
    expect(apptUpd?.payload.discount_amount).toBe(0);
    expect(apptUpd?.payload.total_amount).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Combined edit (services + modifiers atomic)
// ---------------------------------------------------------------------------

describe('edit-via-POS — combined edit (services + modifiers in one PUT)', () => {
  it('writes services AND modifier columns atomically; canonical combined discount reflects new modifiers', async () => {
    resetSaveState({
      subtotal: 200,
      total_amount: 200,
      discount_amount: 0,
    });

    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_UUID,
      body: {
        services: [
          { service_id: SVC_A, price_at_booking: 200 },
          { service_id: SVC_B, price_at_booking: 75 },
        ],
        loyalty_points_to_redeem: 100,
        loyalty_discount: 5,
        manual_discount_value: 10,
        manual_discount_label: 'VIP',
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });

    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    // services side
    expect(apptUpd?.payload.subtotal).toBe(275);
    // modifiers side
    expect(apptUpd?.payload.loyalty_points_redeemed).toBe(100);
    expect(apptUpd?.payload.loyalty_discount).toBe(5);
    expect(apptUpd?.payload.manual_discount_value).toBe(10);
    expect(apptUpd?.payload.manual_discount_label).toBe('VIP');
    // canonical combined = 5 + 10 = 15
    expect(apptUpd?.payload.discount_amount).toBe(15);
    // total = 275 - 15 = 260
    expect(apptUpd?.payload.total_amount).toBe(260);

    // Single audit row covering both diffs.
    expect(saveState.auditCalls).toHaveLength(1);
    const details = saveState.auditCalls[0].details as Record<string, unknown>;
    expect(details.field).toBe('services_and_modifiers');
  });
});

// ---------------------------------------------------------------------------
// All-services-removed save → INVALID_INPUT (cascade guard)
// ---------------------------------------------------------------------------

describe('edit-via-POS — all-services-removed save blocked', () => {
  it('rejects an empty services array with INVALID_INPUT (Zod min(1))', async () => {
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_UUID,
        body: { services: [] },
        actor: ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      httpStatus: 400,
    });
    // No appointment update, no jobs cascade, no audit row on the failure path.
    expect(saveState.updates).toHaveLength(0);
    expect(saveState.auditCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bogus UUID 404 → drain handles gracefully
// ---------------------------------------------------------------------------

describe('edit-via-POS — bogus UUID propagation', () => {
  it('load 404 → drain returns ok:false and dispatches nothing', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Appointment not found' }), {
        status: 404,
      })
    );
    const dispatch = vi.fn();
    const result = await runEditModeDrain(
      {
        source: 'appointment',
        id: APPT_UUID, // valid shape but missing in DB
        returnTo: '/admin/appointments',
      },
      dispatch
    );
    expect(result).toEqual({ ok: false, status: 404 });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('cascade NOT_FOUND on missing appointment → ServiceEditError(404)', async () => {
    saveState.appointment = null;
    await expect(
      editAppointmentServices(mockSupabase() as never, {
        appointmentId: APPT_UUID,
        body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
        actor: ACTOR,
        source: 'pos',
        ipAddress: null,
      })
    ).rejects.toMatchObject({ code: 'NOT_FOUND', httpStatus: 404 });
  });
});

// ---------------------------------------------------------------------------
// Status guard lockstep — load endpoint AND cascade refuse the same set
// ---------------------------------------------------------------------------

describe('edit-via-POS — status guard lockstep (load and save refuse same statuses)', () => {
  for (const status of ['completed', 'cancelled', 'no_show'] as const) {
    it(`cascade refuses '${status}' with INVALID_STATUS — lockstep with load endpoint`, async () => {
      // Note: load-endpoint route tests pin the 400 there; here we pin the
      // cascade side so a `git stash` of one without the other surfaces an
      // asymmetry test failure.
      saveState.appointment = { ...saveState.appointment!, status };
      await expect(
        editAppointmentServices(mockSupabase() as never, {
          appointmentId: APPT_UUID,
          body: { services: [{ service_id: SVC_A, price_at_booking: 200 }] },
          actor: ACTOR,
          source: 'pos',
          ipAddress: null,
        })
      ).rejects.toMatchObject({
        code: 'INVALID_STATUS',
        httpStatus: 400,
        message: expect.stringContaining(status),
      });
    });
  }
});

// ---------------------------------------------------------------------------
// buildTicketStateFromLoad ↔ cascade parity — pricing round-trips
// ---------------------------------------------------------------------------

describe('edit-via-POS — buildTicketStateFromLoad ↔ cascade pricing parity', () => {
  it('drain-side total math + cascade-side total math agree on identical inputs', async () => {
    // Load returns 1 service + 1 mobile_fee item synthesized server-side.
    const loadData = makeLoadData({
      items: [
        {
          item_type: 'service',
          service_id: SVC_A,
          item_name: 'Full Detail',
          quantity: 1,
          unit_price: 200,
          is_taxable: false,
          tier_name: 'sedan',
        },
        {
          item_type: 'mobile_fee',
          item_name: 'Torrance / Lomita',
          quantity: 1,
          unit_price: 30,
          is_taxable: false,
        },
      ],
      coupon_code: null,
    });

    const drained = buildTicketStateFromLoad(loadData);
    // Drain-side subtotal: 200 + 30 = 230.
    expect(drained.subtotal).toBe(230);
    expect(drained.total).toBe(230); // no discounts, no deposit, no prior

    // Cascade-side: same effective subtotal when mobile_surcharge is on the row.
    resetSaveState({
      subtotal: 230,
      total_amount: 230,
      is_mobile: true,
      mobile_surcharge: 30,
      mobile_zone_name_snapshot: 'Torrance / Lomita',
    });
    await editAppointmentServices(mockSupabase() as never, {
      appointmentId: APPT_UUID,
      body: {
        services: [{ service_id: SVC_A, price_at_booking: 200, tier_name: 'sedan' }],
      },
      actor: ACTOR,
      source: 'pos',
      ipAddress: null,
    });
    const apptUpd = saveState.updates.find((u) => u.table === 'appointments');
    // Cascade adds the appointment's stored mobile_surcharge back in (it
    // never round-trips through the services array — same as today).
    expect(apptUpd?.payload.subtotal).toBe(230);
    expect(apptUpd?.payload.total_amount).toBe(230);
  });
});
