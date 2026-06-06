import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Item 15e Phase 2A — tests for the combined POS PATCH /api/pos/appointments/[id].
// The GET on the same route is covered by get.test.ts; this file isolates PATCH
// (mirrors the per-method convention already used in this directory).
//
// Differences from the POS reschedule endpoint this PATCH is modelled on:
//  - per-field permission gating across THREE keys (reschedule/update_status/
//    add_notes), each independently denied → 403
//  - STATUS_TRANSITIONS enforced server-side (Decision 3)
//  - webhooks FIRE on confirmed/completed/rescheduled (Decision 2 — NOT
//    suppressed, unlike the reschedule/cancel POS endpoints)

const state = {
  posEmployee: {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  rescheduleGranted: true,
  statusGranted: true,
  notesGranted: true,
  appointment: null as null | {
    id: string;
    status: string;
    scheduled_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    employee_id: string | null;
    job_notes: string | null;
    internal_notes: string | null;
  },
  overlapping: [] as Array<{ id: string }>,
  appointmentUpdates: [] as Array<Record<string, unknown>>,
  jobUpdates: [] as Array<{ filter: string; payload: Record<string, unknown> }>,
  auditCalls: [] as Array<Record<string, unknown>>,
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
  // Session 1.5 — cascade integration test surface.
  linkedJob: null as null | { id: string },
  cascadeCalls: [] as Array<{ appointmentId: string; options: Record<string, unknown> }>,
  cascadeResult: { ok: true, httpStatus: 200, data: { jobId: 'job-1' } } as Record<string, unknown>,
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
    if (permissionKey === 'appointments.reschedule') return state.rescheduleGranted;
    if (permissionKey === 'appointments.update_status') return state.statusGranted;
    if (permissionKey === 'appointments.add_notes') return state.notesGranted;
    return true;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
  buildChangeDetails: (
    current: Record<string, unknown>,
    next: Record<string, unknown>,
    fields: string[]
  ) => {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      if (next[f] !== undefined && current[f] !== next[f]) {
        changes[f] = { from: current[f], to: next[f] };
      }
    }
    return { changes };
  },
}));

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async (event: string, payload: unknown) => {
    state.webhookFires.push({ event, payload });
  }),
}));

vi.mock('@/lib/appointments/lifecycle-sync', () => ({
  // Session 1.5 — cascade is the canonical seam; tests assert on call args +
  // honor the configurable result so the PATCH error-propagation path can be
  // exercised without standing up the full executor.
  executeUnMaterialize: vi.fn(
    async (_supabase: unknown, appointmentId: string, options: Record<string, unknown>) => {
      state.cascadeCalls.push({ appointmentId, options });
      return state.cascadeResult;
    }
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: (cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => {
                if (!state.appointment) {
                  return { data: null, error: { message: 'not found' } };
                }
                if (cols.includes('customer:customers')) {
                  // The post-update reselect with relations.
                  return {
                    data: {
                      ...state.appointment,
                      customer: {
                        id: 'cust-1',
                        first_name: 'C',
                        last_name: 'X',
                        phone: '+13105551212',
                        email: null,
                      },
                      vehicle: null,
                      employee: state.appointment.employee_id
                        ? {
                            id: state.appointment.employee_id,
                            first_name: 'D',
                            last_name: 'E',
                            role: 'detailer',
                          }
                        : null,
                      appointment_services: [],
                    },
                    error: null,
                  };
                }
                return { data: state.appointment, error: null };
              },
              // Overlap query: .eq('scheduled_date').neq('id').neq('status').lt().gt().limit()
              neq: (_c1: string, _v1: string) => ({
                neq: (_c2: string, _v2: string) => ({
                  lt: (_c3: string, _v3: string) => ({
                    gt: (_c4: string, _v4: string) => ({
                      limit: (_n: number) =>
                        Promise.resolve({ data: state.overlapping, error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, _val: string) => {
              state.appointmentUpdates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'jobs') {
        return {
          // Session 1.5 — the linked-job lookup before invoking cascade.
          // Returns the configured `linkedJob` (or null) for the maybeSingle()
          // path; falls through to the existing update path for the
          // assigned-staff sync the PATCH does on employee_id change.
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              maybeSingle: async () => ({ data: state.linkedJob, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, val: string) => {
              state.jobUpdates.push({ filter: val, payload });
              return { error: null };
            },
          }),
        };
      }
      return {};
    },
  }),
}));

import { PATCH } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/pos/appointments/appt-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'appt-1' });

beforeEach(() => {
  state.posEmployee = {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'cashier',
    first_name: 'Pat',
    last_name: 'Cashier',
    email: 'pat@example.com',
  };
  state.rescheduleGranted = true;
  state.statusGranted = true;
  state.notesGranted = true;
  state.appointment = {
    id: 'appt-1',
    status: 'confirmed',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    employee_id: null,
    job_notes: null,
    internal_notes: null,
  };
  state.overlapping = [];
  state.appointmentUpdates = [];
  state.jobUpdates = [];
  state.auditCalls = [];
  state.webhookFires = [];
  state.linkedJob = null;
  state.cascadeCalls = [];
  state.cascadeResult = { ok: true, httpStatus: 200, data: { jobId: 'job-1' } };
});

describe('PATCH /api/pos/appointments/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(401);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 on invalid body (bad status enum)', async () => {
    const res = await PATCH(makeReq({ status: 'not_a_status' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 when no fields supplied', async () => {
    const res = await PATCH(makeReq({}), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 403 when status change but update_status denied', async () => {
    state.statusGranted = false;
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 403 when reschedule fields but reschedule denied', async () => {
    state.rescheduleGranted = false;
    const res = await PATCH(
      makeReq({ scheduled_start_time: '12:00', scheduled_end_time: '13:00' }),
      { params }
    );
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 403 when notes change but add_notes denied', async () => {
    state.notesGranted = false;
    const res = await PATCH(makeReq({ job_notes: 'hi' }), { params });
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 404 when appointment not found', async () => {
    state.appointment = null;
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(404);
  });

  it('rejects an invalid status transition (completed → pending)', async () => {
    state.appointment!.status = 'completed';
    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
    // Terminal state → no webhook fired.
    expect(state.webhookFires).toHaveLength(0);
  });

  // Session 1.4 — the two SAFE transitions opened per AC-5 (consequence map
  // d3671c82 Target E.1). Both carry zero PATCH-side effects beyond the
  // universal status UPDATE + audit row — no webhook, no cron flip that
  // requires compensating logic.
  it('accepts pending → in_progress (Session 1.4 SAFE transition) with no webhook', async () => {
    state.appointment!.status = 'pending';
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('in_progress');
    // No appointment_in_progress webhook exists in the WebhookEvent union.
    expect(state.webhookFires).toHaveLength(0);
  });

  it('accepts in_progress → no_show (Session 1.4 SAFE transition) with no webhook', async () => {
    state.appointment!.status = 'in_progress';
    const res = await PATCH(makeReq({ status: 'no_show' }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('no_show');
    // appointment_no_show is not in the WebhookEvent union → no fire.
    expect(state.webhookFires).toHaveLength(0);
  });

  it('accepts a valid status transition (confirmed → in_progress) with no confirmed/completed webhook', async () => {
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('in_progress');
    // in_progress is neither confirmed nor completed → no webhook.
    expect(state.webhookFires).toHaveLength(0);
  });

  it('fires appointment_confirmed on pending → confirmed', async () => {
    state.appointment!.status = 'pending';
    const res = await PATCH(makeReq({ status: 'confirmed' }), { params });
    expect(res.status).toBe(200);
    expect(state.webhookFires).toHaveLength(1);
    expect(state.webhookFires[0].event).toBe('appointment_confirmed');
  });

  it('fires appointment_completed on in_progress → completed', async () => {
    state.appointment!.status = 'in_progress';
    const res = await PATCH(makeReq({ status: 'completed' }), { params });
    expect(res.status).toBe(200);
    expect(state.webhookFires).toHaveLength(1);
    expect(state.webhookFires[0].event).toBe('appointment_completed');
  });

  it('returns 409 when the new slot overlaps another appointment', async () => {
    state.overlapping = [{ id: 'other-1' }];
    const res = await PATCH(
      makeReq({ scheduled_start_time: '12:00', scheduled_end_time: '13:00' }),
      { params }
    );
    expect(res.status).toBe(409);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('fires appointment_rescheduled on a date/time change', async () => {
    const res = await PATCH(
      makeReq({
        scheduled_date: '2026-05-16',
        scheduled_start_time: '14:00',
        scheduled_end_time: '15:00',
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(
      state.webhookFires.some((w) => w.event === 'appointment_rescheduled')
    ).toBe(true);
  });

  it('updates notes only (200) without firing any webhook', async () => {
    const res = await PATCH(
      makeReq({ job_notes: 'wax on', internal_notes: 'vip' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].job_notes).toBe('wax on');
    expect(state.appointmentUpdates[0].internal_notes).toBe('vip');
    expect(state.webhookFires).toHaveLength(0);
  });

  it('returns the full joined PosAppointment shape and logs a pos audit row', async () => {
    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe('appt-1');
    expect(json.data.customer).toBeDefined();
    expect(json.data).toHaveProperty('appointment_services');
    expect(state.auditCalls).toHaveLength(1);
    expect(state.auditCalls[0].source).toBe('pos');
  });

  it('reassigns detailer and syncs jobs.assigned_staff_id', async () => {
    const newDetailerId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const res = await PATCH(makeReq({ employee_id: newDetailerId }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates[0].employee_id).toBe(newDetailerId);
    expect(state.jobUpdates).toHaveLength(1);
    expect(state.jobUpdates[0].payload.assigned_staff_id).toBe(newDetailerId);
  });

  it('clears employee assignment when employee_id is empty string', async () => {
    state.appointment!.employee_id = 'old-emp';
    const res = await PATCH(makeReq({ employee_id: '' }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates[0].employee_id).toBeNull();
    expect(state.jobUpdates[0].payload.assigned_staff_id).toBeNull();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Session 1.5 — un-materialize cascade for backward reverts. The 2 with-
  // cascade transitions per AC-5 (`confirmed → pending` + `in_progress →
  // pending`). The map opens these in the same commit; the cascade is invoked
  // by PATCH when a job has already been materialized for the appointment.
  // Tests pin the wiring (cascade IS called, with correct actor/source), the
  // skip path (no linked job → no cascade), and error propagation.
  // ─────────────────────────────────────────────────────────────────────────

  it('Session 1.5: confirmed → pending with active job invokes executeUnMaterialize cascade', async () => {
    state.appointment!.status = 'confirmed';
    state.linkedJob = { id: 'job-1' };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(200);

    // Cascade was invoked with the appointment id + pos source label.
    expect(state.cascadeCalls).toHaveLength(1);
    expect(state.cascadeCalls[0].appointmentId).toBe('appt-1');
    expect(state.cascadeCalls[0].options.source).toBe('pos');
    expect((state.cascadeCalls[0].options.actor as Record<string, unknown>).userEmail).toBe('pat@example.com');

    // PATCH UPDATE must NOT include `status` — cascade owned that write
    // (avoiding the double-write per the in-source comment).
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBeUndefined();

    // Backward-revert to `pending` does NOT fire `appointment_confirmed` or
    // `appointment_completed` — neither branch matches the target status.
    expect(state.webhookFires).toHaveLength(0);

    // Audit still records the status change via the synthetic payload.
    expect(state.auditCalls).toHaveLength(1);
    const audit = state.auditCalls[0];
    const changes = (audit.details as { changes: Record<string, { from: unknown; to: unknown }> }).changes;
    expect(changes.status).toEqual({ from: 'confirmed', to: 'pending' });
  });

  it('Session 1.5: in_progress → pending with active job invokes cascade', async () => {
    state.appointment!.status = 'in_progress';
    state.linkedJob = { id: 'job-2' };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(200);

    expect(state.cascadeCalls).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBeUndefined();
    expect(state.webhookFires).toHaveLength(0);
  });

  it('Session 1.5: confirmed → pending WITHOUT active job is a plain status flip (no cascade)', async () => {
    state.appointment!.status = 'confirmed';
    state.linkedJob = null;

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(200);

    // No cascade — appointment never materialized, no job to delete.
    expect(state.cascadeCalls).toHaveLength(0);
    // Status flip went through the regular PATCH UPDATE path.
    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('pending');
  });

  it('Session 1.5: cascade 422 confirm_required propagates to PATCH caller', async () => {
    state.appointment!.status = 'in_progress';
    state.linkedJob = { id: 'job-3' };
    state.cascadeResult = {
      ok: false,
      httpStatus: 422,
      error: 'confirm_required',
      data: { jobId: 'job-3', confirmRequired: true, photoCount: 0 },
    };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('confirm_required');

    // Cascade fired, but PATCH did NOT proceed past the error.
    expect(state.cascadeCalls).toHaveLength(1);
    expect(state.appointmentUpdates).toHaveLength(0);
    expect(state.auditCalls).toHaveLength(0);
  });

  it('Session 1.5: cascade 409 transaction_linked propagates to PATCH caller', async () => {
    state.appointment!.status = 'confirmed';
    state.linkedJob = { id: 'job-4' };
    state.cascadeResult = { ok: false, httpStatus: 409, error: 'transaction_linked' };

    const res = await PATCH(makeReq({ status: 'pending' }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('transaction_linked');
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('Session 1.5: backward-revert is NOT triggered for non-pending targets', async () => {
    // confirmed → in_progress is a FORWARD transition (opened in Session 1.4
    // semantics — already valid pre-1.5). The cascade must NOT fire.
    state.appointment!.status = 'confirmed';
    state.linkedJob = { id: 'job-5' };

    const res = await PATCH(makeReq({ status: 'in_progress' }), { params });
    expect(res.status).toBe(200);

    expect(state.cascadeCalls).toHaveLength(0);
    expect(state.appointmentUpdates[0].status).toBe('in_progress');
  });

  it('Session 1.5: pending → cancelled is NOT a backward-revert (cancel is a different axis)', async () => {
    // `cancelled` is not ranked in APPT_LIFECYCLE_RANK and is not in the
    // backward-revert set. Cascade must not fire.
    state.appointment!.status = 'pending';
    state.linkedJob = { id: 'job-6' };

    const res = await PATCH(makeReq({ status: 'cancelled' }), { params });
    expect(res.status).toBe(200);

    expect(state.cascadeCalls).toHaveLength(0);
    expect(state.appointmentUpdates[0].status).toBe('cancelled');
  });
});
