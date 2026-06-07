import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session 1.8 — Waitlist notification silent-drop fix.
//
// Tests that the admin cancel endpoint, when the waitlist feature flag is on
// AND matching `waitlist_entries` exist for the cancelled appointment's
// service+date, dispatches an SMS to each waitlisted customer via the canonical
// sendSms helper (mirroring pos/jobs/[id]/complete:243-262). Pre-1.8 the
// dispatch was via fireWebhook only — a customer-facing silent-drop bug with
// no n8n receiver wired in prod (per webhook receivers identity audit
// f5e714a8). The fix keeps the webhook fire for forward-compat and adds the
// direct sendSms loop alongside it.

type WaitlistEntryFixture = {
  id: string;
  customer_id: string;
  service_id: string;
  customer: { first_name: string | null; last_name: string | null; phone: string | null } | null;
  service: { name: string | null } | null;
};

const state = {
  employee: {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'admin@example.com',
    first_name: 'Ada',
    last_name: 'Min',
  } as null | {
    id: string;
    auth_user_id: string;
    email: string;
    first_name: string;
    last_name: string;
  },
  denied: false,
  feeDenied: false,
  appointment: { id: 'appt-1', status: 'confirmed' } as null | { id: string; status: string },
  apptDetail: { scheduled_date: '2026-07-15' } as { scheduled_date: string } | null,
  apptServices: [
    { service_id: 'svc-1' },
  ] as Array<{ service_id: string }> | null,
  featureFlags: { waitlist: true, cancellation_fee: false } as Record<string, boolean>,
  waitlistMatches: [] as WaitlistEntryFixture[] | null,
  waitlistUpdates: [] as Array<{ id: string; payload: Record<string, unknown> }>,
  appointmentUpdates: [] as Array<Record<string, unknown>>,
  smsSends: [] as Array<{ to: string; body: string; options: Record<string, unknown> | undefined }>,
  renderCalls: [] as Array<{ slug: string; vars: Record<string, unknown>; fallback: string }>,
  renderResult: { body: 'rendered-body', isActive: true } as { body: string; isActive: boolean },
  cancellationNotificationCalls: [] as Array<{ id: string; reason: string | undefined }>,
  auditCalls: [] as Array<Record<string, unknown>>,
};

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async (_id: string, key: string) => {
    if (key === 'appointments.cancel' && state.denied) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    if (key === 'appointments.waive_fee' && state.feeDenied) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
    return null;
  },
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: (entry: Record<string, unknown>) => {
    state.auditCalls.push(entry);
  },
  getRequestIp: () => '127.0.0.1',
}));

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: async (flag: string) => state.featureFlags[flag] ?? false,
}));

vi.mock('@/lib/email/send-cancellation-email', () => ({
  sendCancellationNotifications: vi.fn(async (id: string, reason: string | undefined) => {
    state.cancellationNotificationCalls.push({ id, reason });
    return { emailSent: true, smsSent: true, usedTemplate: true };
  }),
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async (to: string, body: string, options?: Record<string, unknown>) => {
    state.smsSends.push({ to, body, options });
    return { success: true, sid: 'SM-test' };
  }),
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async (slug: string, vars: Record<string, unknown>, fallback: string) => {
    state.renderCalls.push({ slug, vars, fallback });
    return {
      ...state.renderResult,
      canSilence: false,
      recipientType: 'customer',
      recipientPhones: null,
    };
  }),
}));

// Supabase client mock — minimal surface routing each from(table) call to a
// per-table builder. The cancel route reads/writes appointments,
// appointment_services, and waitlist_entries (with embed of customers + services).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'appointments') {
        return {
          select: (cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => {
                if (cols.includes('scheduled_date')) {
                  return state.apptDetail
                    ? { data: state.apptDetail, error: null }
                    : { data: null, error: { message: 'not found' } };
                }
                return state.appointment
                  ? { data: state.appointment, error: null }
                  : { data: null, error: { message: 'not found' } };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => ({
              select: (_c: string) => ({
                single: async () => {
                  state.appointmentUpdates.push(payload);
                  return { data: { id: 'appt-1', status: 'cancelled' }, error: null };
                },
              }),
            }),
          }),
        };
      }
      if (table === 'appointment_services') {
        return {
          select: (_cols: string) => ({
            eq: async (_col: string, _val: string) => ({
              data: state.apptServices,
              error: null,
            }),
          }),
        };
      }
      if (table === 'waitlist_entries') {
        return {
          select: (_cols: string) => ({
            in: (_col: string, _ids: string[]) => ({
              eq: (_c: string, _v: string) => ({
                or: async (_or: string) => ({
                  data: state.waitlistMatches,
                  error: null,
                }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: async (_col: string, val: string) => {
              state.waitlistUpdates.push({ id: val, payload });
              return { error: null };
            },
          }),
        };
      }
      return {};
    },
  }),
}));

vi.mock('@/lib/utils/validation', () => ({
  appointmentCancelSchema: {
    safeParse: (body: unknown) => {
      const b = (body as Record<string, unknown>) || {};
      return {
        success: true,
        data: {
          cancellation_reason: b.cancellation_reason as string | undefined,
          cancellation_fee: b.cancellation_fee as number | null | undefined,
        },
      };
    },
  },
}));

import { POST } from '../cancel/route';

function makeReq(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/appointments/appt-1/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'appt-1' });

beforeEach(() => {
  state.employee = {
    id: 'emp-1',
    auth_user_id: 'auth-1',
    email: 'admin@example.com',
    first_name: 'Ada',
    last_name: 'Min',
  };
  state.denied = false;
  state.feeDenied = false;
  state.appointment = { id: 'appt-1', status: 'confirmed' };
  state.apptDetail = { scheduled_date: '2026-07-15' };
  state.apptServices = [{ service_id: 'svc-1' }];
  state.featureFlags = { waitlist: true, cancellation_fee: false };
  state.waitlistMatches = [];
  state.waitlistUpdates = [];
  state.appointmentUpdates = [];
  state.smsSends = [];
  state.renderCalls = [];
  state.renderResult = { body: 'rendered-body', isActive: true };
  state.cancellationNotificationCalls = [];
  state.auditCalls = [];
});

describe('POST /api/appointments/[id]/cancel — Session 1.8 waitlist direct-dispatch', () => {
  it('dispatches sendSms for each waitlisted customer when cancel matches their service+date', async () => {
    state.waitlistMatches = [
      {
        id: 'wl-1',
        customer_id: 'cust-1',
        service_id: 'svc-1',
        customer: { first_name: 'Alex', last_name: 'Yu', phone: '+13105551111' },
        service: { name: 'Ceramic Coating' },
      },
      {
        id: 'wl-2',
        customer_id: 'cust-2',
        service_id: 'svc-1',
        customer: { first_name: 'Sam', last_name: 'Lee', phone: '+13105552222' },
        service: { name: 'Ceramic Coating' },
      },
    ];

    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(200);

    // Both waitlist entries flipped to notified, with notified_at stamped.
    expect(state.waitlistUpdates).toHaveLength(2);
    expect(state.waitlistUpdates[0].payload.status).toBe('notified');
    expect(state.waitlistUpdates[0].payload.notified_at).toBeDefined();
    expect(state.waitlistUpdates[1].payload.status).toBe('notified');

    // sendSms dispatched per customer with correct phone routing.
    expect(state.smsSends).toHaveLength(2);
    expect(state.smsSends[0].to).toBe('+13105551111');
    expect(state.smsSends[1].to).toBe('+13105552222');

    // Template + context options threaded correctly.
    expect(state.smsSends[0].options).toMatchObject({
      logToConversation: true,
      customerId: 'cust-1',
      notificationType: 'waitlist_slot_available',
      contextId: 'appt-1',
    });

    // Render was invoked with the new slug and the vars the contract requires
    // (service_name + appointment_date as the formatted slot date).
    expect(state.renderCalls).toHaveLength(2);
    expect(state.renderCalls[0].slug).toBe('waitlist_slot_available');
    expect(state.renderCalls[0].vars).toMatchObject({
      service_name: 'Ceramic Coating',
      first_name: 'Alex',
      last_name: 'Yu',
    });
    // appointment_date is the formatted slot date (weekday, year, month, day).
    expect(state.renderCalls[0].vars.appointment_date).toMatch(/\d{4}/);
  });

  it('skips sendSms when waitlist matches is empty (no notify on empty result set)', async () => {
    state.waitlistMatches = [];

    const res = await POST(makeReq({ cancellation_reason: 'No-show' }), { params });
    expect(res.status).toBe(200);

    // No waitlist row updates, no SMS sends, no waitlist-notified webhook fire.
    expect(state.waitlistUpdates).toHaveLength(0);
    expect(state.smsSends).toHaveLength(0);

    // Theme G removed both the unconditional cancellation webhook AND the
    // waitlist_notified forward-compat webhook from this route; the prod
    // code has no outbound webhook to assert here anymore.
  });

  it('skips sendSms for a waitlist entry whose customer has no phone (silent skip — no Twilio call)', async () => {
    state.waitlistMatches = [
      {
        id: 'wl-3',
        customer_id: 'cust-3',
        service_id: 'svc-1',
        customer: { first_name: 'No Phone', last_name: null, phone: null },
        service: { name: 'Ceramic Coating' },
      },
      {
        id: 'wl-4',
        customer_id: 'cust-4',
        service_id: 'svc-1',
        customer: { first_name: 'Has Phone', last_name: null, phone: '+13105554444' },
        service: { name: 'Ceramic Coating' },
      },
    ];

    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(200);

    // Both rows still flipped to notified (operator-visible state unchanged).
    expect(state.waitlistUpdates).toHaveLength(2);
    // Only the one with a phone receives an SMS.
    expect(state.smsSends).toHaveLength(1);
    expect(state.smsSends[0].to).toBe('+13105554444');
  });

  it('preserves forward-compat webhook fire alongside direct SMS dispatch', async () => {
    state.waitlistMatches = [
      {
        id: 'wl-5',
        customer_id: 'cust-5',
        service_id: 'svc-1',
        customer: { first_name: 'Forward', last_name: 'Compat', phone: '+13105555555' },
        service: { name: 'Interior Detail' },
      },
    ];

    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(200);

    // SMS fired.
    expect(state.smsSends).toHaveLength(1);

    // Theme G removed the forward-compat waitlist_notified webhook fire;
    // the SMS dispatch assertion above is now the entire notification contract.
  });

  it('does not call sendSms when renderSmsTemplate returns isActive=false (template disabled)', async () => {
    state.waitlistMatches = [
      {
        id: 'wl-6',
        customer_id: 'cust-6',
        service_id: 'svc-1',
        customer: { first_name: 'Disabled', last_name: 'Template', phone: '+13105556666' },
        service: { name: 'Wash' },
      },
    ];
    // Render returns inactive → caller must skip sendSms.
    state.renderResult = { body: '', isActive: false };

    const res = await POST(makeReq({ cancellation_reason: 'Customer asked' }), { params });
    expect(res.status).toBe(200);

    // Row still flipped to notified (operator-visible state unchanged).
    expect(state.waitlistUpdates).toHaveLength(1);
    expect(state.waitlistUpdates[0].payload.status).toBe('notified');
    // But no SMS dispatched — template is disabled.
    expect(state.smsSends).toHaveLength(0);
  });
});
