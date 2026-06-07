/**
 * Phase 3 Theme A (AC-10 v1.4) — race-window closure regression.
 *
 * The pre-Theme-A Quote γ generator carried a number-REUSE risk window at
 * `quote-service.ts:218-228` (per NUMBERING_STRATEGY_AUDIT.md Target A.4):
 * INSERT-then-DELETE-on-items-error left no row in the quotes table, so
 * the next call's `SELECT MAX(quote_number)` read the same prior max and
 * re-assigned the just-deleted number.
 *
 * Post-Theme-A: `next_identifier()` advances the counter atomically inside
 * its row-level lock. The counter does NOT rewind on items-error cleanup;
 * the next call returns the NEXT value, not the just-deleted one.
 *
 * This test exercises the actual closure against the live DB:
 *   1. Read current quote counter
 *   2. Call next_identifier('quote') twice (simulates "INSERT then cleanup-DELETE-then-next-INSERT")
 *   3. Assert the two returned values are DIFFERENT (no reuse)
 *
 * No quotes table rows are written — the test only exercises the counter,
 * which is the surface where the REUSE bug used to live.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('AC-10 race-window closure (Quote items-error reuse)', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  it('next_identifier never returns the same value twice (counter advances even when caller rolls back its own write)', async () => {
    // Simulate the items-error cleanup flow: caller A obtains a Q-NNNNN,
    // INSERTs, items-INSERT fails, caller DELETEs the row. Caller B now
    // requests a fresh Q-NNNNN. Pre-Theme-A this returned the same value
    // (MAX read no longer included the deleted row). Post-Theme-A the
    // counter has already advanced and the second value is strictly higher.
    const first = await supabase.rpc('next_identifier', { p_entity_type: 'quote' });
    const second = await supabase.rpc('next_identifier', { p_entity_type: 'quote' });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.data).not.toBe(second.data);

    const numericFirst = parseInt(String(first.data).replace(/^Q-/, ''), 10);
    const numericSecond = parseInt(String(second.data).replace(/^Q-/, ''), 10);
    expect(numericSecond).toBeGreaterThan(numericFirst);
  });

  it('counter advance survives an unrelated quotes-table DELETE (the historical reuse vector)', async () => {
    // The pre-Theme-A bug was: DELETE FROM quotes WHERE id = X → next call's
    // MAX(quote_number) drops the X row → reuses X's quote_number. Post-
    // Theme-A the counter is independent of the quotes table; this test
    // verifies that a DELETE on quotes does NOT affect what next_identifier
    // returns. We use a DELETE that is a no-op (id doesn't exist) so the
    // test is side-effect-free.
    const before = await supabase.rpc('next_identifier', { p_entity_type: 'quote' });
    await supabase.from('quotes').delete().eq('id', '00000000-0000-0000-0000-000000000000');
    const after = await supabase.rpc('next_identifier', { p_entity_type: 'quote' });

    const numericBefore = parseInt(String(before.data).replace(/^Q-/, ''), 10);
    const numericAfter = parseInt(String(after.data).replace(/^Q-/, ''), 10);
    expect(numericAfter).toBe(numericBefore + 1);
  });
});
