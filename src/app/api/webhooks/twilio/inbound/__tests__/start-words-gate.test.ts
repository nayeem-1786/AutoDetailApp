/**
 * Tests for the START_WORDS gate in the Twilio inbound webhook.
 *
 * Defect history: prior to 2026-05-22 the webhook unconditionally
 * intercepted any inbound 'YES' / 'START' / 'UNSTOP' as a TCPA opt-in
 * keyword and returned early — silently breaking the SMS AI agent's
 * short-affirmative flow (e.g., "want me to send the quote?" → "Yes" →
 * agent never saw it; system message logged "opted back in to SMS";
 * conversation stalled). Live evidence: conv 23ee4f02 had 6 inbound
 * 'Yes' messages and 0 agent replies.
 *
 * Fix: STOP_WORDS remain unconditional (TCPA). START_WORDS interception
 * is now gated on the customer being currently opted out
 * (`customers.sms_consent === false`). For opted-in / unknown / new
 * customers, START_WORDS fall through to the normal pipeline so the
 * agent's short-reply interpretation rules handle them.
 *
 * These tests verify the gate's branching. The downstream agent routing
 * is exercised in `sms-ai-v2-routing.test.ts`; these tests only confirm
 * that START_WORDS messages REACH the routing layer (or don't) per the
 * gate's decision.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mocks (boundary modules required for route load) -------------------

const updateSmsConsentMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: (...args: unknown[]) => updateSmsConsentMock(...args),
}));

const loadSmsAiV2FlagsMock = vi.fn();
const shouldUseSmsAiV2Mock = vi.fn();
vi.mock('@/lib/sms-ai/feature-flag', () => ({
  loadSmsAiV2Flags: () => loadSmsAiV2FlagsMock(),
  shouldUseSmsAiV2: (phone: string, flags: unknown) =>
    shouldUseSmsAiV2Mock(phone, flags),
}));

const runV2AgentInBackgroundMock = vi.fn();
vi.mock('@/lib/sms-ai/background-dispatch', () => ({
  runV2AgentInBackground: (input: unknown) => runV2AgentInBackgroundMock(input),
}));

const getAIResponseMock = vi.fn();
vi.mock('@/lib/services/messaging-ai', () => ({
  getAIResponse: (...args: unknown[]) => getAIResponseMock(...args),
}));

const isFeatureEnabledMock = vi.fn();
vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabledMock(...args),
}));

vi.mock('@/lib/utils/constants', () => ({
  FEATURE_FLAGS: { TWO_WAY_SMS: 'two_way_sms' },
}));

vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: () => Promise.resolve(null),
  isWithinBusinessHours: () => true,
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async () => ({ success: true, sid: 'SMxxx' })),
  splitSmsMessage: (msg: string) => [msg],
}));

vi.mock('@/lib/sms/render-sms-template', () => ({
  renderSmsTemplate: vi.fn(async () => ({ isActive: false, body: '' })),
}));

vi.mock('@/lib/services/job-addons', () => ({
  extractAddonActions: vi.fn(() => ({ authorizeIds: [], declineIds: [], cleanedMessage: '' })),
  approveAddon: vi.fn(),
  declineAddon: vi.fn(),
}));

vi.mock('@/lib/quotes/quote-service', () => ({ createQuote: vi.fn() }));
vi.mock('@/lib/utils/short-link', () => ({ createShortLink: vi.fn() }));
vi.mock('@/lib/utils/vehicle-helpers', () => ({
  cleanVehicleDescription: () => '',
  findOrCreateVehicle: vi.fn(),
}));
vi.mock('@/lib/services/service-resolver', () => ({
  resolveServiceByName: vi.fn(),
  resolvePrice: vi.fn(),
}));

vi.mock('@/lib/utils/format', () => ({
  normalizePhone: (s: string) => {
    if (s.startsWith('+')) return s;
    if (/^\d{10}$/.test(s)) return `+1${s}`;
    return null;
  },
}));

// ---- supabase admin mock ------------------------------------------------

interface AdminFixture {
  customer: { id: string; sms_consent: boolean | null } | null;
  insertedMessages: Array<Record<string, unknown>>;
  settings: Record<string, string>;
}

const fixture: AdminFixture = {
  customer: null,
  insertedMessages: [],
  settings: {
    messaging_ai_unknown_enabled: 'true',
    messaging_ai_customers_enabled: 'true',
  },
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => buildAdminMock(),
}));

function buildAdminMock() {
  return {
    from(table: string) {
      if (table === 'customers') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          limit: () => chain,
          async single() {
            return { data: fixture.customer, error: null };
          },
        };
        return chain;
      }
      if (table === 'conversations') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          async single() {
            // No prior conversation — forces insert path
            return { data: null, error: null };
          },
          insert(_values: Record<string, unknown>) {
            const newRow = {
              id: 'conv-new',
              customer_id: fixture.customer?.id ?? null,
              is_ai_enabled: true,
              status: 'open',
              summary: null,
              last_notification_type: null,
              last_notification_at: null,
              unread_count: 1,
            };
            return {
              select: () => ({
                async single() {
                  return { data: newRow, error: null };
                },
              }),
            };
          },
          update: () => ({
            eq: () => Promise.resolve({ data: null, error: null }),
          }),
        };
        return chain;
      }
      if (table === 'messages') {
        const proxy: Record<string, unknown> = {
          select(_cols: string, _opts?: { count?: string; head?: boolean }) {
            return proxy;
          },
          eq() { return proxy; },
          gte() { return proxy; },
          order() { return proxy; },
          limit() { return Promise.resolve({ data: [], error: null }); },
          insert(values: Record<string, unknown>) {
            fixture.insertedMessages.push(values);
            return Promise.resolve({ data: null, error: null });
          },
          then(resolve: (v: unknown) => unknown) {
            resolve({ count: 0, data: [], error: null });
          },
        };
        return proxy;
      }
      if (table === 'business_settings') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then(resolve: (v: unknown) => unknown) {
            const rows = Object.entries(fixture.settings).map(([key, value]) => ({ key, value }));
            resolve({ data: rows, error: null });
          },
        };
        return chain;
      }
      if (table === 'vehicles') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve({ data: null, error: null }),
                }),
                order: () => Promise.resolve({ data: [], error: null }),
              }),
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'transactions') {
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) };
      }
      if (table === 'appointments') {
        return { select: () => ({ eq: () => ({ gte: () => ({ neq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }) };
      }
      if (table === 'quotes') {
        return { select: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) };
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  };
}

// ---- request helper -----------------------------------------------------

function makeRequest(formData: Record<string, string>): import('next/server').NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(formData)) fd.append(k, v);
  const req = new Request('http://localhost/api/webhooks/twilio/inbound', {
    method: 'POST',
    body: fd,
  });
  return req as unknown as import('next/server').NextRequest;
}

import { POST } from '@/app/api/webhooks/twilio/inbound/route';

const PHONE = '+14245551234';

/** Was the system "opted back in / opted out" message inserted? */
function loggedConsentSystemMessage(): boolean {
  return fixture.insertedMessages.some((m) =>
    typeof m.body === 'string' &&
    /Customer sent ".+" — opted (back in|out) to|of SMS/.test(m.body as string),
  );
}

function inboundV2Routed(): boolean {
  return runV2AgentInBackgroundMock.mock.calls.length > 0;
}

beforeEach(() => {
  // Skip Twilio signature validation (route checks NODE_ENV === 'development').
  // process.env.NODE_ENV is declared read-only in TS DOM lib; cast through unknown
  // to set it from test code (same pattern as sms-ai-v2-routing.test.ts).
  (process.env as unknown as Record<string, string>).NODE_ENV = 'development';

  updateSmsConsentMock.mockReset();
  loadSmsAiV2FlagsMock.mockReset();
  shouldUseSmsAiV2Mock.mockReset();
  runV2AgentInBackgroundMock.mockReset();
  getAIResponseMock.mockReset();
  isFeatureEnabledMock.mockReset();

  isFeatureEnabledMock.mockResolvedValue(true);
  fixture.customer = { id: 'cust-1', sms_consent: true };
  fixture.insertedMessages = [];

  // v2 routing: kill switch off, globally on, route every phone to v2 so
  // any message that "reaches the agent" will be observable via the v2
  // background mock.
  loadSmsAiV2FlagsMock.mockResolvedValue({
    killSwitch: false,
    globallyEnabled: true,
    allowlist: [],
  });
  shouldUseSmsAiV2Mock.mockReturnValue(true);
});

// ---- pass-through cases (the BUG fix) ----------------------------------

describe('START_WORDS gate — opted-in customers fall through to agent', () => {
  it('opted-in customer + "Yes" → agent receives it, no consent system message', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Yes', MessageSid: 'SM1' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
    expect(loggedConsentSystemMessage()).toBe(false);
  });

  it('opted-in customer + "YES" (caps) → agent receives it', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'YES', MessageSid: 'SM2' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('opted-in customer + "yes" (lowercase) → agent receives it', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'yes', MessageSid: 'SM3' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('opted-in customer + "  yes  " (whitespace) → agent receives it', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: '  yes  ', MessageSid: 'SM3b' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('new customer (no row) + "Yes" → falls through to agent, no consent action', async () => {
    fixture.customer = null;
    const res = await POST(makeRequest({ From: PHONE, Body: 'Yes', MessageSid: 'SM4' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
    expect(loggedConsentSystemMessage()).toBe(false);
  });

  it('customer with sms_consent=null + "Yes" → falls through to agent', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: null };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Yes', MessageSid: 'SM5' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });
});

// ---- legitimate opt-in cases (gate fires) -----------------------------

describe('START_WORDS gate — opted-out customers trigger opt-in path', () => {
  it('opted-out customer + "YES" → opt-in fires, system message written, agent NOT invoked', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: false };
    const res = await POST(makeRequest({ From: PHONE, Body: 'YES', MessageSid: 'SM6' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        phone: PHONE,
        action: 'opt_in',
        keyword: 'YES',
        source: 'inbound_sms',
      }),
    );
    expect(loggedConsentSystemMessage()).toBe(true);
  });

  it('opted-out customer + "Start" → opt-in fires, system message written', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: false };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Start', MessageSid: 'SM7' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'opt_in', keyword: 'START' }),
    );
    expect(loggedConsentSystemMessage()).toBe(true);
  });

  it('opted-out customer + "UNSTOP" → opt-in fires', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: false };
    const res = await POST(makeRequest({ From: PHONE, Body: 'UNSTOP', MessageSid: 'SM8' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'opt_in', keyword: 'UNSTOP' }),
    );
  });
});

// ---- STOP path unconditional (regression: TCPA) ----------------------

describe('STOP_WORDS — unconditional interception regardless of consent state', () => {
  it('opted-in customer + "STOP" → opt-out fires, agent NOT invoked', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'STOP', MessageSid: 'SM9' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'opt_out', keyword: 'STOP' }),
    );
  });

  it('opted-out customer + "STOP" → opt-out fires again (idempotency handled by helper)', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: false };
    const res = await POST(makeRequest({ From: PHONE, Body: 'STOP', MessageSid: 'SM10' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'opt_out' }),
    );
  });

  it('new customer (no row) + "STOP" → no consent update attempted (no customerId), agent NOT invoked', async () => {
    fixture.customer = null;
    const res = await POST(makeRequest({ From: PHONE, Body: 'STOP', MessageSid: 'SM11' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });
});

// ---- exact-match regression (no false matches) -----------------------

describe('START_WORDS — exact-match regression: ambiguous phrasings fall through', () => {
  it('"Yes please" → falls through to agent (not exact-match)', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Yes please', MessageSid: 'SM12' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('Spanish "Sí" → falls through to agent (not in START_WORDS)', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Sí', MessageSid: 'SM13' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('"Yes." with period → falls through to agent (not exact-match after toUpperCase)', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'Yes.', MessageSid: 'SM14' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });

  it('"yeah" → falls through to agent (not in START_WORDS)', async () => {
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const res = await POST(makeRequest({ From: PHONE, Body: 'yeah', MessageSid: 'SM15' }));
    expect(res.status).toBe(200);
    expect(inboundV2Routed()).toBe(true);
    expect(updateSmsConsentMock).not.toHaveBeenCalled();
  });
});

// ---- STOP-then-YES race (TCPA + opt-in flow integration) -------------

describe('START_WORDS gate — sequenced STOP then YES round-trip', () => {
  it('after STOP flips sms_consent=false, a subsequent YES triggers opt-in', async () => {
    // Step 1: opted-in customer texts STOP → opt-out fires.
    fixture.customer = { id: 'cust-1', sms_consent: true };
    const stopRes = await POST(makeRequest({ From: PHONE, Body: 'STOP', MessageSid: 'SM-STOP' }));
    expect(stopRes.status).toBe(200);
    expect(updateSmsConsentMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'opt_out' }),
    );

    // Step 2: a real production cycle would have updateSmsConsent flip
    // customers.sms_consent to false. Simulate that state for the next call.
    fixture.customer = { id: 'cust-1', sms_consent: false };
    fixture.insertedMessages = [];
    updateSmsConsentMock.mockClear();
    runV2AgentInBackgroundMock.mockClear();

    // Step 3: same customer texts YES → opt-in fires, agent NOT invoked.
    const yesRes = await POST(makeRequest({ From: PHONE, Body: 'YES', MessageSid: 'SM-YES' }));
    expect(yesRes.status).toBe(200);
    expect(inboundV2Routed()).toBe(false);
    expect(updateSmsConsentMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'opt_in', keyword: 'YES' }),
    );
  });
});
