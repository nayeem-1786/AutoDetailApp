/**
 * background-dispatch tests (Layer 4).
 *
 * Verifies the fire-and-forget wrapper produced by `runV2AgentInBackground`:
 *   - end_turn / max_iterations with text → chunk + send + log per chunk
 *   - api_error / unknown / empty text → no SMS, no log row, error logged
 *   - runner throws → swallowed (never propagates)
 *
 * All upstream helpers mocked at module boundary so the test exercises
 * only the orchestration logic in this file.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---- mocks ---------------------------------------------------------------

const runSmsAiV2AgentMock = vi.fn();
vi.mock('@/lib/sms-ai/agent-runner', () => ({
  runSmsAiV2Agent: (...args: unknown[]) => runSmsAiV2AgentMock(...args),
}));

const sendSmsMock = vi.fn();
const splitSmsMessageMock = vi.fn();
vi.mock('@/lib/utils/sms', () => ({
  sendSms: (...args: unknown[]) => sendSmsMock(...args),
  splitSmsMessage: (msg: string, max?: number) => splitSmsMessageMock(msg, max),
}));

const getBusinessInfoMock = vi.fn();
vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: () => getBusinessInfoMock(),
}));

const getBusinessHoursMock = vi.fn();
vi.mock('@/lib/data/business-hours', () => ({
  getBusinessHours: () => getBusinessHoursMock(),
  formatBusinessHoursText: () => 'Mon–Fri 9–6, Sat 10–4, Sun closed',
}));

// In-memory record of all admin client writes so tests can assert on shape.
interface InsertedRow {
  table: string;
  values: Record<string, unknown>;
}
interface UpdatedRow {
  table: string;
  values: Record<string, unknown>;
  eqCol: string;
  eqValue: unknown;
}
interface PgError {
  code?: string;
  message: string;
  details?: string;
}
let inserts: InsertedRow[] = [];
let updates: UpdatedRow[] = [];
// Per-test error injection queues — tests that need to simulate a PG-side
// CHECK violation or other supabase error push entries here. FIFO drain;
// `null` (or empty queue) means the operation succeeds.
let insertErrorQueue: Array<PgError | null> = [];
let updateErrorQueue: Array<PgError | null> = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        insert(values: Record<string, unknown>) {
          inserts.push({ table, values });
          const nextError = insertErrorQueue.shift() ?? null;
          return Promise.resolve({ data: null, error: nextError });
        },
        update(values: Record<string, unknown>) {
          const sub = {
            eq(col: string, value: unknown) {
              updates.push({ table, values, eqCol: col, eqValue: value });
              const nextError = updateErrorQueue.shift() ?? null;
              return Promise.resolve({ data: null, error: nextError });
            },
          };
          return sub;
        },
      };
      return chain;
    },
  }),
}));

// Import AFTER mocks so the vi.mock factories win.
import { runV2AgentInBackground } from '@/lib/sms-ai/background-dispatch';

// ---- helpers -------------------------------------------------------------

const BASE_INPUT = {
  inboundMessageBody: 'how much for a wax?',
  conversationId: 'conv-1',
  phone: '+14245551234',
};

function endTurnResult(text: string | null) {
  return {
    assistantText: text,
    iterations: 1,
    stopReason: 'end_turn' as const,
    toolCalls: [],
  };
}

function apiErrorResult(message = 'rate limited') {
  return {
    assistantText: null,
    iterations: 1,
    stopReason: 'api_error' as const,
    toolCalls: [],
    errorMessage: message,
  };
}

function maxIterationsResult(text: string | null) {
  return {
    assistantText: text,
    iterations: 6,
    stopReason: 'max_iterations' as const,
    toolCalls: [],
  };
}

function unknownStopResult() {
  return {
    assistantText: null,
    iterations: 1,
    stopReason: 'unknown' as const,
    toolCalls: [],
  };
}

beforeEach(() => {
  runSmsAiV2AgentMock.mockReset();
  sendSmsMock.mockReset();
  splitSmsMessageMock.mockReset();
  getBusinessInfoMock.mockReset();
  getBusinessHoursMock.mockReset();
  inserts = [];
  updates = [];
  insertErrorQueue = [];
  updateErrorQueue = [];

  // Sensible defaults; tests override what they need.
  getBusinessInfoMock.mockResolvedValue({ name: 'Smart Details Auto Spa' });
  getBusinessHoursMock.mockResolvedValue({
    monday: { open: '09:00', close: '18:00' },
  });
  splitSmsMessageMock.mockImplementation((msg: string) => [msg]);
  sendSmsMock.mockResolvedValue({ success: true, sid: 'SMxxx' });
});

// ---- tests ---------------------------------------------------------------

describe('runV2AgentInBackground — happy path', () => {
  it('on end_turn + text: chunks, sends each chunk, inserts outbound rows with sms channel (schema-compliant)', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('Hey! That wax is $25.'));

    await runV2AgentInBackground(BASE_INPUT);

    expect(runSmsAiV2AgentMock).toHaveBeenCalledTimes(1);
    expect(splitSmsMessageMock).toHaveBeenCalledWith('Hey! That wax is $25.', undefined);
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith('+14245551234', 'Hey! That wax is $25.');

    const messageInserts = inserts.filter((r) => r.table === 'messages');
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0].values).toMatchObject({
      conversation_id: 'conv-1',
      direction: 'outbound',
      body: 'Hey! That wax is $25.',
      sender_type: 'ai',
      // CHECK constraint `messages_channel_check` allows ('sms', 'voice') only.
      // v2 outbounds use 'sms' to match legacy — agent identity comes from
      // sender_type='ai'.
      channel: 'sms',
      status: 'sent',
      twilio_sid: 'SMxxx',
    });

    const convUpdates = updates.filter((r) => r.table === 'conversations');
    expect(convUpdates).toHaveLength(1);
    expect(convUpdates[0].eqCol).toBe('id');
    expect(convUpdates[0].eqValue).toBe('conv-1');
    expect(convUpdates[0].values).toHaveProperty('last_message_at');
    expect(convUpdates[0].values).toHaveProperty('last_message_preview');
  });

  it('passes businessName / businessHours / currentDate to the runner from internal lookups', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('ok'));
    getBusinessInfoMock.mockResolvedValueOnce({ name: 'Acme Detail Co' });

    await runV2AgentInBackground(BASE_INPUT);

    expect(runSmsAiV2AgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inboundMessageBody: 'how much for a wax?',
        conversationId: 'conv-1',
        phone: '+14245551234',
        businessName: 'Acme Detail Co',
        businessHours: 'Mon–Fri 9–6, Sat 10–4, Sun closed',
        currentDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
  });

  it('on max_iterations + text: still sends the forced final reply', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(
      maxIterationsResult('Sorry — let me grab someone for you.'),
    );

    await runV2AgentInBackground(BASE_INPUT);

    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledWith(
      '+14245551234',
      'Sorry — let me grab someone for you.',
    );
    expect(inserts.filter((r) => r.table === 'messages')).toHaveLength(1);
  });

  it('invokes splitSmsMessage to chunk long output (2 chunks → 2 sends + 2 logs)', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(
      endTurnResult('long reply that crosses the segment boundary'),
    );
    splitSmsMessageMock.mockImplementationOnce(() => [
      'first chunk',
      'second chunk',
    ]);

    await runV2AgentInBackground(BASE_INPUT);

    expect(splitSmsMessageMock).toHaveBeenCalledTimes(1);
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(sendSmsMock.mock.calls.map((c) => c[1])).toEqual([
      'first chunk',
      'second chunk',
    ]);

    const messageInserts = inserts.filter((r) => r.table === 'messages');
    expect(messageInserts).toHaveLength(2);
    expect(messageInserts.map((r) => r.values.body)).toEqual([
      'first chunk',
      'second chunk',
    ]);
  });
});

describe('runV2AgentInBackground — no-reply paths', () => {
  it('on api_error: does NOT send SMS, does NOT insert messages, completes without throwing', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(apiErrorResult('rate limited'));

    await runV2AgentInBackground(BASE_INPUT);

    expect(sendSmsMock).not.toHaveBeenCalled();
    expect(splitSmsMessageMock).not.toHaveBeenCalled();
    expect(inserts.filter((r) => r.table === 'messages')).toHaveLength(0);
    expect(updates.filter((r) => r.table === 'conversations')).toHaveLength(0);
  });

  it('on unknown stop_reason: does NOT send SMS', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(unknownStopResult());
    await runV2AgentInBackground(BASE_INPUT);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('on end_turn with empty assistantText: does NOT send SMS', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('   '));
    await runV2AgentInBackground(BASE_INPUT);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });

  it('on end_turn with null assistantText: does NOT send SMS', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult(null));
    await runV2AgentInBackground(BASE_INPUT);
    expect(sendSmsMock).not.toHaveBeenCalled();
  });
});

describe('runV2AgentInBackground — never throws', () => {
  it('swallows a runner rejection and logs it (no propagation)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockRejectedValueOnce(new Error('SDK exploded'));

    await expect(runV2AgentInBackground(BASE_INPUT)).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('[SmsAiV2 background]');
    expect(logged).toContain('SDK exploded');
    errorSpy.mockRestore();
  });

  it('swallows getBusinessInfo throws (falls back to default name) and still runs the agent', async () => {
    getBusinessInfoMock.mockRejectedValueOnce(new Error('DB unreachable'));
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('hi'));

    await expect(runV2AgentInBackground(BASE_INPUT)).resolves.toBeUndefined();

    expect(runSmsAiV2AgentMock).toHaveBeenCalledTimes(1);
    const passed = runSmsAiV2AgentMock.mock.calls[0][0];
    expect(passed.businessName).toBe('Smart Details Auto Spa');
  });

  it('swallows getBusinessHours throws (uses placeholder) and still runs the agent', async () => {
    getBusinessHoursMock.mockRejectedValueOnce(new Error('hours unreachable'));
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('hi'));

    await runV2AgentInBackground(BASE_INPUT);

    expect(runSmsAiV2AgentMock).toHaveBeenCalledTimes(1);
    const passed = runSmsAiV2AgentMock.mock.calls[0][0];
    expect(passed.businessHours).toBe('Hours unavailable');
  });
});

describe('runV2AgentInBackground — outbound row contract', () => {
  it('records failed sendSms as status=failed with null twilio_sid', async () => {
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('Hi'));
    sendSmsMock.mockResolvedValueOnce({ success: false, error: 'Twilio down' });

    await runV2AgentInBackground(BASE_INPUT);

    const messageInserts = inserts.filter((r) => r.table === 'messages');
    expect(messageInserts).toHaveLength(1);
    expect(messageInserts[0].values).toMatchObject({
      status: 'failed',
      twilio_sid: null,
      channel: 'sms',
    });
  });
});

// ---------------------------------------------------------------------------
// Regression suite — PG-side INSERT/UPDATE errors must be logged loudly.
//
// Pre-fix bug (2026-05-20): supabase-js does NOT throw on PG CHECK violations
// — it resolves with { data, error }. The dispatcher previously discarded
// the `error` field on its bare `await admin.from(...).insert(...)`, so an
// `messages_channel_check` violation silently dropped the row and only
// surfaced as "customer got SMS but no AI bubble in admin UI". This suite
// pins the new error-checked path: SMS still sends, dispatcher does NOT
// throw, error is logged with code+message+details, the chunk loop
// continues to subsequent chunks rather than aborting.
// ---------------------------------------------------------------------------

describe('runV2AgentInBackground — PG INSERT errors are logged (not swallowed)', () => {
  it('logs the supabase error from messages INSERT (code + message + details) without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('Hi there!'));
    insertErrorQueue = [
      {
        code: '23514',
        message:
          'new row for relation "messages" violates check constraint "messages_channel_check"',
        details: 'Failing row contains (..., sms_ai, ...).',
      },
    ];

    await expect(runV2AgentInBackground(BASE_INPUT)).resolves.toBeUndefined();

    // Customer-facing send fired BEFORE the failed audit-log INSERT
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    // INSERT was attempted (and PG rejected it)
    expect(inserts.filter((r) => r.table === 'messages')).toHaveLength(1);

    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(/\[SmsAiV2 background\] message INSERT failed/);
    expect(logged).toMatch(/code=23514/);
    expect(logged).toMatch(/messages_channel_check/);
    expect(logged).toMatch(/details=Failing row contains/);
    errorSpy.mockRestore();
  });

  it('continues to subsequent chunks when one INSERT fails (no chunk-loop abort)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('long reply'));
    splitSmsMessageMock.mockImplementationOnce(() => ['chunk one', 'chunk two']);
    insertErrorQueue = [
      { code: '23514', message: 'CHECK violation', details: undefined },
      null, // second INSERT succeeds
    ];

    await runV2AgentInBackground(BASE_INPUT);

    // Both chunks sent to the customer regardless of audit-log failures
    expect(sendSmsMock).toHaveBeenCalledTimes(2);
    expect(inserts.filter((r) => r.table === 'messages')).toHaveLength(2);

    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    // Only the first chunk's INSERT failure is logged
    const matches = logged.match(/message INSERT failed/g) ?? [];
    expect(matches).toHaveLength(1);
    errorSpy.mockRestore();
  });

  it('logs the supabase error from conversations UPDATE without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('Hello'));
    updateErrorQueue = [
      {
        code: '23505',
        message: 'duplicate key value',
        details: 'irrelevant; just verifying the log path',
      },
    ];

    await expect(runV2AgentInBackground(BASE_INPUT)).resolves.toBeUndefined();

    // INSERT path still ran (delivery-first ordering preserved)
    expect(sendSmsMock).toHaveBeenCalledTimes(1);
    expect(inserts.filter((r) => r.table === 'messages')).toHaveLength(1);
    // UPDATE was attempted (and the mock returned an error)
    expect(updates.filter((r) => r.table === 'conversations')).toHaveLength(1);

    const logged = errorSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toMatch(
      /\[SmsAiV2 background\] conversation UPDATE failed/,
    );
    expect(logged).toMatch(/code=23505/);
    expect(logged).toMatch(/duplicate key value/);
    errorSpy.mockRestore();
  });
});
