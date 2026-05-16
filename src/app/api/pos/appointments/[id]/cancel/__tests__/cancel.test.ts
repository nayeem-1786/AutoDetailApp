import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Shared mock state — individual tests rewire behavior per scenario.
const state = {
  posEmployee: {
    employee_id: 'emp-uuid-1',
    auth_user_id: 'auth-uuid-1',
    role: 'admin',
    first_name: 'Pat',
    last_name: 'Admin',
    email: 'pat@example.com',
  } as null | {
    employee_id: string;
    auth_user_id: string;
    role: string;
    first_name: string;
    last_name: string;
    email: string;
  },
  cancelGranted: true,
  appointment: null as null | {
    id: string;
    status: string;
  },
  appointmentUpdates: [] as Array<Record<string, unknown>>,
  auditCalls: [] as Array<Record<string, unknown>>,
  smsSends: [] as unknown[],
  emailSends: [] as unknown[],
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
  cancellationNotificationCalls: [] as Array<{ id: string; reason: string | undefined }>,
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
    if (permissionKey === 'appointments.cancel') return state.cancelGranted;
    return true;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
}));

// Sentinels — three customer-facing notification channels. Each is module-
// scope mocked so the suite can assert that all three remain untouched on
// the suppression path.
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

vi.mock('@/lib/email/send-cancellation-email', () => ({
  sendCancellationNotifications: vi.fn(async (id: string, reason: string | undefined) => {
    state.cancellationNotificationCalls.push({ id, reason });
    return { emailSent: true, smsSent: true, usedTemplate: true };
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
                  return {
                    data: {
                      ...state.appointment,
                      cancellation_reason: 'reason here',
                      customer: { id: 'cust-1', first_name: 'C', last_name: 'X', phone: '+13105551212', email: null },
                      vehicle: null,
                      employee: null,
                      appointment_services: [],
                    },
                    error: null,
                  };
                }
                return { data: state.appointment, error: null };
              },
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
      return {};
    },
  }),
}));

import { POST } from '../route';

function makeReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest(
    'http://localhost/api/pos/appointments/appt-1/cancel',
    {
      method: 'POST',
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
    role: 'admin',
    first_name: 'Pat',
    last_name: 'Admin',
    email: 'pat@example.com',
  };
  state.cancelGranted = true;
  state.appointment = {
    id: 'appt-1',
    status: 'confirmed',
  };
  state.appointmentUpdates = [];
  state.auditCalls = [];
  state.smsSends = [];
  state.emailSends = [];
  state.webhookFires = [];
  state.cancellationNotificationCalls = [];
});

describe('POST /api/pos/appointments/[id]/cancel', () => {
  it('returns 401 when not authenticated', async () => {
    state.posEmployee = null;
    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(401);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 403 when appointments.cancel permission denied (cashier role default)', async () => {
    // Cashier role default per audit §9.1: appointments.cancel = false.
    state.posEmployee = { ...state.posEmployee!, role: 'cashier' };
    state.cancelGranted = false;
    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(403);
    expect(state.appointmentUpdates).toHaveLength(0);
    // Notification-suppression invariant — even when 403, nothing fires.
    expect(state.smsSends).toHaveLength(0);
    expect(state.emailSends).toHaveLength(0);
    expect(state.webhookFires).toHaveLength(0);
    expect(state.cancellationNotificationCalls).toHaveLength(0);
  });

  it('returns 400 when cancellation_reason is missing', async () => {
    const res = await POST(makeReq({}), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 when cancellation_reason is empty/whitespace', async () => {
    const res = await POST(makeReq({ cancellation_reason: '   ' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 404 when appointment does not exist', async () => {
    state.appointment = null;
    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(404);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 when appointment is already cancelled', async () => {
    state.appointment!.status = 'cancelled';
    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('returns 400 when appointment is already completed', async () => {
    state.appointment!.status = 'completed';
    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(400);
    expect(state.appointmentUpdates).toHaveLength(0);
  });

  it('cancels with notify_customer=false (default): 0 SMS, 0 email, 0 webhook, 0 cancellation-notification call', async () => {
    const res = await POST(
      makeReq({ cancellation_reason: 'Customer rescheduled offline' }),
      { params }
    );
    expect(res.status).toBe(200);

    // Status flipped + reason persisted.
    expect(state.appointmentUpdates).toHaveLength(1);
    const update = state.appointmentUpdates[0];
    expect(update.status).toBe('cancelled');
    expect(update.cancellation_reason).toBe('Customer rescheduled offline');

    // Notification-suppression invariant — the headline assertion for Item 15b.
    expect(state.smsSends).toHaveLength(0);
    expect(state.emailSends).toHaveLength(0);
    expect(state.webhookFires).toHaveLength(0);
    expect(state.cancellationNotificationCalls).toHaveLength(0);

    // Audit log records suppression + POS source for traceability.
    expect(state.auditCalls).toHaveLength(1);
    const audit = state.auditCalls[0];
    expect((audit.details as Record<string, unknown>).notification_suppressed).toBe(true);
    expect((audit.details as Record<string, unknown>).reason).toBe(
      'Customer rescheduled offline'
    );
    expect(audit.source).toBe('pos');
    expect(audit.action).toBe('delete');
    expect(audit.entityType).toBe('booking');
  });

  it('cancels with notify_customer=true: fires cancellation notifications + webhook, audit records notification_suppressed=false', async () => {
    const res = await POST(
      makeReq({
        cancellation_reason: 'Weather cancellation',
        notify_customer: true,
      }),
      { params }
    );
    expect(res.status).toBe(200);

    expect(state.appointmentUpdates).toHaveLength(1);
    expect(state.appointmentUpdates[0].status).toBe('cancelled');

    // sendCancellationNotifications was called with the appointment id and reason.
    expect(state.cancellationNotificationCalls).toHaveLength(1);
    expect(state.cancellationNotificationCalls[0]).toEqual({
      id: 'appt-1',
      reason: 'Weather cancellation',
    });

    // Webhook fired with the canonical event name.
    expect(state.webhookFires).toHaveLength(1);
    expect(state.webhookFires[0].event).toBe('appointment_cancelled');

    // Audit log records notification_suppressed=false on the notify path.
    expect(state.auditCalls).toHaveLength(1);
    const audit = state.auditCalls[0];
    expect((audit.details as Record<string, unknown>).notification_suppressed).toBe(false);
    expect(audit.source).toBe('pos');
  });

  it('trims whitespace from cancellation_reason before persisting + auditing', async () => {
    const res = await POST(
      makeReq({ cancellation_reason: '  Operator note  ' }),
      { params }
    );
    expect(res.status).toBe(200);
    expect(state.appointmentUpdates[0].cancellation_reason).toBe('Operator note');
    expect((state.auditCalls[0].details as Record<string, unknown>).reason).toBe(
      'Operator note'
    );
  });
});
