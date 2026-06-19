/**
 * agent-runner unit tests.
 *
 * Establishes the first Anthropic-SDK mock pattern in this codebase
 * (per discovery doc §F: no existing test mocks the Anthropic SDK).
 * Strategy: mock `@/lib/anthropic/client` at the module boundary so the
 * real SDK never instantiates and `messages.create` is a vi.fn the test
 * drives with `mockResolvedValueOnce(...)`.
 *
 * Inputs to the runner (`getCustomerContext`, `getConversationHistory`)
 * are also mocked at their module boundaries — the runner is the unit
 * under test, not the DB layer.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mocks ---------------------------------------------------------------

const messagesCreateMock = vi.fn();

vi.mock('@/lib/anthropic/client', () => ({
  MODELS: { SONNET: 'claude-sonnet-4-6', HAIKU: 'claude-haiku-4-5' },
  getAnthropicClient: () => ({
    messages: { create: messagesCreateMock },
  }),
}));

const getCustomerContextMock = vi.fn();
vi.mock('@/lib/services/customer-context', () => ({
  getCustomerContext: (...args: unknown[]) => getCustomerContextMock(...args),
}));

const getConversationHistoryMock = vi.fn();
vi.mock('@/lib/services/conversation-history', () => ({
  getConversationHistory: (...args: unknown[]) =>
    getConversationHistoryMock(...args),
}));

const dispatchToolMock = vi.fn();
const resetDispatcherMock = vi.fn();
vi.mock('@/lib/sms-ai/tool-dispatcher', () => ({
  dispatchTool: (...args: unknown[]) => dispatchToolMock(...args),
  // Post-Workstream-J-S2: reset accepts a RuntimeContext object — forward
  // all args to the mock so tests can assert on the runtime phone +
  // conversationId that flow through.
  __resetForAgentRun: (...args: unknown[]) => resetDispatcherMock(...args),
}));

// Import the runner AFTER mocks so the vi.mock factories win.
import { runSmsAiV2Agent } from '@/lib/sms-ai/agent-runner';

// ---- helpers -------------------------------------------------------------

function emptyCustomerContext() {
  return {
    customer: null,
    vehicles: [],
    upcoming_appointments: [],
    recent_quotes: [],
    recent_transactions: [],
    pending_addons: [],
    conversation_history: [],
  };
}

function endTurnMessage(text: string) {
  return {
    id: 'msg_end',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      {
        type: 'text',
        text,
        citations: null,
      },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

function toolUseMessage(toolUseId: string, toolName: string, input: unknown) {
  return {
    id: `msg_tu_${toolUseId}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      {
        type: 'tool_use',
        id: toolUseId,
        name: toolName,
        input,
      },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

const BASE_INPUT = {
  inboundMessageBody: 'How much for a wax on my Camry?',
  conversationId: 'conv-123',
  phone: '+14245551234',
  businessName: 'Smart Details Auto Spa',
  businessHours: 'Mon–Fri 9–6',
  currentDate: '2026-05-19',
};

beforeEach(() => {
  messagesCreateMock.mockReset();
  getCustomerContextMock.mockReset();
  getConversationHistoryMock.mockReset();
  dispatchToolMock.mockReset();
  resetDispatcherMock.mockReset();

  // Sensible defaults — each test overrides what it needs.
  getCustomerContextMock.mockResolvedValue(emptyCustomerContext());
  getConversationHistoryMock.mockResolvedValue([]);
  dispatchToolMock.mockResolvedValue({
    content: 'Tool dispatch not yet implemented (Layer 3b)',
    isError: true,
  });
});

// ---- tests ---------------------------------------------------------------

describe('runSmsAiV2Agent — happy path', () => {
  it('returns end_turn text on first inference when stop_reason is end_turn', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      endTurnMessage('Hey — a hand wax on a Camry is $25. Want to book?'),
    );

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(result.stopReason).toBe('end_turn');
    expect(result.iterations).toBe(1);
    expect(result.assistantText).toContain('hand wax');
    expect(result.toolCalls).toEqual([]);
    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
  });
});

describe('runSmsAiV2Agent — tool round-trip', () => {
  it('dispatches one tool_use, feeds tool_result, then returns end_turn text on iteration 2', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_1', 'lookup_customer', { phone: '+14245551234' }),
      )
      .mockResolvedValueOnce(endTurnMessage('Found you. What service?'));

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(result.stopReason).toBe('end_turn');
    expect(result.iterations).toBe(2);
    expect(result.assistantText).toBe('Found you. What service?');
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe('lookup_customer');
    expect(result.toolCalls[0].toolUseId).toBe('toolu_1');
    expect(result.toolCalls[0].isError).toBe(true);
    expect(dispatchToolMock).toHaveBeenCalledTimes(1);
    expect(dispatchToolMock).toHaveBeenCalledWith({
      name: 'lookup_customer',
      input: { phone: '+14245551234' },
    });
  });
});

describe('runSmsAiV2Agent — iteration cap', () => {
  it('forces a final tools-omitted call after 6 tool_use round-trips and returns stopReason=max_iterations', async () => {
    // 6 consecutive tool_use responses + 1 forced final = 7 SDK calls.
    for (let i = 0; i < 6; i += 1) {
      messagesCreateMock.mockResolvedValueOnce(
        toolUseMessage(`toolu_${i + 1}`, 'lookup_customer', { tick: i }),
      );
    }
    messagesCreateMock.mockResolvedValueOnce(
      endTurnMessage('Sorry — I need to grab someone for you. Give us a few minutes.'),
    );

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(result.stopReason).toBe('max_iterations');
    expect(result.iterations).toBe(6);
    expect(messagesCreateMock).toHaveBeenCalledTimes(7);
    expect(result.toolCalls).toHaveLength(6);

    // The forced final call must omit the `tools` parameter so the model
    // is constrained to text-only output.
    const forcedCall = messagesCreateMock.mock.calls[6][0];
    expect(forcedCall.tools).toBeUndefined();

    // …and the assembled message list must contain the iteration-cap nudge
    // as the trailing user message before the forced call.
    const trailing = forcedCall.messages[forcedCall.messages.length - 1];
    expect(trailing.role).toBe('user');
    expect(String(trailing.content)).toContain('Tool budget exhausted');

    expect(result.assistantText).toContain('grab someone');
  });
});

describe('runSmsAiV2Agent — prompt caching wire shape', () => {
  it('passes system prompt as array with cache_control ephemeral on the first call', async () => {
    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const firstCall = messagesCreateMock.mock.calls[0][0];
    expect(Array.isArray(firstCall.system)).toBe(true);
    expect(firstCall.system).toHaveLength(1);
    expect(firstCall.system[0].type).toBe('text');
    expect(firstCall.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(typeof firstCall.system[0].text).toBe('string');
    expect(firstCall.system[0].text.length).toBeGreaterThan(0);
  });
});

describe('runSmsAiV2Agent — {CUSTOMER_CONTEXT} substitution', () => {
  it('replaces the placeholder with a rendered customer bundle in the cached system block', async () => {
    getCustomerContextMock.mockResolvedValue({
      customer: {
        id: 'cust-1',
        first_name: 'Grace',
        last_name: 'Hopper',
        phone: '+14245551234',
        email: 'grace@example.com',
        loyalty_points_balance: 42,
        is_ai_enabled: true,
        sms_consent: true,
      },
      vehicles: [
        {
          id: 'veh-1',
          vehicle_type: 'automobile',
          size_class: 'sedan',
          year: 2020,
          make: 'Honda',
          model: 'Accord',
          color: 'silver',
        },
      ],
      upcoming_appointments: [],
      recent_quotes: [],
      recent_transactions: [],
      pending_addons: [],
      conversation_history: [],
    });

    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const systemText = messagesCreateMock.mock.calls[0][0].system[0].text;
    // The placeholder MUST be gone (substituted, not left literal).
    expect(systemText).not.toContain('{CUSTOMER_CONTEXT}');
    // …and the rendered bundle MUST be visible inside the system block.
    expect(systemText).toContain('Grace Hopper');
    expect(systemText).toContain('Honda');
  });
});

describe('runSmsAiV2Agent — API error handling', () => {
  it('returns stopReason=api_error with errorMessage when the SDK throws', async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error('rate limited'));

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(result.stopReason).toBe('api_error');
    expect(result.assistantText).toBeNull();
    expect(result.errorMessage).toContain('rate limited');
    expect(result.toolCalls).toEqual([]);
  });
});

describe('runSmsAiV2Agent — unknown stop_reason', () => {
  it('returns stopReason=unknown with null assistantText on max_tokens stop', async () => {
    messagesCreateMock.mockResolvedValueOnce({
      id: 'msg_x',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-4-6',
      content: [{ type: 'text', text: 'truncated...', citations: null }],
      stop_reason: 'max_tokens',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(result.stopReason).toBe('unknown');
    expect(result.assistantText).toBeNull();
    expect(result.iterations).toBe(1);
  });
});

describe('runSmsAiV2Agent — conversation history mapping', () => {
  it('drops sender_type=system messages and maps customer→user / staff+ai→assistant', async () => {
    getConversationHistoryMock.mockResolvedValue([
      {
        id: 'm1',
        sender_type: 'customer',
        direction: 'inbound',
        body: 'Old question',
        channel: 'sms',
        created_at: '2026-05-19T10:00:00Z',
      },
      {
        id: 'm2',
        sender_type: 'system',
        direction: 'outbound',
        body: 'AI turned off banner',
        channel: 'voice',
        created_at: '2026-05-19T10:01:00Z',
      },
      {
        id: 'm3',
        sender_type: 'staff',
        direction: 'outbound',
        body: 'Hey thanks!',
        channel: 'sms',
        created_at: '2026-05-19T10:02:00Z',
      },
      {
        id: 'm4',
        sender_type: 'ai',
        direction: 'outbound',
        body: 'Old AI reply',
        channel: 'sms',
        created_at: '2026-05-19T10:03:00Z',
      },
    ]);

    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const messages = messagesCreateMock.mock.calls[0][0].messages;
    // 3 mapped history messages (system dropped) + the inbound = 4.
    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'user', content: 'Old question' });
    expect(messages[1]).toEqual({ role: 'assistant', content: 'Hey thanks!' });
    expect(messages[2]).toEqual({ role: 'assistant', content: 'Old AI reply' });
    expect(messages[3]).toEqual({
      role: 'user',
      content: BASE_INPUT.inboundMessageBody,
    });
  });

  it('does NOT re-append the inbound when history already ends with the same user message', async () => {
    getConversationHistoryMock.mockResolvedValue([
      {
        id: 'm1',
        sender_type: 'customer',
        direction: 'inbound',
        body: BASE_INPUT.inboundMessageBody,
        channel: 'sms',
        created_at: '2026-05-19T10:00:00Z',
      },
    ]);

    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const messages = messagesCreateMock.mock.calls[0][0].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      role: 'user',
      content: BASE_INPUT.inboundMessageBody,
    });
  });
});

// Helper: construct a single assistant turn carrying N parallel tool_use
// blocks. The runner dispatches all of them in one `Promise.all` per
// audit §4.3 (independent tools should not serialize).
function multiToolUseMessage(
  blocks: Array<{ id: string; name: string; input: unknown }>,
) {
  return {
    id: 'msg_multi',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: blocks.map((b) => ({
      type: 'tool_use',
      id: b.id,
      name: b.name,
      input: b.input,
    })),
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

describe('runSmsAiV2Agent — parallel tool dispatch (Layer 3b)', () => {
  it('dispatches multiple tool_use blocks concurrently and preserves original order in the user turn', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        multiToolUseMessage([
          { id: 'tu_a', name: 'lookup_customer', input: { phone: '+14245551234' } },
          { id: 'tu_b', name: 'get_services', input: {} },
          { id: 'tu_c', name: 'classify_vehicle', input: { make: 'Honda' } },
        ]),
      )
      .mockResolvedValueOnce(endTurnMessage('all done'));

    // Each tool resolves with a different delay to exercise concurrency.
    // If the runner serialized, total wall-clock would be ~150ms (sum); in
    // parallel it should be ~80ms (max). We assert an upper bound that
    // distinguishes the two regimes.
    const delays: Record<string, number> = {
      lookup_customer: 80,
      get_services: 40,
      classify_vehicle: 60,
    };
    dispatchToolMock.mockImplementation(async ({ name }: { name: string }) => {
      await new Promise((r) => setTimeout(r, delays[name] ?? 0));
      return { content: `${name}:ok`, isError: false };
    });

    const t0 = Date.now();
    const result = await runSmsAiV2Agent(BASE_INPUT);
    const elapsed = Date.now() - t0;

    expect(dispatchToolMock).toHaveBeenCalledTimes(3);
    expect(result.stopReason).toBe('end_turn');
    expect(result.toolCalls.map((c) => c.toolName)).toEqual([
      'lookup_customer',
      'get_services',
      'classify_vehicle',
    ]);
    expect(result.toolCalls.every((c) => c.isError === false)).toBe(true);

    // Wall-clock upper bound: max(delays)=80ms + slack. If serial, would
    // be 80+40+60=180ms minimum. We allow generous slack for CI jitter.
    expect(elapsed).toBeLessThan(180);

    // The user-turn tool_result blocks must be in original tool_use order.
    const secondCall = messagesCreateMock.mock.calls[1][0];
    const userTurn = secondCall.messages[secondCall.messages.length - 1];
    expect(userTurn.role).toBe('user');
    const toolResultIds = (userTurn.content as Array<{ tool_use_id: string }>).map(
      (b) => b.tool_use_id,
    );
    expect(toolResultIds).toEqual(['tu_a', 'tu_b', 'tu_c']);
  });

  it('passes mixed success + failure results through to the next assistant turn intact', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        multiToolUseMessage([
          { id: 'tu_a', name: 'lookup_customer', input: { phone: '+14245551234' } },
          { id: 'tu_b', name: 'get_services', input: {} },
          { id: 'tu_c', name: 'check_availability', input: { date: '2026-05-20' } },
        ]),
      )
      .mockResolvedValueOnce(endTurnMessage('handled mixed results'));

    dispatchToolMock.mockImplementation(async ({ name }: { name: string }) => {
      if (name === 'get_services') return { content: 'svc-err', isError: true };
      return { content: `${name}:ok`, isError: false };
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);
    expect(result.stopReason).toBe('end_turn');
    expect(result.toolCalls).toHaveLength(3);
    const errMap = Object.fromEntries(
      result.toolCalls.map((c) => [c.toolName, c.isError]),
    );
    expect(errMap).toEqual({
      lookup_customer: false,
      get_services: true,
      check_availability: false,
    });

    const userTurn = messagesCreateMock.mock.calls[1][0].messages.at(-1);
    const blocks = userTurn.content as Array<{ tool_use_id: string; is_error: boolean }>;
    expect(blocks.map((b) => [b.tool_use_id, b.is_error])).toEqual([
      ['tu_a', false],
      ['tu_b', true],
      ['tu_c', false],
    ]);
  });

  it('forwards notify_staff input to the dispatcher with the unmapped tool_use payload (mapping happens inside the dispatcher)', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('tu_ns', 'notify_staff', {
          customer_name: 'Grace',
          customer_phone: '+14245551234',
          reason: 'custom_quote',
          details: 'Customer asked about Ferrari ceramic',
        }),
      )
      .mockResolvedValueOnce(endTurnMessage('Got it — staff will follow up.'));

    dispatchToolMock.mockResolvedValueOnce({
      content: '{"success":true,"recipientsNotified":2}',
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);
    expect(result.stopReason).toBe('end_turn');
    expect(dispatchToolMock).toHaveBeenCalledWith({
      name: 'notify_staff',
      input: {
        customer_name: 'Grace',
        customer_phone: '+14245551234',
        reason: 'custom_quote',
        details: 'Customer asked about Ferrari ceramic',
      },
    });
    expect(result.toolCalls[0].isError).toBe(false);
  });

  it('resets the dispatcher Bearer-key cache once per agent run', async () => {
    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));
    await runSmsAiV2Agent(BASE_INPUT);
    expect(resetDispatcherMock).toHaveBeenCalledTimes(1);
  });

  it('forwards runtime phone + conversationId into the dispatcher reset (Workstream J S2)', async () => {
    // Phone-injection contract: the runner must hand the dispatcher the
    // phone and conversationId at the start of every inbound so phone-
    // bearing tools can supply them server-side without the LLM ever
    // seeing the value.
    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));
    await runSmsAiV2Agent(BASE_INPUT);
    expect(resetDispatcherMock).toHaveBeenCalledWith({
      phone: BASE_INPUT.phone,
      conversationId: BASE_INPUT.conversationId,
    });
  });
});

// ---------------------------------------------------------------------------
// Layer 3c — pending_addons rendering + approve/decline end-to-end
// ---------------------------------------------------------------------------

const SAMPLE_ADDON_ID = 'b5e1c9a2-1234-4abc-9def-0123456789ab';

function makePendingAddon(overrides: Partial<{
  id: string;
  job_id: string;
  service_name: string | null;
  message_to_customer: string | null;
  price_cents: number;
  discount_amount_cents: number;
  pickup_delay_minutes: number;
  expires_at: string;
  sent_at: string | null;
}> = {}) {
  return {
    id: SAMPLE_ADDON_ID,
    job_id: 'job-1',
    service_name: 'Headlight Restoration',
    message_to_customer: 'We noticed haze on the headlights — want us to restore?',
    price_cents: 7500,
    discount_amount_cents: 0,
    pickup_delay_minutes: 30,
    expires_at: '2026-05-19T18:00:00.000Z',
    sent_at: '2026-05-19T15:00:00.000Z',
    ...overrides,
  };
}

describe('runSmsAiV2Agent — pending_addons context rendering', () => {
  it('renders the PENDING ADDON AUTHORIZATIONS section with the full UUID', async () => {
    getCustomerContextMock.mockResolvedValue({
      ...emptyCustomerContext(),
      customer: {
        id: 'cust-1',
        first_name: 'Grace',
        last_name: 'Hopper',
        phone: '+14245551234',
        email: null,
        loyalty_points_balance: 0,
        is_ai_enabled: true,
        sms_consent: true,
      },
      pending_addons: [makePendingAddon()],
    });
    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const systemText = messagesCreateMock.mock.calls[0][0].system[0].text;
    expect(systemText).toContain('PENDING ADDON AUTHORIZATIONS:');
    expect(systemText).toContain(SAMPLE_ADDON_ID);
    expect(systemText).toContain('Headlight Restoration');
    expect(systemText).toContain('$75.00');
    expect(systemText).toContain('30 extra min');
    expect(systemText).toContain('Operator message: We noticed haze');
  });

  it('omits the addon section when pending_addons is empty', async () => {
    getCustomerContextMock.mockResolvedValue({
      ...emptyCustomerContext(),
      customer: {
        id: 'cust-1',
        first_name: 'Grace',
        last_name: null,
        phone: '+14245551234',
        email: null,
        loyalty_points_balance: 0,
        is_ai_enabled: true,
        sms_consent: true,
      },
    });
    messagesCreateMock.mockResolvedValueOnce(endTurnMessage('ok'));

    await runSmsAiV2Agent(BASE_INPUT);

    const systemText = messagesCreateMock.mock.calls[0][0].system[0].text;
    expect(systemText).not.toContain('PENDING ADDON AUTHORIZATIONS:');
  });
});

describe('runSmsAiV2Agent — approve_addon / decline_addon end-to-end', () => {
  it('forwards approve_addon tool_use input to the dispatcher unchanged', async () => {
    getCustomerContextMock.mockResolvedValue({
      ...emptyCustomerContext(),
      pending_addons: [makePendingAddon()],
    });
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('tu_app', 'approve_addon', { addon_id: SAMPLE_ADDON_ID }),
      )
      .mockResolvedValueOnce(endTurnMessage("Great — I've let the team know!"));

    dispatchToolMock.mockResolvedValueOnce({
      content: JSON.stringify({
        status: 'approved',
        addon_id: SAMPLE_ADDON_ID,
        message: 'Addon approved. Confirmation SMS sent to customer.',
      }),
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);
    expect(result.stopReason).toBe('end_turn');
    expect(dispatchToolMock).toHaveBeenCalledWith({
      name: 'approve_addon',
      input: { addon_id: SAMPLE_ADDON_ID },
    });
    expect(result.toolCalls[0].isError).toBe(false);
    expect(result.assistantText).toContain('team know');
  });

  it('forwards decline_addon tool_use input to the dispatcher unchanged', async () => {
    getCustomerContextMock.mockResolvedValue({
      ...emptyCustomerContext(),
      pending_addons: [makePendingAddon()],
    });
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('tu_dec', 'decline_addon', { addon_id: SAMPLE_ADDON_ID }),
      )
      .mockResolvedValueOnce(endTurnMessage('Got it — next visit then.'));

    dispatchToolMock.mockResolvedValueOnce({
      content: JSON.stringify({
        status: 'declined',
        addon_id: SAMPLE_ADDON_ID,
        message: 'Addon declined. Confirmation SMS sent to customer.',
      }),
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);
    expect(result.stopReason).toBe('end_turn');
    expect(dispatchToolMock).toHaveBeenCalledWith({
      name: 'decline_addon',
      input: { addon_id: SAMPLE_ADDON_ID },
    });
    expect(result.toolCalls[0].isError).toBe(false);
  });

  it('allows end_turn without forcing a tool call when there are multiple pending addons (ambiguous reply)', async () => {
    // Two pending addons + first response is end_turn (model asks a
    // clarifying question instead of guessing). Runner must not force
    // a tool call; it must surface the end_turn text intact.
    getCustomerContextMock.mockResolvedValue({
      ...emptyCustomerContext(),
      pending_addons: [
        makePendingAddon({ id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
        makePendingAddon({
          id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          service_name: 'Wheel Polish',
        }),
      ],
    });
    messagesCreateMock.mockResolvedValueOnce(
      endTurnMessage(
        "Sure — which one did you mean: the Headlight Restoration or the Wheel Polish?",
      ),
    );

    const result = await runSmsAiV2Agent(BASE_INPUT);
    expect(result.stopReason).toBe('end_turn');
    expect(result.toolCalls).toEqual([]);
    expect(dispatchToolMock).not.toHaveBeenCalled();
    expect(result.assistantText).toContain('which one');
  });
});

// ---------------------------------------------------------------------------
// Issue 35 backstop — noReply retry. When iter ends with stop_reason=end_turn
// and extractText is empty after at least one tool was dispatched (iter > 1),
// the runner retries ONCE with the system NO_REPLY_NUDGE and tools omitted.
// Single retry only; never loops. See docs/dev/ISSUE_35_RUNNER_DIAGNOSTIC.md.
// ---------------------------------------------------------------------------

/** Build an `end_turn` Message with the given content array verbatim. */
function endTurnRaw(content: unknown[]) {
  return {
    id: 'msg_end_raw',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 0 },
  };
}

describe('runSmsAiV2Agent — Issue 35 noReply backstop retry', () => {
  it('NO retry when stop_reason=end_turn and text is non-empty (happy path unchanged)', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_x', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnMessage('Thanks Sarah! What service?'));
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true,"customer_id":"cust-1"}',
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
    expect(result.assistantText).toBe('Thanks Sarah! What service?');
    expect(result.iterations).toBe(2);
    expect(result.stopReason).toBe('end_turn');
  });

  it('NO retry when iter=1 ends with empty content (no tools were dispatched)', async () => {
    // Empty content array on iter 1 — no tool was called. Per spec the
    // retry only triggers when iter > 1, so this should pass through.
    messagesCreateMock.mockResolvedValueOnce(endTurnRaw([]));

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);
    expect(result.iterations).toBe(1);
    expect(result.assistantText).toBe('');
    expect(result.stopReason).toBe('end_turn');
  });

  it('RETRIES once when iter=2 ends with empty content after a tool dispatch', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_y', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnRaw([]))
      .mockResolvedValueOnce(
        endTurnMessage('Thanks Sarah! What can I do for you?'),
      );
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true,"customer_id":"cust-1"}',
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);

    // 2 loop calls + 1 retry = 3 SDK calls
    expect(messagesCreateMock).toHaveBeenCalledTimes(3);
    expect(result.assistantText).toBe('Thanks Sarah! What can I do for you?');
    expect(result.iterations).toBe(2);
    expect(result.stopReason).toBe('end_turn');
  });

  it('RETRIES once when iter=2 returns whitespace-only text after a tool dispatch', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_z', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnMessage('   '))
      .mockResolvedValueOnce(endTurnMessage('Got it Sarah — talk soon.'));
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true}',
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);

    expect(messagesCreateMock).toHaveBeenCalledTimes(3);
    expect(result.assistantText).toBe('Got it Sarah — talk soon.');
  });

  it('retry call omits the `tools` parameter (text-only mode)', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_w', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnRaw([]))
      .mockResolvedValueOnce(endTurnMessage('Hi Sarah! What service today?'));
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true}',
      isError: false,
    });

    await runSmsAiV2Agent(BASE_INPUT);

    // Call 0 (iter 1): tools present
    expect(messagesCreateMock.mock.calls[0][0]).toHaveProperty('tools');
    // Call 1 (iter 2): tools present (loop call)
    expect(messagesCreateMock.mock.calls[1][0]).toHaveProperty('tools');
    // Call 2 (retry): tools MUST be omitted
    expect(messagesCreateMock.mock.calls[2][0]).not.toHaveProperty('tools');
  });

  it('SINGLE retry only — retry produces empty too → returns the original empty result', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_v', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnRaw([])) // iter 2 empty
      .mockResolvedValueOnce(endTurnRaw([])); // retry ALSO empty
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true}',
      isError: false,
    });

    const result = await runSmsAiV2Agent(BASE_INPUT);

    // Exactly 3 SDK calls — no chained retry.
    expect(messagesCreateMock).toHaveBeenCalledTimes(3);
    expect(result.assistantText).toBe('');
    expect(result.iterations).toBe(2);
    expect(result.stopReason).toBe('end_turn');
  });

  it('retry appends the empty assistant response AND the user nudge before the retry call', async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_u', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnRaw([]))
      .mockResolvedValueOnce(endTurnMessage('Hi Sarah! What service?'));
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true}',
      isError: false,
    });

    await runSmsAiV2Agent(BASE_INPUT);

    // The retry call's messages array should end with the empty assistant
    // turn followed by the system nudge as a user turn. The original
    // inbound and the tool round-trip turns precede them.
    const retryMessages = messagesCreateMock.mock.calls[2][0].messages;
    expect(retryMessages.length).toBeGreaterThanOrEqual(4);
    const last = retryMessages[retryMessages.length - 1];
    expect(last.role).toBe('user');
    expect(typeof last.content).toBe('string');
    expect(last.content).toMatch(/previous turn ended without a customer-facing reply/);
    const prev = retryMessages[retryMessages.length - 2];
    expect(prev.role).toBe('assistant');
    // The empty assistant response — content array from the SDK (empty here)
    expect(Array.isArray(prev.content)).toBe(true);
  });

  it('logs the noReply detection AND retry outcome', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    messagesCreateMock
      .mockResolvedValueOnce(
        toolUseMessage('toolu_t', 'upsert_customer', { first_name: 'Sarah' }),
      )
      .mockResolvedValueOnce(endTurnRaw([]))
      .mockResolvedValueOnce(endTurnMessage('Hi Sarah!'));
    dispatchToolMock.mockResolvedValue({
      content: '{"success":true}',
      isError: false,
    });

    await runSmsAiV2Agent(BASE_INPUT);

    const messages = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // Layer 6 (Session #154) — log shapes consolidated. Free-form
    // "noReply detected... retrying with nudge" and
    // "noReply retry conv=... stop=..." → structured event lines.
    // The legacy "done" line (and `noReply_retried=true` flag) was retired:
    // the canonical conversation_close line is emitted by
    // background-dispatch instead, not by the runner.
    expect(messages).toMatch(/event=no_reply_retry conv=conv-123 iter=2/);
    expect(messages).toMatch(/event=no_reply_retry_result conv=conv-123 stop=end_turn chunks=1/);
    logSpy.mockRestore();
  });
});
