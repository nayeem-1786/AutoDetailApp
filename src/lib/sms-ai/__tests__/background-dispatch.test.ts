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

// Layer 6 (Session #154) — helpers now include the required `cacheStats` +
// `promptSource` fields the runner sets on every `RunAgentResult`. Each
// helper takes optional overrides so tests can inject realistic cache /
// source / error_class values when asserting on the conversation_close line.
interface RunAgentResultOverrides {
  cacheStats?: { reads: number; creates: number };
  promptSource?: 'db' | 'fallback';
  errorClass?:
    | 'api_error'
    | 'max_iterations'
    | 'unknown_stop'
    | 'no_reply'
    | 'dispatch_thrown';
}

function endTurnResult(text: string | null, overrides: RunAgentResultOverrides = {}) {
  return {
    assistantText: text,
    iterations: 1,
    stopReason: 'end_turn' as const,
    toolCalls: [],
    cacheStats: overrides.cacheStats ?? { reads: 0, creates: 0 },
    promptSource: overrides.promptSource ?? ('db' as const),
    errorClass: overrides.errorClass,
  };
}

function apiErrorResult(message = 'rate limited', overrides: RunAgentResultOverrides = {}) {
  return {
    assistantText: null,
    iterations: 1,
    stopReason: 'api_error' as const,
    toolCalls: [],
    errorMessage: message,
    cacheStats: overrides.cacheStats ?? { reads: 0, creates: 0 },
    promptSource: overrides.promptSource ?? ('db' as const),
    errorClass: 'api_error' as const,
  };
}

function maxIterationsResult(text: string | null, overrides: RunAgentResultOverrides = {}) {
  return {
    assistantText: text,
    iterations: 6,
    stopReason: 'max_iterations' as const,
    toolCalls: [],
    cacheStats: overrides.cacheStats ?? { reads: 0, creates: 0 },
    promptSource: overrides.promptSource ?? ('db' as const),
    errorClass: 'max_iterations' as const,
  };
}

function unknownStopResult(overrides: RunAgentResultOverrides = {}) {
  return {
    assistantText: null,
    iterations: 1,
    stopReason: 'unknown' as const,
    toolCalls: [],
    cacheStats: overrides.cacheStats ?? { reads: 0, creates: 0 },
    promptSource: overrides.promptSource ?? ('db' as const),
    errorClass: 'unknown_stop' as const,
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
    // Layer 6 (Session #154) — `[SmsAiV2 background]` prefix retired;
    // dispatch_thrown now emits under `[SmsAiV2]` with structured event.
    expect(logged).toContain('[SmsAiV2]');
    expect(logged).toMatch(/event=dispatch_thrown/);
    expect(logged).toMatch(/error_class=dispatch_thrown/);
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
    // Layer 6 (Session #154) — `[SmsAiV2 background] message INSERT failed`
    // → `[SmsAiV2] event=message_insert_error ...` structured form.
    expect(logged).toMatch(/\[SmsAiV2\] event=message_insert_error/);
    expect(logged).toMatch(/code=23514/);
    expect(logged).toMatch(/messages_channel_check/);
    expect(logged).toMatch(/details="?Failing row contains/);
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
    // Layer 6 (Session #154) — match the new structured event verb.
    const matches = logged.match(/event=message_insert_error/g) ?? [];
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
    // Layer 6 (Session #154) — `[SmsAiV2 background] conversation UPDATE failed`
    // → `[SmsAiV2] event=conversation_update_error ...` structured form.
    expect(logged).toMatch(/\[SmsAiV2\] event=conversation_update_error/);
    expect(logged).toMatch(/code=23505/);
    expect(logged).toMatch(/duplicate key value/);
    errorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Regression suite — conversation_close line shape (Layer 6 / Session #154).
//
// `[SmsAiV2] event=conversation_close ...` is the SINGLE canonical close
// line for every v2 inbound. Pre-Layer-6, the runner emitted a "done" line
// AND background-dispatch emitted a separate close line — operator had to
// correlate two lines to answer "did v2 reply." Layer 6 consolidated to ONE.
//
// Hard cap: 11 fields (PM2-tail readability ceiling — see observability.ts
// header). Test pins:
//   1. Line emits on success paths
//   2. Line emits on no-reply paths
//   3. Line emits with error_class on error paths (e.g. api_error)
//   4. cache_reads / cache_creates field names + values come from RunAgentResult.cacheStats
//   5. prompt_source field comes from RunAgentResult.promptSource
//   6. reply_sent is true when at least one chunk reaches Twilio
//   7. reply_sent is false when sendSms fails on ALL chunks
//   8. total_ms is a non-negative integer (wall-clock from runV2AgentInBackground entry)
//   9. The dispatch_thrown branch emits TWO lines (split for 11-field cap)
//
// Each assertion is a `toMatch(/key=value/)` so a future field reordering
// inside formatLogFields does NOT break the test (positional order is
// stable per JS object-literal insertion order, but the test doesn't depend
// on that).
// ---------------------------------------------------------------------------

describe('runV2AgentInBackground — conversation_close line shape (Layer 6 / Session #154)', () => {
  it('emits one [SmsAiV2] event=conversation_close line on a successful end_turn reply', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(
      endTurnResult('Sure — wax is $25!', {
        cacheStats: { reads: 3200, creates: 0 },
        promptSource: 'db',
      }),
    );

    await runV2AgentInBackground(BASE_INPUT);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const close = lines.find((l) => l.includes('event=conversation_close'));
    expect(close).toBeDefined();
    // 10 fields on success (no error_class)
    expect(close).toMatch(/\[SmsAiV2\] event=conversation_close/);
    expect(close).toMatch(/conv=conv-1/);
    expect(close).toMatch(/total_ms=\d+/);
    expect(close).toMatch(/iters=1/);
    expect(close).toMatch(/stop=end_turn/);
    expect(close).toMatch(/tool_calls=0/);
    expect(close).toMatch(/chunks=1/);
    expect(close).toMatch(/reply_sent=true/);
    expect(close).toMatch(/prompt_source=db/);
    expect(close).toMatch(/cache_reads=3200/);
    expect(close).toMatch(/cache_creates=0/);
    // error_class field MUST be absent on success paths
    expect(close).not.toMatch(/error_class=/);
    logSpy.mockRestore();
  });

  it('emits conversation_close with error_class=api_error when runner returns api_error', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(
      apiErrorResult('Anthropic 503', {
        cacheStats: { reads: 0, creates: 5600 },
        promptSource: 'db',
      }),
    );

    await runV2AgentInBackground(BASE_INPUT);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const close = lines.find((l) => l.includes('event=conversation_close'));
    expect(close).toBeDefined();
    expect(close).toMatch(/stop=api_error/);
    expect(close).toMatch(/chunks=0/);
    expect(close).toMatch(/reply_sent=false/);
    expect(close).toMatch(/error_class=api_error/);
    expect(close).toMatch(/cache_creates=5600/);
    logSpy.mockRestore();
  });

  it('emits conversation_close with prompt_source=fallback when runner used the hardcoded template', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(
      endTurnResult('hello', { promptSource: 'fallback' }),
    );

    await runV2AgentInBackground(BASE_INPUT);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const close = lines.find((l) => l.includes('event=conversation_close'));
    expect(close).toBeDefined();
    expect(close).toMatch(/prompt_source=fallback/);
    logSpy.mockRestore();
  });

  it('emits reply_sent=false when sendSms fails on EVERY chunk (defensive — runner returned text but transport dropped it)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockResolvedValueOnce(endTurnResult('hi'));
    sendSmsMock.mockResolvedValueOnce({ success: false, error: 'Twilio down' });

    await runV2AgentInBackground(BASE_INPUT);

    const lines = logSpy.mock.calls.map((c) => String(c[0]));
    const close = lines.find((l) => l.includes('event=conversation_close'));
    expect(close).toBeDefined();
    // chunks=1 (we ATTEMPTED to send one chunk) but reply_sent=false
    // (Twilio rejected it, so the customer didn't actually receive it).
    expect(close).toMatch(/chunks=1/);
    expect(close).toMatch(/reply_sent=false/);
    logSpy.mockRestore();
  });

  it('dispatch_thrown branch emits TWO error lines (dispatch_thrown + conversation_close) to keep close-line at 11-field cap', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    runSmsAiV2AgentMock.mockRejectedValueOnce(new Error('runner boom'));

    await runV2AgentInBackground(BASE_INPUT);

    const lines = errorSpy.mock.calls.map((c) => String(c[0]));
    const dispatchLine = lines.find((l) => l.includes('event=dispatch_thrown'));
    const closeLine = lines.find((l) => l.includes('event=conversation_close'));

    // First line carries the error message (kept off conversation_close to
    // respect the 11-field cap).
    expect(dispatchLine).toBeDefined();
    expect(dispatchLine).toMatch(/error_class=dispatch_thrown/);
    expect(dispatchLine).toMatch(/runner boom/);

    // Second line is the canonical conversation_close — operator's uniform
    // grep target regardless of outcome.
    expect(closeLine).toBeDefined();
    expect(closeLine).toMatch(/stop=dispatch_thrown/);
    expect(closeLine).toMatch(/reply_sent=false/);
    expect(closeLine).toMatch(/error_class=dispatch_thrown/);
    errorSpy.mockRestore();
  });
});
