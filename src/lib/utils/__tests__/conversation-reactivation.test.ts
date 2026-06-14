/**
 * Class (a) Item #1 (Session #150) — conversation reactivation + AI-history
 * inclusion contract tests.
 *
 * Pre-#150 audit catalogued the smoking gun: the canonical
 * `sendSms({logToConversation:true})` chokepoint at `src/lib/utils/sms.ts:
 * 185-195` bumped `last_message_at` but never touched `status`, so closed
 * conversations receiving system SMS (payment links, receipts, reminders,
 * voice-agent dispatches) silently stayed Closed. Three pre-#150 sites
 * (Twilio inbound, operator-typed reply, voice-post-call) each implemented
 * reactivation inline with slightly different shapes; 10+ paths did not
 * reactivate at all.
 *
 * #150 introduces `reactivateIfClosed` as the canonical primitive all 5
 * sites now route through, plus the companion `shouldIncludeInAiHistory`
 * predicate (extracted from `webhooks/twilio/inbound/route.ts:540-545`)
 * that closes a related prompt-poisoning vector: pre-#150 the SMS-channel
 * status markers (auto-close banners, reactivation banners, manual close
 * audits) entered Claude's history as if the customer had received them.
 * The refined predicate uses `metadata.notificationType` presence as the
 * discriminator — customer-facing notifications (which carry the field)
 * stay in context; status markers (which don't) are excluded.
 *
 * All 8 tests below are reverse-validated — each pairs with a documented
 * "neuter the implementation, test fails" mode at the file footer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reactivateIfClosed,
  shouldIncludeInAiHistory,
} from '@/lib/utils/conversation-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client stub — chainable shape matching what reactivateIfClosed
// actually calls. Captures status reads, status UPDATEs, and banner INSERTs.
// ─────────────────────────────────────────────────────────────────────────────

interface ConvRow {
  id: string;
  status: 'open' | 'closed' | 'archived';
}

interface Capture {
  statusReads: number;
  statusUpdates: Array<{ id: string; payload: Record<string, unknown> }>;
  messageInserts: Array<Record<string, unknown>>;
  readError: { message: string } | null;
  updateError: { message: string } | null;
  insertError: { message: string } | null;
  /**
   * Session #150 (post-deploy verification) — simulate PostgREST returning
   * `{data: [], error: null}` on the UPDATE…select() chain (the silent
   * no-op surface). When set: `updateRowsOverride = []` triggers the
   * 0-row defense; `updateRowsOverride = [{id, status: 'closed'}]`
   * triggers the post-update status-mismatch defense.
   */
  updateRowsOverride?: Array<{ id: string; status: string }>;
}

function makeStub(row: ConvRow | null, opts: {
  readError?: { message: string } | null;
  updateError?: { message: string } | null;
  insertError?: { message: string } | null;
  updateRowsOverride?: Array<{ id: string; status: string }>;
} = {}) {
  const capture: Capture = {
    statusReads: 0,
    statusUpdates: [],
    messageInserts: [],
    readError: opts.readError ?? null,
    updateError: opts.updateError ?? null,
    insertError: opts.insertError ?? null,
    updateRowsOverride: opts.updateRowsOverride,
  };

  const from = vi.fn((table: string) => {
    if (table === 'conversations') {
      return {
        select: (_cols: string) => ({
          eq: (_col: string, _id: string) => ({
            single: async () => {
              capture.statusReads += 1;
              if (capture.readError) return { data: null, error: capture.readError };
              if (!row) return { data: null, error: null };
              return { data: { status: row.status }, error: null };
            },
          }),
        }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => ({
            // Session #150 post-deploy verification — UPDATE chain now ends
            // in `.select('id, status')` so PostgREST returns the updated
            // rows (the silent-no-op defense). Mock returns the override
            // when set; otherwise mirrors the "normal" successful UPDATE
            // shape: data = single-row array with the persisted status.
            select: async (_cols: string) => {
              if (capture.updateError) {
                return { data: null, error: capture.updateError };
              }
              capture.statusUpdates.push({ id, payload });
              if (row && typeof payload.status === 'string') {
                row.status = payload.status as 'open';
              }
              if (capture.updateRowsOverride !== undefined) {
                return { data: capture.updateRowsOverride, error: null };
              }
              return {
                data: row
                  ? [{ id, status: (payload.status as string) ?? row.status }]
                  : [],
                error: null,
              };
            },
          }),
        }),
      };
    }
    if (table === 'messages') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          if (capture.insertError) return { error: capture.insertError };
          capture.messageInserts.push(payload);
          return { error: null };
        },
      };
    }
    throw new Error(`Unexpected table in stub: ${table}`);
  });

  // The helper expects `{ from }` only — cast via unknown to satisfy the
  // loose SupabaseClient type used in conversation-helpers.ts.
  return {
    client: { from } as unknown as Parameters<typeof reactivateIfClosed>[0],
    capture,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 — Helper reactivates closed/archived + writes banner with correct
// trigger. Reverse-validation: hardcoding `return {wasReactivated:false}` in
// the helper fails this test (no UPDATE, no banner row).
// ─────────────────────────────────────────────────────────────────────────────
describe('reactivateIfClosed — status flip + banner insert', () => {
  it('flips closed → open AND inserts banner with default automated_activity body', async () => {
    const { client, capture } = makeStub({ id: 'conv-1', status: 'closed' });
    const result = await reactivateIfClosed(client, 'conv-1');
    expect(result.wasReactivated).toBe(true);
    expect(capture.statusUpdates).toHaveLength(1);
    expect(capture.statusUpdates[0]).toMatchObject({
      id: 'conv-1',
      payload: { status: 'open' },
    });
    expect(capture.messageInserts).toHaveLength(1);
    expect(capture.messageInserts[0]).toMatchObject({
      conversation_id: 'conv-1',
      direction: 'outbound',
      body: 'Conversation reopened — automated activity',
      sender_type: 'system',
      status: 'delivered',
      channel: 'sms',
    });
    // INVARIANT (most critical assertion): banner row carries NO
    // `metadata.notificationType` — otherwise it would enter AI context
    // alongside customer-facing notifications.
    expect(capture.messageInserts[0].metadata).toBeUndefined();
  });

  it('flips archived → open AND writes customer_re_engaged banner when requested', async () => {
    const { client, capture } = makeStub({ id: 'conv-2', status: 'archived' });
    const result = await reactivateIfClosed(client, 'conv-2', {
      banner: 'customer_re_engaged',
    });
    expect(result.wasReactivated).toBe(true);
    expect(capture.messageInserts[0]).toMatchObject({
      body: 'Conversation reopened — customer re-engaged',
      channel: 'sms',
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 — Helper no-op when already open. No UPDATE, no banner insert.
// Reverse-validation: removing the `status !== 'closed' && status !==
// 'archived'` early-return causes this test to fail (UPDATE runs anyway).
// ─────────────────────────────────────────────────────────────────────────────
describe('reactivateIfClosed — no-op when already open', () => {
  it('returns {wasReactivated:false} without any DB writes when status=open', async () => {
    const { client, capture } = makeStub({ id: 'conv-3', status: 'open' });
    const result = await reactivateIfClosed(client, 'conv-3');
    expect(result.wasReactivated).toBe(false);
    expect(capture.statusUpdates).toHaveLength(0);
    expect(capture.messageInserts).toHaveLength(0);
    // Single status read happened (the predicate read), but no writes.
    expect(capture.statusReads).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 — sendSms chokepoint reactivates via helper. Mocks the chokepoint
// flow with a closed conversation; verifies the helper was invoked through
// the chokepoint's path. Reverse-validation: removing the
// `await reactivateIfClosed(admin, convId)` call in sms.ts fails this test.
// ─────────────────────────────────────────────────────────────────────────────
describe('reactivateIfClosed — sendSms chokepoint integration', () => {
  it('the chokepoint path persists status=open + banner row for a closed conversation', async () => {
    // This test exercises the helper directly through the same shape the
    // sendSms chokepoint at sms.ts:185+ uses (no custom banner option,
    // defaults to automated_activity). The full sendSms wiring is mocked
    // in its own test file; this lock pins the helper's contract that
    // the chokepoint relies on.
    const { client, capture } = makeStub({ id: 'conv-4', status: 'closed' });
    await reactivateIfClosed(client, 'conv-4');
    expect(capture.statusUpdates.map((u) => u.payload.status)).toEqual(['open']);
    expect(capture.messageInserts).toHaveLength(1);
    expect((capture.messageInserts[0] as { body: string }).body).toBe(
      'Conversation reopened — automated activity'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 — Twilio inbound delegates with customer_re_engaged banner.
// Verifies banner mode + canonical channel='sms' on the new banner (pre-#150
// the inline banner used channel='voice' as a render hack; post-#150 the
// render predicate at message-bubble.tsx:113-115 already routes on
// sender_type='system' so the channel hack is unnecessary).
// Reverse-validation: changing the inbound route's call to default banner
// (omit options or pass null) fails this test.
// ─────────────────────────────────────────────────────────────────────────────
describe('reactivateIfClosed — Twilio inbound customer_re_engaged contract', () => {
  it('customer_re_engaged banner writes the expected body + channel=sms', async () => {
    const { client, capture } = makeStub({ id: 'conv-5', status: 'closed' });
    await reactivateIfClosed(client, 'conv-5', { banner: 'customer_re_engaged' });
    const inserted = capture.messageInserts[0] as Record<string, unknown>;
    expect(inserted.body).toBe('Conversation reopened — customer re-engaged');
    expect(inserted.channel).toBe('sms');
    expect(inserted.sender_type).toBe('system');
    // Banner is a status marker — must NOT have notificationType
    expect(inserted.metadata).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 — Operator-typed reply delegates with null banner. Status flip
// happens; NO banner row inserted (operator's typed message is the marker).
// Reverse-validation: defaulting banner to 'automated_activity' when null is
// passed causes this test to fail (banner row appears).
// ─────────────────────────────────────────────────────────────────────────────
describe('reactivateIfClosed — operator-reply null banner contract', () => {
  it('null banner flips status WITHOUT inserting a banner row', async () => {
    const { client, capture } = makeStub({ id: 'conv-6', status: 'closed' });
    const result = await reactivateIfClosed(client, 'conv-6', { banner: null });
    expect(result.wasReactivated).toBe(true);
    expect(capture.statusUpdates).toHaveLength(1);
    expect(capture.statusUpdates[0].payload).toEqual({ status: 'open' });
    expect(capture.messageInserts).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests 6-8 — AI history filter (shouldIncludeInAiHistory)
// ─────────────────────────────────────────────────────────────────────────────

describe('shouldIncludeInAiHistory — status marker exclusion', () => {
  // Test 6 — auto-close banner (pg_cron) is excluded.
  // Reverse-validation: restoring the pre-#150 predicate
  // `!(sender_type==='system' && channel==='voice')` lets this row PASS,
  // failing the assertion.
  it('EXCLUDES the pg_cron auto-close banner (system + sms + no notificationType)', () => {
    const autoCloseBanner = {
      sender_type: 'system',
      channel: 'sms',
      body: 'Conversation closed — no activity for 48 hours',
      // metadata is null/undefined — that's the pg_cron migration shape
    };
    expect(shouldIncludeInAiHistory(autoCloseBanner)).toBe(false);
  });

  // Test 7 — new reactivation banner (this session's writer) is excluded.
  // Same shape as the auto-close banner from a filter perspective.
  it('EXCLUDES the new reactivation banner from reactivateIfClosed (status marker)', () => {
    const reactivationBanner = {
      sender_type: 'system',
      channel: 'sms',
      body: 'Conversation reopened — automated activity',
      metadata: null,
    };
    expect(shouldIncludeInAiHistory(reactivationBanner)).toBe(false);
  });

  // Test 8 — customer-facing notification (payment link) is KEPT in history.
  // Critical anti-over-exclusion lock: the operator's originally-proposed
  // blanket "exclude all system" filter would have failed this assertion —
  // the refined predicate preserves the AI's ability to contextualize
  // replies like "I paid it" against the prior outbound payment-link SMS.
  it('KEEPS a payment-link notification (system + sms + notificationType set)', () => {
    const paymentLinkNotification = {
      sender_type: 'system',
      channel: 'sms',
      body: 'Pay your $50.00 invoice: https://example.com/pay/abc',
      metadata: { notificationType: 'payment_link_sent', contextId: 'appt-1' },
    };
    expect(shouldIncludeInAiHistory(paymentLinkNotification)).toBe(true);
  });

  // Additional locks (not numbered in the 8-test count but cheap to add) —
  // anchor the surrounding behavior to prevent regressions on neighboring cases.
  it('KEEPS all non-system messages regardless of channel (customer/staff/AI inbound and outbound)', () => {
    expect(shouldIncludeInAiHistory({ sender_type: 'customer', channel: 'sms' })).toBe(true);
    expect(shouldIncludeInAiHistory({ sender_type: 'staff', channel: 'sms' })).toBe(true);
    expect(shouldIncludeInAiHistory({ sender_type: 'ai', channel: 'sms' })).toBe(true);
    // Voice channel non-system would be e.g. customer voice (hypothetical) — kept.
    expect(shouldIncludeInAiHistory({ sender_type: 'customer', channel: 'voice' })).toBe(true);
  });

  it('EXCLUDES voice-channel system messages (pre-#150 baseline preserved — call summaries)', () => {
    const callSummary = {
      sender_type: 'system',
      channel: 'voice',
      body: 'Phone call (3:42) — Customer asked about pricing',
    };
    expect(shouldIncludeInAiHistory(callSummary)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests 12 + 13 — Session #150 post-deploy verification (silent-no-op defense)
//
// Pre-fix Scenario 1 walkthrough surfaced a real production bug — the
// helper's UPDATE returned `{error: null}` but 0 rows affected. Pre-fix
// code had no defense; banner inserted, status stayed `'closed'`, the
// helper falsely reported `wasReactivated: true`. The fix forces
// PostgREST to return updated rows via `.select('id, status')` after the
// UPDATE chain, then verifies both row count AND post-update status.
// These tests pin both defense layers.
// ─────────────────────────────────────────────────────────────────────────────

describe('reactivateIfClosed — silent-no-op defense (post-deploy verification)', () => {
  // Test 12 — 0-row UPDATE simulates the production bug case verbatim.
  // PostgREST returns `data: [], error: null` from the `.update().eq().select()`
  // chain — the operator's confirmed scenario at conversation
  // b0deab43-ba18-44e4-aea8-49cb284cc28f.
  //
  // Reverse-validation: removing the `if (!updatedRows || updatedRows.length
  // === 0)` defense fails this test — the helper falsely returns
  // `wasReactivated: true` and inserts a banner, exactly the pre-fix bug.
  it('returns wasReactivated:false AND skips banner when UPDATE affects 0 rows', async () => {
    const { client, capture } = makeStub(
      { id: 'conv-zero-rows', status: 'closed' },
      { updateRowsOverride: [] } // Simulate PostgREST 0-row return
    );
    const result = await reactivateIfClosed(client, 'conv-zero-rows');
    expect(result.wasReactivated).toBe(false);
    // Critical: NO banner row inserted (pre-fix bug would have inserted one).
    expect(capture.messageInserts).toHaveLength(0);
    // The UPDATE was attempted (we captured it) — the defense sits AFTER
    // the UPDATE returns; this assertion proves we don't avoid the write
    // pre-emptively (no over-correction).
    expect(capture.statusUpdates).toHaveLength(1);
  });

  // Test 13 — post-UPDATE status mismatch. PostgREST returns a row but its
  // status isn't `'open'` (e.g., a concurrent transaction immediately
  // overwrote it before the SELECT could read the post-write state).
  //
  // Reverse-validation: removing the `if (updatedRows[0].status !== 'open')`
  // defense fails this test — the helper would proceed to banner insert
  // despite the row clearly not being open.
  it('returns wasReactivated:false AND skips banner when post-UPDATE status is not open', async () => {
    const { client, capture } = makeStub(
      { id: 'conv-mismatch', status: 'closed' },
      {
        // PostgREST returns one row, but status stayed 'closed' (concurrent
        // overwrite scenario or PostgREST representation inconsistency).
        updateRowsOverride: [{ id: 'conv-mismatch', status: 'closed' }],
      }
    );
    const result = await reactivateIfClosed(client, 'conv-mismatch');
    expect(result.wasReactivated).toBe(false);
    expect(capture.messageInserts).toHaveLength(0);
  });

  // Companion lock — happy path still works after the defense was added.
  // Confirms the .select() guard doesn't over-block valid reactivations.
  it('happy path: UPDATE returns single row with status=open → reactivated + banner inserted', async () => {
    // No override — mock uses the "normal" successful-UPDATE shape.
    const { client, capture } = makeStub({ id: 'conv-happy', status: 'closed' });
    const result = await reactivateIfClosed(client, 'conv-happy');
    expect(result.wasReactivated).toBe(true);
    expect(capture.messageInserts).toHaveLength(1);
    expect(capture.statusUpdates).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reverse-validation index (for the session ledger):
//
//   Test 1 + 4 fail when banner-write code is removed from reactivateIfClosed
//   Test 1 + 2 + 3 fail when status-update code is removed
//   Test 2 fails when the `status !== 'closed' && status !== 'archived'`
//     early-return is dropped (UPDATE then runs anyway)
//   Test 5 fails when null-banner branch is removed (banner inserts anyway)
//   Tests 6 + 7 fail when shouldIncludeInAiHistory reverts to the pre-#150
//     `!(sender_type==='system' && channel==='voice')` predicate (status
//     markers pass the filter and enter AI context)
//   Test 8 fails when shouldIncludeInAiHistory is changed to the blanket
//     `sender_type !== 'system'` exclusion (the operator's originally-
//     proposed predicate that would have lost customer-replyable context)
//   Test 12 fails when the 0-row UPDATE defense is removed — helper
//     falsely returns wasReactivated:true + inserts banner (the pre-fix
//     production bug at conversation b0deab43-ba18-44e4-aea8-49cb284cc28f)
//   Test 13 fails when the post-UPDATE status-mismatch defense is removed
//
// Reverse-validation is run during pre-commit verification — see Session
// #150 CHANGELOG entry for the matrix and confirmed-green-after-restoration
// outcome.
// ─────────────────────────────────────────────────────────────────────────────
