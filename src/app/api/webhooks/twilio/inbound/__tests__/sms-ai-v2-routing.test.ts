/**
 * SMS AI v2 Layer 4 — Twilio inbound webhook routing decision tests.
 *
 * Phase C update (Workstream A Layer 5, 2026-06-18): the v1 legacy
 * single-shot responder was deleted from the webhook. v2 is now the SOLE
 * AI path. The kill-switch / shouldUseSmsAiV2=false case (previously "fall
 * through to legacy") now drops the AI reply entirely — the customer's
 * inbound is stored, no agent fires. This file tests the post-Phase-C
 * branching: when v2 fires, when v2 does NOT fire (and no fallback exists).
 *
 * The routing branch sits after all existing gates (signature, STOP,
 * two_way_sms, is_ai_enabled per-conversation, audience flag, rate-limit).
 * Strategy: mock every external boundary the route touches, drive POST with
 * a forged Twilio form-data request, observe whether `runV2AgentInBackground`
 * was called (v2 fires) or not (no AI reply).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mocks ---------------------------------------------------------------

// Drive the v2 routing decision: each test sets the flags and the phone.
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

// Phase C — `@/lib/services/messaging-ai` deleted; no `getAIResponse` mock.

// Feature-flag check for two_way_sms.
const isFeatureEnabledMock = vi.fn();
vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: (...args: unknown[]) => isFeatureEnabledMock(...args),
}));

vi.mock('@/lib/utils/constants', () => ({
  FEATURE_FLAGS: { TWO_WAY_SMS: 'two_way_sms' },
}));

// Business-hours mocks — affects `shouldAiReply` evaluation but tests pin
// the audience flags directly, so the business-hours branch is moot.
vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: () => Promise.resolve(null),
  isWithinBusinessHours: () => true,
}));

// SMS consent updates fired on STOP/START — not relevant to routing tests
// but the import is required for module load.
vi.mock('@/lib/utils/sms-consent', () => ({
  updateSmsConsent: vi.fn(async () => undefined),
}));

vi.mock('@/lib/utils/sms', () => ({
  sendSms: vi.fn(async () => ({ success: true, sid: 'SMxxx' })),
}));

vi.mock('@/lib/utils/format', () => ({
  normalizePhone: (s: string) => {
    // Minimal — preserve E.164, otherwise prepend +1
    if (s.startsWith('+')) return s;
    if (/^\d{10}$/.test(s)) return `+1${s}`;
    return null;
  },
}));

// ---- supabase admin client mock -----------------------------------------
//
// Drives the per-test fixtures: customer existence, conversation state,
// settings rows, message rows for rate-limit count.

interface AdminFixture {
  customer: { id: string } | null;
  conversation: {
    id: string;
    customer_id: string | null;
    is_ai_enabled: boolean;
    status: string;
    summary?: string | null;
    last_notification_type?: string | null;
    last_notification_at?: string | null;
    unread_count?: number;
  } | null;
  settings: Record<string, string>;
  recentAiCount: number;
}

const fixture: AdminFixture = {
  customer: null,
  conversation: null,
  settings: {},
  recentAiCount: 0,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => buildAdminMock(),
}));

function buildAdminMock() {
  return {
    from(table: string) {
      if (table === 'customers') {
        const chain = {
          _phone: undefined as string | undefined,
          select: () => chain,
          eq(_col: string, val: string) { chain._phone = val; return chain; },
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
            return { data: fixture.conversation, error: null };
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
            fixture.conversation = newRow;
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
        const chain: Record<string, unknown> = {
          _isAiCount: false,
        };
        const proxy: Record<string, unknown> = {
          select(_cols: string, opts?: { count?: string; head?: boolean }) {
            chain._isAiCount = !!opts?.count;
            return proxy;
          },
          eq() { return proxy; },
          gte() { return proxy; },
          order() { return proxy; },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
          insert: () => Promise.resolve({ data: null, error: null }),
          // Resolve await-of-builder when used as a count query
          then(resolve: (v: unknown) => unknown) {
            if (chain._isAiCount) {
              resolve({ count: fixture.recentAiCount, data: null, error: null });
            } else {
              resolve({ data: [], error: null });
            }
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
          // Awaiting `.in(...)` chain — resolve to settings rows
          then(resolve: (v: unknown) => unknown) {
            const rows = Object.entries(fixture.settings).map(([key, value]) => ({
              key,
              value,
            }));
            resolve({ data: rows, error: null });
          },
        };
        return chain;
      }
      throw new Error(`Unexpected supabase table in test: ${table}`);
    },
  };
}

// ---- request helpers -----------------------------------------------------

function makeRequest(formData: Record<string, string>): import('next/server').NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(formData)) fd.append(k, v);
  const req = new Request('http://localhost/api/webhooks/twilio/inbound', {
    method: 'POST',
    body: fd,
  });
  return req as unknown as import('next/server').NextRequest;
}

const INBOUND_BODY = 'how much for a wax on my Camry?';
const PHONE_A = '+14245551234';
const PHONE_B = '+14245559999';

beforeEach(() => {
  loadSmsAiV2FlagsMock.mockReset();
  shouldUseSmsAiV2Mock.mockReset();
  runV2AgentInBackgroundMock.mockReset();
  isFeatureEnabledMock.mockReset();

  // Defaults: two_way_sms enabled, audience-customers enabled, conversation
  // ai-enabled, no rate-limit hit. Per-test overrides tighten as needed.
  isFeatureEnabledMock.mockResolvedValue(true);
  fixture.customer = { id: 'cust-1' };
  fixture.conversation = {
    id: 'conv-1',
    customer_id: 'cust-1',
    is_ai_enabled: true,
    status: 'open',
    summary: null,
    last_notification_type: null,
    last_notification_at: null,
    unread_count: 1,
  };
  fixture.settings = {
    messaging_ai_unknown_enabled: 'false',
    messaging_ai_customers_enabled: 'true',
  };
  fixture.recentAiCount = 0;

  // Default v2 routing: kill switch off, globally enabled (post-Phase-A
  // production state — verified pre-Phase-C). Both phones route to v2.
  loadSmsAiV2FlagsMock.mockResolvedValue({
    killSwitch: false,
    enabledPhones: [],
    globallyEnabled: true,
  });
  // Simulate the real predicate for tests that don't override
  shouldUseSmsAiV2Mock.mockImplementation((phone: string, flags: { killSwitch: boolean; enabledPhones: string[]; globallyEnabled: boolean }) => {
    if (flags.killSwitch) return false;
    if (flags.globallyEnabled) return true;
    return flags.enabledPhones.includes(phone);
  });

  runV2AgentInBackgroundMock.mockResolvedValue(undefined);

  // Skip Twilio signature validation (route checks NODE_ENV === 'development').
  // process.env.NODE_ENV is declared read-only in TS DOM lib; cast through unknown
  // so the test mutation compiles while still flipping the runtime value.
  (process.env as unknown as Record<string, string>).NODE_ENV = 'development';
});

// Re-import the handler per-suite so module-level mocks remain in effect.
async function callPOST(formData: Record<string, string>): Promise<Response> {
  const { POST } = await import('@/app/api/webhooks/twilio/inbound/route');
  return POST(makeRequest(formData));
}

// ---- tests ---------------------------------------------------------------

describe('Twilio inbound webhook — v2 routing decision (post-Phase-C: v2 is the sole AI path)', () => {
  it('globally enabled (default) → any phone routes to v2 (background dispatch fired)', async () => {
    const res = await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_1',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<Response/>');
    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
    expect(runV2AgentInBackgroundMock).toHaveBeenCalledWith({
      inboundMessageBody: INBOUND_BODY,
      conversationId: 'conv-1',
      phone: PHONE_A,
    });
  });

  it('globally enabled (default) → second phone also routes to v2 (no allowlist gate)', async () => {
    // Re-point customer + conversation to a different phone — same routing.
    fixture.conversation = {
      id: 'conv-2',
      customer_id: 'cust-1',
      is_ai_enabled: true,
      status: 'open',
    };

    await callPOST({
      From: PHONE_B,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_2',
    });

    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
  });

  it('allowlist still wins when globallyEnabled=false (Phase-A-pre-flip safety)', async () => {
    loadSmsAiV2FlagsMock.mockResolvedValue({
      killSwitch: false,
      enabledPhones: [PHONE_A],
      globallyEnabled: false,
    });

    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_3',
    });

    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
  });

  it('non-allowlisted phone + globallyEnabled=false → no AI reply (no v1 fallback)', async () => {
    loadSmsAiV2FlagsMock.mockResolvedValue({
      killSwitch: false,
      enabledPhones: [PHONE_A],
      globallyEnabled: false,
    });

    const res = await callPOST({
      From: PHONE_B,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_4',
    });

    expect(res.status).toBe(200);
    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('killSwitch=true overrides globallyEnabled + allowlist → no AI reply (v1 fallback removed in Phase C)', async () => {
    loadSmsAiV2FlagsMock.mockResolvedValue({
      killSwitch: true,
      enabledPhones: [PHONE_A],
      globallyEnabled: true,
    });

    const res = await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_5',
    });

    expect(res.status).toBe(200);
    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('flag load throws → no AI reply, return 200 (no v1 fallback)', async () => {
    loadSmsAiV2FlagsMock.mockRejectedValueOnce(new Error('DB down'));

    const res = await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_6',
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<Response/>');
    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('returns empty TwiML 200 to Twilio after firing v2 (return-early)', async () => {
    const res = await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_7',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<Response/>');
    expect(res.headers.get('content-type')).toContain('text/xml');
  });

  it('background dispatch rejection is swallowed (route still 200, never propagates)', async () => {
    runV2AgentInBackgroundMock.mockRejectedValueOnce(new Error('runner exploded'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_8',
    });

    expect(res.status).toBe(200);
    // Defer to allow the unhandled promise's .catch handler to fire
    await new Promise((r) => setTimeout(r, 10));
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/SmsAiV2 background/);
    errorSpy.mockRestore();
  });
});

describe('Twilio inbound webhook — existing gates must skip v2 (no AI fires)', () => {
  it('conversation.is_ai_enabled=false → v2 NOT fired', async () => {
    fixture.conversation = {
      id: 'conv-1',
      customer_id: 'cust-1',
      is_ai_enabled: false,
      status: 'open',
    };

    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_9',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('messaging_ai_customers_enabled=false + known customer → v2 NOT fired', async () => {
    fixture.settings = {
      messaging_ai_unknown_enabled: 'false',
      messaging_ai_customers_enabled: 'false',
    };

    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_10',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('STOP keyword → v2 NOT fired (TCPA short-circuit before AI block)', async () => {
    await callPOST({
      From: PHONE_A,
      Body: 'STOP',
      MessageSid: 'SM_test_11',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('rate-limit exhausted (≥25 AI replies in last hour) → v2 NOT fired', async () => {
    fixture.recentAiCount = 25;

    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_12',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });

  it('two_way_sms feature flag disabled → v2 NOT fired (route returns 200 before AI block)', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);

    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_13',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
  });
});

describe('Twilio inbound webhook — v2 runner input contract', () => {
  it('passes inboundMessageBody / conversationId / phone (no customerId — runner uses phone for context lookup)', async () => {
    await callPOST({
      From: PHONE_A,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_14',
    });

    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
    const passed = runV2AgentInBackgroundMock.mock.calls[0][0];
    // Exact-shape assertion — RunAgentInput is locked; webhook must not add
    // unknown fields. customerId is NOT passed because runSmsAiV2Agent calls
    // getCustomerContext({ phone, conversationId }) internally (Layer 3c).
    expect(Object.keys(passed).sort()).toEqual(
      ['inboundMessageBody', 'conversationId', 'phone'].sort(),
    );
    expect(passed.inboundMessageBody).toBe(INBOUND_BODY);
    expect(passed.conversationId).toBe('conv-1');
    expect(passed.phone).toBe(PHONE_A);
  });
});
