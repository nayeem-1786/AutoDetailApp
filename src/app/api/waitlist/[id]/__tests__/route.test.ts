import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Session 1.8.1 — Admin waitlist PATCH silent-drop fix.
//
// Tests that the admin waitlist PATCH endpoint, when the operator flips an
// entry's status to 'notified', dispatches an SMS to the customer via the
// canonical sendSms helper (mirroring Session 1.8's cancel-route pattern at
// appointments/[id]/cancel/route.ts:174-194). Pre-1.8.1 the dispatch was via
// fireWebhook only — same customer-facing silent-drop bug class as Session 1.8
// (no n8n receiver wired in prod per webhook receivers identity audit
// f5e714a8). The fix keeps the webhook fire for forward-compat and adds the
// direct sendSms loop alongside it.

const state = {
  entry: {
    id: 'wl-1',
    customer_id: 'cust-1',
    service_id: 'svc-1',
    status: 'waiting',
    preferred_date: '2026-07-15',
    customer: { first_name: 'Alex', last_name: 'Yu', phone: '+13105551111' },
    service: { name: 'Ceramic Coating' },
  } as null | Record<string, unknown>,
  updateResult: null as null | Record<string, unknown>,
  webhookFires: [] as Array<{ event: string; payload: unknown }>,
  smsSends: [] as Array<{ to: string; body: string; options: Record<string, unknown> | undefined }>,
  renderCalls: [] as Array<{ slug: string; vars: Record<string, unknown>; fallback: string }>,
  renderResult: { body: 'rendered-body', isActive: true } as { body: string; isActive: boolean },
};

vi.mock('@/lib/utils/webhook', () => ({
  fireWebhook: vi.fn(async (event: string, payload: unknown) => {
    state.webhookFires.push({ event, payload });
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
// per-table builder. The waitlist PATCH route reads/writes waitlist_entries
// (with embed of customers + services).
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'waitlist_entries') {
        return {
          select: (_cols: string) => ({
            eq: (_col: string, _val: string) => ({
              single: async () => {
                return state.entry
                  ? { data: state.entry, error: null }
                  : { data: null, error: { message: 'not found' } };
              },
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, _val: string) => ({
              select: (_c: string) => ({
                single: async () => {
                  state.updateResult = { ...state.entry, ...payload };
                  return { data: state.updateResult, error: null };
                },
              }),
            }),
          }),
        };
      }
      return {};
    },
  }),
}));

import { PATCH } from '../route';

function makeReq(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/wl-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: 'wl-1' });

beforeEach(() => {
  state.entry = {
    id: 'wl-1',
    customer_id: 'cust-1',
    service_id: 'svc-1',
    status: 'waiting',
    preferred_date: '2026-07-15',
    customer: { first_name: 'Alex', last_name: 'Yu', phone: '+13105551111' },
    service: { name: 'Ceramic Coating' },
  };
  state.updateResult = null;
  state.webhookFires = [];
  state.smsSends = [];
  state.renderCalls = [];
  state.renderResult = { body: 'rendered-body', isActive: true };
});

describe('PATCH /api/waitlist/[id] — Session 1.8.1 admin notify direct-dispatch', () => {
  it('dispatches sendSms for the customer when admin PATCHes status to notified', async () => {
    const res = await PATCH(makeReq({ status: 'notified' }), { params });
    expect(res.status).toBe(200);

    // notified_at stamped on the update.
    expect(state.updateResult?.status).toBe('notified');
    expect(state.updateResult?.notified_at).toBeDefined();

    // sendSms dispatched with the customer's phone and the slug context.
    expect(state.smsSends).toHaveLength(1);
    expect(state.smsSends[0].to).toBe('+13105551111');
    expect(state.smsSends[0].options).toMatchObject({
      logToConversation: true,
      customerId: 'cust-1',
      notificationType: 'waitlist_slot_available',
      contextId: 'wl-1',
    });

    // Render was invoked with the new slug and the vars the contract requires
    // (service_name + appointment_date as the formatted preferred date).
    expect(state.renderCalls).toHaveLength(1);
    expect(state.renderCalls[0].slug).toBe('waitlist_slot_available');
    expect(state.renderCalls[0].vars).toMatchObject({
      service_name: 'Ceramic Coating',
      first_name: 'Alex',
      last_name: 'Yu',
    });
    expect(state.renderCalls[0].vars.appointment_date).toMatch(/\d{4}/);
  });

  it('skips sendSms when the customer has no phone (silent skip — no Twilio call)', async () => {
    state.entry = {
      ...(state.entry as Record<string, unknown>),
      customer: { first_name: 'No', last_name: 'Phone', phone: null },
    };

    const res = await PATCH(makeReq({ status: 'notified' }), { params });
    expect(res.status).toBe(200);

    // Row still flips to notified (operator-visible state unchanged).
    expect(state.updateResult?.status).toBe('notified');
    expect(state.updateResult?.notified_at).toBeDefined();
    // No SMS dispatched.
    expect(state.smsSends).toHaveLength(0);
  });

  it('skips sendSms when preferred_date is null (admin should follow up directly)', async () => {
    state.entry = {
      ...(state.entry as Record<string, unknown>),
      preferred_date: null,
    };

    const res = await PATCH(makeReq({ status: 'notified' }), { params });
    expect(res.status).toBe(200);

    // Row still flips to notified.
    expect(state.updateResult?.status).toBe('notified');
    // No SMS dispatched — template requires appointment_date.
    expect(state.smsSends).toHaveLength(0);
    expect(state.renderCalls).toHaveLength(0);
  });

  it('preserves forward-compat webhook fire alongside direct SMS dispatch', async () => {
    const res = await PATCH(makeReq({ status: 'notified' }), { params });
    expect(res.status).toBe(200);

    // SMS fired.
    expect(state.smsSends).toHaveLength(1);

    // AND the waitlist_notified webhook also fired (forward-compat for an
    // external receiver wired in the future).
    expect(state.webhookFires).toHaveLength(1);
    expect(state.webhookFires[0].event).toBe('appointment_cancelled');
    const payload = state.webhookFires[0].payload as Record<string, unknown>;
    expect(payload.event).toBe('waitlist_notified');
    expect(payload.waitlist_entry_id).toBe('wl-1');
  });

  it('does not call sendSms when renderSmsTemplate returns isActive=false (template disabled)', async () => {
    state.renderResult = { body: '', isActive: false };

    const res = await PATCH(makeReq({ status: 'notified' }), { params });
    expect(res.status).toBe(200);

    // Row still flipped to notified (operator-visible state unchanged).
    expect(state.updateResult?.status).toBe('notified');
    // But no SMS dispatched — template is disabled.
    expect(state.smsSends).toHaveLength(0);
  });

  it('does not dispatch SMS or fire waitlist-notified webhook for non-notified transitions', async () => {
    // booked → no notify side effects.
    state.entry = {
      ...(state.entry as Record<string, unknown>),
      status: 'notified',
    };
    const res = await PATCH(makeReq({ status: 'booked' }), { params });
    expect(res.status).toBe(200);

    expect(state.smsSends).toHaveLength(0);
    expect(state.webhookFires).toHaveLength(0);
    expect(state.renderCalls).toHaveLength(0);
  });
});
