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
vi.mock('@/lib/sms-ai/tool-dispatcher', () => ({
  dispatchTool: (...args: unknown[]) => dispatchToolMock(...args),
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
