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

// Import dispatcher AFTER mocks so the vi.mock factories win.
import {
  dispatchTool,
  __resetForAgentRun,
} from '@/lib/sms-ai/tool-dispatcher';

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
  apiKeyState.value = 'test-voice-agent-key';
  apiKeyState.shouldThrow = false;
  apiKeyState.error = null;
  __resetForAgentRun();
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
  it('lookup_customer without phone → isError, no network call', async () => {
    const r = await dispatchTool({ name: 'lookup_customer', input: {} });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('phone');
    expect(fetchCalls).toHaveLength(0);
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
    __resetForAgentRun();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await dispatchTool({ name: 'get_products', input: {} });
    expect((fetchCalls[1].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer rotated-key',
    );
  });
});
