/**
 * tool-dispatcher (Layer 3b) tests.
 *
 * Pattern: mock `fetch` globally for the 9 HTTP-wrapped tools, mock
 * `@/lib/services/staff-notification` for `notify_staff`, and mock
 * `@/lib/supabase/admin` for the Bearer-key load. Chained-stub pattern
 * for `createAdminClient` matches discovery §F convention.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';

// ---- mocks ---------------------------------------------------------------

// Supabase admin client — Bearer key load (and only that). Driven by
// `apiKeyState` so tests can flip between "configured", "missing", and
// "load threw" cases.
const apiKeyState = {
  value: 'test-voice-agent-key' as string | null,
  shouldThrow: false,
  error: null as { message: string } | null,
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'business_settings') {
        throw new Error(`Unexpected table: ${table}`);
      }
      const chain = {
        select() {
          return chain;
        },
        eq() {
          return chain;
        },
        maybeSingle: async () => {
          if (apiKeyState.shouldThrow) throw new Error('admin client exploded');
          if (apiKeyState.error) return { data: null, error: apiKeyState.error };
          if (apiKeyState.value === null) return { data: null, error: null };
          return { data: { value: apiKeyState.value }, error: null };
        },
      };
      return chain;
    },
  }),
}));

const notifyStaffMock = vi.fn();
vi.mock('@/lib/services/staff-notification', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/staff-notification')>();
  return {
    ...actual,
    notifyStaff: (...args: unknown[]) => notifyStaffMock(...args),
  };
});

const approveAddonMock = vi.fn();
const declineAddonMock = vi.fn();
vi.mock('@/lib/services/job-addons', () => ({
  approveAddon: (...args: unknown[]) => approveAddonMock(...args),
  declineAddon: (...args: unknown[]) => declineAddonMock(...args),
}));

// Import dispatcher AFTER mocks so the vi.mock factories win.
import {
  dispatchTool,
  __resetForAgentRun,
} from '@/lib/sms-ai/tool-dispatcher';

const DEFAULT_TEST_PHONE = '+14245551234';
const DEFAULT_TEST_CONV = 'test-conv-id';

// ---- fetch stubbing ------------------------------------------------------

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

let fetchCalls: FetchCall[] = [];
const fetchMock = vi.fn();

beforeEach(() => {
  fetchCalls = [];
  fetchMock.mockReset();
  notifyStaffMock.mockReset();
  approveAddonMock.mockReset();
  declineAddonMock.mockReset();
  apiKeyState.value = 'test-voice-agent-key';
  apiKeyState.shouldThrow = false;
  apiKeyState.error = null;
  // Default: runtime context set with the canonical test phone so the
  // bulk of tests don't have to re-establish it. Tests exercising the
  // "no context" defensive path override by calling __resetForAgentRun()
  // (no args) after the beforeEach.
  __resetForAgentRun({ phone: DEFAULT_TEST_PHONE, conversationId: DEFAULT_TEST_CONV });
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return fetchMock(url, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---- tests ---------------------------------------------------------------

describe('dispatchTool — unknown tool', () => {
  it('returns isError with no network call when the tool name is unrecognized', async () => {
    const result = await dispatchTool({
      name: 'fictional_tool_xyz',
      input: { whatever: true },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toContain('unknown tool');
    expect(fetchCalls).toHaveLength(0);
  });
});

describe('dispatchTool — routing per tool', () => {
  it('lookup_customer → GET /api/voice-agent/customers?phone=…', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { customer: { id: 'c1' } }));
    const result = await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    expect(result.isError).toBe(false);
    expect(fetchCalls).toHaveLength(1);
    const { url, init } = fetchCalls[0];
    expect(url).toBe('http://localhost:3000/api/voice-agent/customers?phone=%2B14245551234');
    expect(init?.method).toBe('GET');
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-voice-agent-key',
    );
    expect(result.content).toContain('"customer"');
  });

  it('get_services → GET /api/voice-agent/services (no params)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { services: [] }));
    await dispatchTool({ name: 'get_services', input: {} });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/services');
    expect(fetchCalls[0].init?.method).toBe('GET');
  });

  it('classify_vehicle → GET /api/voice-agent/vehicle-classify with make/model/year', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { size_class: 'sedan' }));
    await dispatchTool({
      name: 'classify_vehicle',
      input: { make: 'Honda', model: 'Accord', year: 2020 },
    });
    expect(fetchCalls[0].url).toContain('make=Honda');
    expect(fetchCalls[0].url).toContain('model=Accord');
    expect(fetchCalls[0].url).toContain('year=2020');
  });

  it('check_availability → GET /api/voice-agent/availability with date + optionals', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { slots: [] }));
    await dispatchTool({
      name: 'check_availability',
      input: { date: '2026-05-20', service_id: 'svc-1', expected_day: 'wednesday' },
    });
    const u = fetchCalls[0].url;
    expect(u).toContain('date=2026-05-20');
    expect(u).toContain('service_id=svc-1');
    expect(u).toContain('expected_day=wednesday');
  });

  it('create_appointment → POST /api/voice-agent/appointments with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { appointment_id: 'ap1' }));
    const input = {
      customer_name: 'Grace',
      customer_phone: '+14245551234',
      service_id: 'svc-1',
      date: '2026-05-20',
      time: '10:00',
      vehicle_year: 2020,
      vehicle_make: 'Honda',
      vehicle_model: 'Accord',
    };
    await dispatchTool({ name: 'create_appointment', input });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/appointments');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect((fetchCalls[0].init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(JSON.parse(fetchCalls[0].init?.body as string)).toEqual(input);
  });

  it('send_info_sms → POST /api/voice-agent/send-info-sms with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    const input = { phone: '+14245551234', type: 'store_info' };
    await dispatchTool({ name: 'send_info_sms', input });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/send-info-sms');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].init?.body as string)).toEqual(input);
  });

  it('get_products → GET /api/voice-agent/products (no params)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    await dispatchTool({ name: 'get_products', input: {} });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/products');
    expect(fetchCalls[0].init?.method).toBe('GET');
  });

  it('get_product_details → GET /api/voice-agent/products/details?search=…', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { products: [] }));
    await dispatchTool({ name: 'get_product_details', input: { search: 'ceramic' } });
    expect(fetchCalls[0].url).toBe(
      'http://localhost:3000/api/voice-agent/products/details?search=ceramic',
    );
  });

  it('send_quote_sms → POST /api/voice-agent/send-quote-sms with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { quote_number: 'Q-0123' }));
    const input = {
      phone: '+14245551234',
      services: 'Express Wax, Tire Shine',
      vehicle_make: 'Honda',
    };
    await dispatchTool({ name: 'send_quote_sms', input });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/send-quote-sms');
    expect(JSON.parse(fetchCalls[0].init?.body as string)).toEqual(input);
  });

  it('notify_staff → in-process helper (no fetch call)', async () => {
    notifyStaffMock.mockResolvedValueOnce({
      success: true,
      recipientsNotified: 2,
      errors: [],
    });
    const result = await dispatchTool({
      name: 'notify_staff',
      input: {
        customer_name: 'Grace',
        customer_phone: '+14245551234',
        reason: 'custom_quote',
        details: 'Ferrari quote requested',
      },
    });
    expect(result.isError).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(notifyStaffMock).toHaveBeenCalledTimes(1);
    expect(notifyStaffMock).toHaveBeenCalledWith({
      reason: 'custom_quote',
      customerName: 'Grace',
      customerPhone: '+14245551234',
      details: 'Ferrari quote requested',
      source: 'sms_ai_v2',
    });
    expect(result.content).toContain('"success":true');
    expect(result.content).toContain('"recipientsNotified":2');
  });
});

describe('dispatchTool — missing required inputs', () => {
  it('lookup_customer with empty input → succeeds via runtime phone injection', async () => {
    // Post-Workstream-J-S2: phone always comes from runtime context, not
    // from the LLM. An empty input is no longer an error — the dispatcher
    // injects the conversation's phone server-side.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { customer: { id: 'c1' } }));
    const r = await dispatchTool({ name: 'lookup_customer', input: {} });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toContain('phone=%2B14245551234');
  });

  it('classify_vehicle without make → isError, no network call', async () => {
    const r = await dispatchTool({ name: 'classify_vehicle', input: { model: 'X' } });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('make');
    expect(fetchCalls).toHaveLength(0);
  });

  it('check_availability without date → isError, no network call', async () => {
    const r = await dispatchTool({ name: 'check_availability', input: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('date');
    expect(fetchCalls).toHaveLength(0);
  });

  it('get_product_details without search → isError, no network call', async () => {
    const r = await dispatchTool({ name: 'get_product_details', input: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('search');
    expect(fetchCalls).toHaveLength(0);
  });

  it('notify_staff with invalid reason → isError, helper NOT called', async () => {
    const r = await dispatchTool({
      name: 'notify_staff',
      input: {
        reason: 'not-a-valid-reason',
        customer_name: 'X',
        customer_phone: '+14245551234',
        details: 'y',
      },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('invalid reason');
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });
});

describe('dispatchTool — HTTP failure modes', () => {
  it('returns isError with status code on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'internal' }));
    const r = await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('500');
    expect(r.content).toContain('internal');
  });

  it('returns isError with normalized message on thrown fetch', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down'));
    const r = await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('failed');
    expect(r.content).toContain('network down');
  });
});

describe('dispatchTool — per-tool timeout', () => {
  it('pre-empts a hanging fetch and returns isError with a timeout message', async () => {
    // Mock fetch to honor the AbortController. Resolves only when aborted;
    // otherwise the test would actually wait the full 5s.
    fetchMock.mockImplementationOnce((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const sig = init.signal as AbortSignal | undefined;
        if (sig) {
          sig.addEventListener('abort', () => {
            const e = new Error('Aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }
      });
    });

    vi.useFakeTimers();
    const promise = dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    // Advance just past the 5s lookup_customer budget.
    await vi.advanceTimersByTimeAsync(5100);
    const result = await promise;
    vi.useRealTimers();

    expect(result.isError).toBe(true);
    expect(result.content).toContain('timed out');
    expect(result.content).toContain('5000ms');
  });

  it('pre-empts a hanging in-process notify_staff and returns isError', async () => {
    // Helper never resolves — race against the 10s budget.
    notifyStaffMock.mockImplementationOnce(() => new Promise(() => {}));

    vi.useFakeTimers();
    const promise = dispatchTool({
      name: 'notify_staff',
      input: {
        reason: 'custom_quote',
        customer_name: 'Grace',
        customer_phone: '+14245551234',
        details: 'x',
      },
    });
    await vi.advanceTimersByTimeAsync(10100);
    const result = await promise;
    vi.useRealTimers();

    expect(result.isError).toBe(true);
    expect(result.content).toContain('timed out');
    expect(result.content).toContain('10000ms');
  });
});

describe('dispatchTool — notify_staff result mapping', () => {
  it('serializes the success payload as content + isError:false', async () => {
    notifyStaffMock.mockResolvedValueOnce({
      success: true,
      recipientsNotified: 2,
      errors: [],
    });
    const r = await dispatchTool({
      name: 'notify_staff',
      input: {
        reason: 'transfer_request',
        customer_name: 'X',
        customer_phone: '+14245551234',
        details: 'y',
      },
    });
    expect(r.isError).toBe(false);
    const parsed = JSON.parse(r.content);
    expect(parsed.success).toBe(true);
    expect(parsed.recipientsNotified).toBe(2);
  });

  it('returns isError:true when notifyStaff reports success:false', async () => {
    notifyStaffMock.mockResolvedValueOnce({
      success: false,
      recipientsNotified: 0,
      errors: ['no_recipient_phones'],
      noRecipients: true,
    });
    const r = await dispatchTool({
      name: 'notify_staff',
      input: {
        reason: 'beyond_scope',
        customer_name: 'X',
        customer_phone: '+14245551234',
        details: 'y',
      },
    });
    // Per the contract: notify_staff helper returning {success:false} should
    // bubble up to the model as is_error so it knows the escalation didn't
    // land — model can decide to apologize or try again.
    expect(r.isError).toBe(true);
    expect(r.content).toContain('"success":false');
    expect(r.content).toContain('noRecipients');
  });
});

describe('dispatchTool — Bearer-key load failures', () => {
  it('all HTTP-bound tools fail with a key-load message when business_settings has no key', async () => {
    apiKeyState.value = null;
    const r = await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('voice_agent_api_key not configured');
    expect(fetchCalls).toHaveLength(0);
  });

  it('all HTTP-bound tools fail when admin client throws during key load', async () => {
    apiKeyState.shouldThrow = true;
    const r = await dispatchTool({
      name: 'get_services',
      input: {},
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('voice_agent_api_key not configured');
    expect(fetchCalls).toHaveLength(0);
  });

  it('notify_staff (in-process) still works when key load fails', async () => {
    apiKeyState.value = null;
    notifyStaffMock.mockResolvedValueOnce({
      success: true,
      recipientsNotified: 1,
      errors: [],
    });
    const r = await dispatchTool({
      name: 'notify_staff',
      input: {
        reason: 'custom_quote',
        customer_name: 'X',
        customer_phone: '+14245551234',
        details: 'y',
      },
    });
    expect(r.isError).toBe(false);
    expect(notifyStaffMock).toHaveBeenCalledTimes(1);
  });

  it('strips wrapping JSON quotes from the stored key when reading the Bearer value', async () => {
    // business_settings stores JSONB; values often arrive as the JSON-string
    // form '"key-with-quotes"'. The dispatcher must strip the outer pair.
    apiKeyState.value = '"unwrapped-key"';
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await dispatchTool({ name: 'get_services', input: {} });
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer unwrapped-key',
    );
  });
});

describe('dispatchTool — Bearer-key cache lifecycle', () => {
  it('caches the key across calls within a single agent run', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await dispatchTool({ name: 'get_services', input: {} });
    await dispatchTool({ name: 'get_products', input: {} });
    // Both reads share one cache entry — but we can't directly assert the
    // admin client was hit once vs twice without a counter; instead we
    // verify the per-call Authorization header is consistent (proxy for
    // "cached value reused").
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-voice-agent-key',
    );
    expect((fetchCalls[1].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-voice-agent-key',
    );
  });

  it('__resetForAgentRun clears the cached key so the next call re-reads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await dispatchTool({ name: 'get_services', input: {} });
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-voice-agent-key',
    );

    // Operator rotates the key. Without reset, the new value wouldn't take
    // effect; the reset hook is the contract the runner uses per inbound.
    apiKeyState.value = 'rotated-key';
    __resetForAgentRun({ phone: DEFAULT_TEST_PHONE, conversationId: DEFAULT_TEST_CONV });

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await dispatchTool({ name: 'get_products', input: {} });
    expect((fetchCalls[1].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer rotated-key',
    );
  });
});

// ---------------------------------------------------------------------------
// Layer 3c — approve_addon / decline_addon dispatch
// ---------------------------------------------------------------------------

describe('dispatchTool — approve_addon', () => {
  it('routes to approveAddon helper in-process (no fetch call, no key load)', async () => {
    apiKeyState.value = null; // key load would fail — proves we skip it
    approveAddonMock.mockResolvedValueOnce({ success: true });
    const r = await dispatchTool({
      name: 'approve_addon',
      input: { addon_id: '11111111-1111-1111-1111-111111111111' },
    });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(approveAddonMock).toHaveBeenCalledTimes(1);
    expect(approveAddonMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
    );
    const parsed = JSON.parse(r.content);
    expect(parsed.status).toBe('approved');
    expect(parsed.addon_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('maps expired result to isError:true with status="expired"', async () => {
    approveAddonMock.mockResolvedValueOnce({
      success: false,
      expired: true,
      error: 'Authorization has expired',
    });
    const r = await dispatchTool({
      name: 'approve_addon',
      input: { addon_id: 'addon-expired' },
    });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.status).toBe('expired');
    expect(parsed.addon_id).toBe('addon-expired');
  });

  it('maps generic failure to isError:true with status="failed"', async () => {
    approveAddonMock.mockResolvedValueOnce({
      success: false,
      error: 'Addon not found',
    });
    const r = await dispatchTool({
      name: 'approve_addon',
      input: { addon_id: 'addon-missing' },
    });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.status).toBe('failed');
    expect(parsed.error).toBe('Addon not found');
  });

  it('rejects missing addon_id with isError, helper NOT called', async () => {
    const r = await dispatchTool({ name: 'approve_addon', input: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('addon_id');
    expect(approveAddonMock).not.toHaveBeenCalled();
  });

  it('rejects wrong-type addon_id with isError, helper NOT called', async () => {
    const r = await dispatchTool({
      name: 'approve_addon',
      input: { addon_id: 12345 },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('addon_id');
    expect(approveAddonMock).not.toHaveBeenCalled();
  });

  it('pre-empts a hanging approveAddon with the 10s timeout', async () => {
    approveAddonMock.mockImplementationOnce(() => new Promise(() => {}));
    vi.useFakeTimers();
    const promise = dispatchTool({
      name: 'approve_addon',
      input: { addon_id: 'addon-1' },
    });
    await vi.advanceTimersByTimeAsync(10100);
    const r = await promise;
    vi.useRealTimers();
    expect(r.isError).toBe(true);
    expect(r.content).toContain('timed out');
    expect(r.content).toContain('10000ms');
  });
});

describe('dispatchTool — decline_addon', () => {
  it('routes to declineAddon helper in-process (no fetch call)', async () => {
    declineAddonMock.mockResolvedValueOnce({ success: true });
    const r = await dispatchTool({
      name: 'decline_addon',
      input: { addon_id: 'addon-1' },
    });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(declineAddonMock).toHaveBeenCalledTimes(1);
    expect(declineAddonMock).toHaveBeenCalledWith('addon-1');
    const parsed = JSON.parse(r.content);
    expect(parsed.status).toBe('declined');
    expect(parsed.addon_id).toBe('addon-1');
  });

  it('maps generic failure to isError:true with status="failed"', async () => {
    declineAddonMock.mockResolvedValueOnce({
      success: false,
      error: 'Addon already approved',
    });
    const r = await dispatchTool({
      name: 'decline_addon',
      input: { addon_id: 'addon-1' },
    });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.status).toBe('failed');
    expect(parsed.error).toBe('Addon already approved');
  });

  it('rejects missing addon_id with isError, helper NOT called', async () => {
    const r = await dispatchTool({ name: 'decline_addon', input: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('addon_id');
    expect(declineAddonMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 2 — runtime phone injection
//
// Five tools require phone at the endpoint layer: lookup_customer (query
// string), create_appointment (customer_phone in body), send_info_sms
// (phone in body), send_quote_sms (phone in body), notify_staff
// (customer_phone in-process). For new customers the LLM has no source of
// phone — the system prompt forbids asking on SMS, and customer-context
// has no row to draw from. The dispatcher now reads phone from runtime
// context (set per-inbound by the runner) and OVERRIDES any LLM-provided
// value. The LLM never sees the phone and cannot get it wrong.
// ---------------------------------------------------------------------------

describe('dispatchTool — runtime phone injection (Workstream J Session 2)', () => {
  it('send_quote_sms — injects runtime phone when LLM provides none', async () => {
    // The exact failure mode from 2026-05-23 02:00 AM PST: new-customer
    // run, LLM had no phone to provide, endpoint rejected in <300ms.
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { quote_number: 'Q-0123' }));
    const r = await dispatchTool({
      name: 'send_quote_sms',
      input: { services: 'Express Wax' }, // NO phone — like the failing test
    });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.phone).toBe(DEFAULT_TEST_PHONE);
    expect(body.services).toBe('Express Wax');
  });

  it('send_quote_sms — runtime phone OVERRIDES LLM-provided phone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { quote_number: 'Q-0124' }));
    await dispatchTool({
      name: 'send_quote_sms',
      input: { phone: '+19998887777', services: 'Express Wax' },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.phone).toBe(DEFAULT_TEST_PHONE); // runtime wins
  });

  it('send_info_sms — runtime phone OVERRIDES LLM-provided phone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));
    await dispatchTool({
      name: 'send_info_sms',
      input: { phone: '+19998887777', type: 'store_info' },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.phone).toBe(DEFAULT_TEST_PHONE);
    expect(body.type).toBe('store_info');
  });

  it('create_appointment — runtime phone OVERRIDES LLM-provided customer_phone', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { appointment_id: 'ap1' }));
    await dispatchTool({
      name: 'create_appointment',
      input: {
        customer_name: 'Grace',
        customer_phone: '+19998887777', // LLM's value — should be overridden
        service_id: 'svc-1',
        date: '2026-05-20',
        time: '10:00',
      },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.customer_phone).toBe(DEFAULT_TEST_PHONE);
    expect(body.customer_name).toBe('Grace');
  });

  it('lookup_customer — uses runtime phone in query string regardless of input', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { customer: null }));
    await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+19998887777' }, // LLM's value — should be ignored
    });
    expect(fetchCalls[0].url).toContain('phone=%2B14245551234');
    expect(fetchCalls[0].url).not.toContain('9998887777');
  });

  it('notify_staff — runtime phone OVERRIDES LLM-provided customer_phone (audit log integrity)', async () => {
    notifyStaffMock.mockResolvedValueOnce({
      success: true,
      recipientsNotified: 1,
      errors: [],
    });
    await dispatchTool({
      name: 'notify_staff',
      input: {
        customer_name: 'Grace',
        customer_phone: '+19998887777', // LLM's value — should be overridden
        reason: 'custom_quote',
        details: 'Ferrari ceramic',
      },
    });
    expect(notifyStaffMock).toHaveBeenCalledTimes(1);
    expect(notifyStaffMock).toHaveBeenCalledWith({
      reason: 'custom_quote',
      customerName: 'Grace',
      customerPhone: DEFAULT_TEST_PHONE, // runtime wins → audit log lands on correct conversation
      details: 'Ferrari ceramic',
      source: 'sms_ai_v2',
    });
  });
});

describe('dispatchTool — defensive guard when runtime context not set', () => {
  // Production runner always calls __resetForAgentRun({...context}) at the
  // start of every inbound (see agent-runner.ts:259). These tests guard
  // against a regression where a future caller bypasses that contract — or
  // where a test/script invokes the dispatcher directly.

  it('send_quote_sms returns isError with diagnostic message when runtime context not set', async () => {
    __resetForAgentRun(); // explicitly clear
    const r = await dispatchTool({
      name: 'send_quote_sms',
      input: { phone: '+14245551234', services: 'Express Wax' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('lookup_customer returns isError when runtime context not set', async () => {
    __resetForAgentRun();
    const r = await dispatchTool({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('create_appointment returns isError when runtime context not set', async () => {
    __resetForAgentRun();
    const r = await dispatchTool({
      name: 'create_appointment',
      input: {
        customer_name: 'X',
        customer_phone: '+14245551234',
        service_id: 'svc-1',
        date: '2026-05-20',
        time: '10:00',
      },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('send_info_sms returns isError when runtime context not set', async () => {
    __resetForAgentRun();
    const r = await dispatchTool({
      name: 'send_info_sms',
      input: { phone: '+14245551234', type: 'store_info' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('notify_staff returns isError when runtime context not set (helper NOT called)', async () => {
    __resetForAgentRun();
    const r = await dispatchTool({
      name: 'notify_staff',
      input: {
        customer_name: 'X',
        customer_phone: '+14245551234',
        reason: 'custom_quote',
        details: 'y',
      },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(notifyStaffMock).not.toHaveBeenCalled();
  });

  it('non-phone tools (get_services, get_products) succeed without runtime context', async () => {
    // Phone-injection guard only applies to phone-bearing tools.
    __resetForAgentRun();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { services: [] }));
    const r = await dispatchTool({ name: 'get_services', input: {} });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Workstream J Session 3 — upsert_customer dispatch + structured-error
// passthrough
// ---------------------------------------------------------------------------

describe('dispatchTool — upsert_customer (Workstream J Session 3)', () => {
  it('routes to POST /api/voice-agent/customers with JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, customer_id: 'c-new', was_created: true }),
    );
    const r = await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem' },
    });
    expect(r.isError).toBe(false);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/api/voice-agent/customers');
    expect(fetchCalls[0].init?.method).toBe('POST');
    expect((fetchCalls[0].init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect((fetchCalls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-voice-agent-key',
    );
  });

  it('injects runtime phone AND conversation_id into the request body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, customer_id: 'c1' }));
    await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem', email: 'n@example.com' },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.phone).toBe(DEFAULT_TEST_PHONE);
    expect(body.conversation_id).toBe(DEFAULT_TEST_CONV);
    expect(body.first_name).toBe('Nayeem');
    expect(body.email).toBe('n@example.com');
  });

  it('runtime phone OVERRIDES any LLM-provided phone in the input', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, customer_id: 'c1' }));
    await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem', phone: '+19998887777' },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.phone).toBe(DEFAULT_TEST_PHONE);
  });

  it('returns isError with diagnostic message when runtime context not set', async () => {
    __resetForAgentRun(); // clear runtime context
    const r = await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('runtime phone not set');
    expect(fetchCalls).toHaveLength(0);
  });

  it('passes optional customer_type through unchanged', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true, customer_id: 'c1' }));
    await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem', customer_type: 'professional' },
    });
    const body = JSON.parse(fetchCalls[0].init?.body as string);
    expect(body.customer_type).toBe('professional');
  });
});

describe('dispatchTool — structured-error passthrough (Workstream J Session 3)', () => {
  it('returns full JSON body (not truncated snippet) when error carries instructions_for_agent', async () => {
    const payload = {
      error: 'first_name is required',
      missing_fields: ['first_name'],
      instructions_for_agent:
        'You called upsert_customer without a usable first_name. Ask the customer for their first name naturally in the conversation — do not mention this error or any system details to the customer. Once they answer, call upsert_customer again with their first_name.',
      do_not_share_with_customer: true,
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(400, payload));
    const r = await dispatchTool({
      name: 'upsert_customer',
      input: { last_name: 'Khan' },
    });
    expect(r.isError).toBe(true);
    // Full JSON in content — NOT the legacy "Tool call returned 400: …" snippet.
    expect(r.content).not.toMatch(/^Tool call returned/);
    const parsed = JSON.parse(r.content);
    expect(parsed.instructions_for_agent).toContain('Ask the customer for their first name');
    expect(parsed.do_not_share_with_customer).toBe(true);
  });

  it('falls back to legacy snippet format for errors WITHOUT instructions_for_agent', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: 'database down' }));
    const r = await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/^Tool call returned 500/);
    expect(r.content).toContain('database down');
  });

  it('falls back to legacy snippet when response body is not valid JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );
    const r = await dispatchTool({
      name: 'upsert_customer',
      input: { first_name: 'Nayeem' },
    });
    expect(r.isError).toBe(true);
    expect(r.content).toMatch(/^Tool call returned 500/);
  });

  it('applies to other phone-bearing tools too (e.g. send_quote_sms)', async () => {
    // The passthrough lives in voiceAgentFetch — any phone-bearing tool that
    // returns instructions_for_agent gets the full-body treatment.
    const payload = {
      error: 'duplicate_quote',
      instructions_for_agent:
        'A quote was already sent within the last hour. Apologize and offer to send a new one with a different vehicle if relevant.',
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(409, payload));
    const r = await dispatchTool({
      name: 'send_quote_sms',
      input: { services: 'Express Wax' },
    });
    expect(r.isError).toBe(true);
    const parsed = JSON.parse(r.content);
    expect(parsed.instructions_for_agent).toContain('already sent within the last hour');
  });
});
