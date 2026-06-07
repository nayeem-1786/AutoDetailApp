import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// State shared across mocks so individual tests can rewire behavior.
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
  appointment: null as null | {
    id: string;
    status: string;
    scheduled_date: string;
    scheduled_start_time: string;
    scheduled_end_time: string;
    employee_id: string | null;
  },
  overlapping: [] as Array<{ id: string }>,
  appointmentUpdates: [] as Array<Record<string, unknown>>,
  jobUpdates: [] as Array<{ filter: string; payload: Record<string, unknown> }>,
  auditCalls: [] as Array<Record<string, unknown>>,
  smsSends: [] as unknown[],
  emailSends: [] as unknown[],
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
    return true;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
  buildChangeDetails: (current: Record<string, unknown>, next: Record<string, unknown>, fields: string[]) => {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const f of fields) {
      if (next[f] !== undefined && current[f] !== next[f]) {
        changes[f] = { from: current[f], to: next[f] };
      }
    }
    return { changes };
  },
}));

// Sentinels — if any code path tries to send SMS, email, or fire a webhook, the
// test's notification-suppression assertion will fail. Mocked at module scope.
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: (cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => {
                if (!state.appointment) return { data: null, error: { message: 'not found' } };
                if (cols.includes('customer:customers')) {
                  // The post-update reselect with relations.
                  return {
                    data: {
                      ...state.appointment,
                      customer: { id: 'cust-1', first_name: 'C', last_name: 'X', phone: '+13105551212', email: null },
                      vehicle: null,
                      employee: state.appointment.employee_id
                        ? { id: state.appointment.employee_id, first_name: 'D', last_name: 'E', role: 'detailer' }
                        : null,
                      appointment_services: [],
                    },
                    error: null,
                  };
                }
                return { data: state.appointment, error: null };
              },
              neq: (_neqCol: string, _neqVal: string) => ({
                neq: (_neqCol2: string, _neqVal2: string) => ({
                  lt: (_ltCol: string, _ltVal: string) => ({
                    gt: (_gtCol: string, _gtVal: string) => ({
                      limit: (_n: number) => Promise.resolve({ data: state.overlapping, error: null }),
                    }),
                  }),
                }),
              }),
            }),
            // Overlap query path: .from('appointments').select('id').eq('scheduled_date', ...).neq(...)
            // Already handled above via the `eq().neq().neq().lt().gt().limit()` chain.
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
  return new NextRequest(
    'http://localhost/api/pos/appointments/appt-1/reschedule',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
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
  state.appointment = {
    id: 'appt-1',
    status: 'confirmed',
    scheduled_date: '2026-05-15',
    scheduled_start_time: '10:00:00',
    scheduled_end_time: '11:00:00',
    employee_id: null,
  };
  state.overlapping = [];
  state.appointmentUpdates = [];
  state.jobUpdates = [];
  state.auditCalls = [];
  state.smsSends = [];
  state.emailSends = [];
});

describe('PATCH /api/pos/appointments/[id]/reschedule', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await PATCH(makeReq({ scheduled_start_time: '12:00' }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 403 when reschedule permission denied', async () => {
    state.rescheduleGranted = false;
    const res = await PATCH(
      makeReq({ scheduled_start_time: '12:00', scheduled_end_time: '13:00' }),
      { params }
    );
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 when no fields supplied', async () => {
    const res = await PATCH(makeReq({}), { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid time format', async () => {
    const res = await PATCH(
      makeReq({ scheduled_start_time: '25:99' }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when end time ≤ start time', async () => {
    const res = await PATCH(
      makeReq({
        scheduled_start_time: '13:00',
        scheduled_end_time: '12:00',
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when appointment is completed', async () => {
    state.appointment!.status = 'completed';
    const res = await PATCH(
      makeReq({ scheduled_start_time: '12:00', scheduled_end_time: '13:00' }),
      { params }
    );
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
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

  it('updates date/time and does NOT send SMS, email, or fire webhook', async () => {
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
    const update = state.appointmentUpdates[0];
    expect(update.scheduled_date).toBe('2026-05-16');
    expect(update.scheduled_start_time).toBe('14:00');
    expect(update.scheduled_end_time).toBe('15:00');

    // Notification-suppression invariant.
    expect(state.smsSends).toHaveLength(0);
    expect(state.emailSends).toHaveLength(0);

    // Audit log records suppression for traceability.
    expect(state.auditCalls).toHaveLength(1);
    const audit = state.auditCalls[0];
    expect((audit.details as Record<string, unknown>).notification_suppressed).toBe(true);
    expect(audit.source).toBe('pos');
  });

  it('reassigns detailer and syncs jobs.assigned_staff_id', async () => {
    // Valid v4 UUID — newer zod requires version-specific format.
    const newDetailerId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const res = await PATCH(makeReq({ employee_id: newDetailerId }), { params });
    expect(res.status).toBe(200);

    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].employee_id).toBe(newDetailerId);

    expect(state.jobUpdates).toHaveLength(1);
    expect(state.jobUpdates[0].payload.assigned_staff_id).toBe(newDetailerId);

    // Notification-suppression invariant on detailer-only changes too.
    expect(state.smsSends).toHaveLength(0);
    expect(state.emailSends).toHaveLength(0);
  });

  it('clears employee assignment when employee_id is empty string', async () => {
    state.appointment!.employee_id = 'old-emp';
    const res = await PATCH(makeReq({ employee_id: '' }), { params });
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates[0].employee_id).toBeNull();
    expect(state.jobUpdates[0].payload.assigned_staff_id).toBeNull();
  });
});
