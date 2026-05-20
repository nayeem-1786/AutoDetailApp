/**
 * SMS AI v2 Layer 4 — Twilio inbound webhook routing decision tests.
 *
 * Exercises the routing branch inside the legacy webhook POST handler.
 * The branch sits after all existing gates (signature, STOP, two_way_sms,
 * is_ai_enabled per-conversation, audience flag, rate-limit) and BEFORE
 * the legacy 5-query context block. v2-allowlisted phones short-circuit
 * the request with an empty TwiML 200 and fire the agent in background;
 * non-allowlisted phones fall through to the legacy code path unchanged.
 *
 * Strategy: mock every external boundary the route touches, drive the
 * POST handler with a forged Twilio form-data request, observe which AI
 * path was taken via `getAIResponse` (legacy) vs `runV2AgentInBackground`
 * (v2) mocks. Most route internals are exercised by the existing legacy
 * code path; this file isolates the routing concern.
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

const getAIResponseMock = vi.fn();
vi.mock('@/lib/services/messaging-ai', () => ({
  getAIResponse: (...args: unknown[]) => getAIResponseMock(...args),
}));

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

vi.mock('@/lib/quotes/quote-service', () => ({
  createQuote: vi.fn(),
}));

vi.mock('@/lib/utils/short-link', () => ({
  createShortLink: vi.fn(),
}));

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
  // History returned by the "messages" SELECT inside the AI branch
  history: Array<Record<string, unknown>>;
  // Customer-row + transactions/vehicles/appointments/quotes for legacy ctx
  customerProfile: Record<string, unknown> | null;
}

const fixture: AdminFixture = {
  customer: null,
  conversation: null,
  settings: {},
  recentAiCount: 0,
  history: [],
  customerProfile: null,
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
            return Promise.resolve({ data: fixture.history, error: null });
          },
          insert: () => Promise.resolve({ data: null, error: null }),
          // Resolve await-of-builder when used as a count query
          then(resolve: (v: unknown) => unknown) {
            if (chain._isAiCount) {
              resolve({ count: fixture.recentAiCount, data: null, error: null });
            } else {
              resolve({ data: fixture.history, error: null });
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
      if (table === 'vehicles') {
        // Specialty vehicle check returns nothing → not specialty
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
        return {
          select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
        };
      }
      if (table === 'appointments') {
        return {
          select: () => ({ eq: () => ({ gte: () => ({ neq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }) }),
        };
      }
      if (table === 'quotes') {
        return {
          select: () => ({ eq: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
        };
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
const ALLOWLIST_PHONE = '+14245551234';
const NON_ALLOWLIST_PHONE = '+14245559999';

beforeEach(() => {
  loadSmsAiV2FlagsMock.mockReset();
  shouldUseSmsAiV2Mock.mockReset();
  runV2AgentInBackgroundMock.mockReset();
  getAIResponseMock.mockReset();
  isFeatureEnabledMock.mockReset();

  // Defaults: two_way_sms enabled, audience-customers enabled, conversation
  // ai-enabled, no rate-limit hit, no specialty vehicles. Per-test overrides
  // tighten or loosen as needed.
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
  fixture.history = [];
  fixture.customerProfile = null;

  // Default v2 routing: kill switch off, globally disabled, allowlist of one
  loadSmsAiV2FlagsMock.mockResolvedValue({
    killSwitch: false,
    enabledPhones: [ALLOWLIST_PHONE],
    globallyEnabled: false,
  });
  // Simulate the real predicate for tests that don't override
  shouldUseSmsAiV2Mock.mockImplementation((phone: string, flags: { killSwitch: boolean; enabledPhones: string[]; globallyEnabled: boolean }) => {
    if (flags.killSwitch) return false;
    if (flags.globallyEnabled) return true;
    return flags.enabledPhones.includes(phone);
  });

  getAIResponseMock.mockResolvedValue(null);
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

describe('Twilio inbound webhook — v2 routing decision', () => {
  it('allowlisted phone + flags default → routes to v2 (background dispatch fired, legacy NOT called)', async () => {
    const res = await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_1',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<Response/>');
    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
    expect(runV2AgentInBackgroundMock).toHaveBeenCalledWith({
      inboundMessageBody: INBOUND_BODY,
      conversationId: 'conv-1',
      phone: ALLOWLIST_PHONE,
    });
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('non-allowlisted phone + flags default → routes to legacy (getAIResponse called, v2 NOT called)', async () => {
    // Re-point customer + conversation to the non-allowlisted phone
    fixture.conversation = {
      id: 'conv-2',
      customer_id: 'cust-1',
      is_ai_enabled: true,
      status: 'open',
    };

    await callPOST({
      From: NON_ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_2',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).toHaveBeenCalledTimes(1);
  });

  it('globallyEnabled=true → any phone routes to v2', async () => {
    loadSmsAiV2FlagsMock.mockResolvedValue({
      killSwitch: false,
      enabledPhones: [],
      globallyEnabled: true,
    });

    await callPOST({
      From: NON_ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_3',
    });

    expect(runV2AgentInBackgroundMock).toHaveBeenCalledTimes(1);
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('killSwitch=true overrides globallyEnabled + allowlist → routes to legacy', async () => {
    loadSmsAiV2FlagsMock.mockResolvedValue({
      killSwitch: true,
      enabledPhones: [ALLOWLIST_PHONE],
      globallyEnabled: true,
    });

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_4',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).toHaveBeenCalledTimes(1);
  });

  it('flag load throws → falls through to legacy (defensive default)', async () => {
    loadSmsAiV2FlagsMock.mockRejectedValueOnce(new Error('DB down'));

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_5',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).toHaveBeenCalledTimes(1);
  });

  it('returns empty TwiML 200 to Twilio after firing v2 (return-early)', async () => {
    const res = await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_6',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<Response/>');
    expect(res.headers.get('content-type')).toContain('text/xml');
  });

  it('background dispatch rejection is swallowed (route still 200, never propagates)', async () => {
    runV2AgentInBackgroundMock.mockRejectedValueOnce(new Error('runner exploded'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_7',
    });

    expect(res.status).toBe(200);
    // Defer to allow the unhandled promise's .catch handler to fire
    await new Promise((r) => setTimeout(r, 10));
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toMatch(/SmsAiV2 background/);
    errorSpy.mockRestore();
  });
});

describe('Twilio inbound webhook — existing gates must skip BOTH AI paths', () => {
  it('conversation.is_ai_enabled=false + allowlist phone → neither AI fires', async () => {
    fixture.conversation = {
      id: 'conv-1',
      customer_id: 'cust-1',
      is_ai_enabled: false,
      status: 'open',
    };

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_8',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('messaging_ai_customers_enabled=false + known customer + allowlist phone → neither AI fires', async () => {
    fixture.settings = {
      messaging_ai_unknown_enabled: 'false',
      messaging_ai_customers_enabled: 'false',
    };

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_9',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('STOP keyword + allowlist phone → neither AI fires (TCPA short-circuit before AI block)', async () => {
    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: 'STOP',
      MessageSid: 'SM_test_10',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('rate-limit exhausted (≥25 AI replies in last hour) + allowlist phone → neither AI fires', async () => {
    fixture.recentAiCount = 25;

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_11',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });

  it('two_way_sms feature flag disabled → neither AI fires (route returns 200 before AI block)', async () => {
    isFeatureEnabledMock.mockResolvedValue(false);

    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_12',
    });

    expect(runV2AgentInBackgroundMock).not.toHaveBeenCalled();
    expect(getAIResponseMock).not.toHaveBeenCalled();
  });
});

describe('Twilio inbound webhook — v2 runner input contract', () => {
  it('passes inboundMessageBody / conversationId / phone (no customerId — runner uses phone for context lookup)', async () => {
    await callPOST({
      From: ALLOWLIST_PHONE,
      Body: INBOUND_BODY,
      MessageSid: 'SM_test_13',
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
    expect(passed.phone).toBe(ALLOWLIST_PHONE);
  });
});
