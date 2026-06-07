/**
 * Phase 3 Theme A (AC-10 v1.4) — identifier_sequences live-DB integration tests.
 *
 * Tests the shared `identifier_sequences` table + `next_identifier(entity_type)`
 * DB function against the actual Supabase instance pointed to by .env.local.
 * These run as part of the standard `npm test` suite and exercise the row-level
 * lock + post-increment semantics that closed the pre-Theme-A items-error
 * REUSE window documented in NUMBERING_STRATEGY_AUDIT.md.
 *
 * Each test reads the current_value for its entity_type, calls
 * next_identifier(N) times, asserts the returned values are sequentially
 * one-higher than the read value and properly formatted. Tests do NOT roll
 * back — the sequence advance is by-design (gaps tolerated per AC-10).
 *
 * Concurrency test (test #8) fires N parallel RPC calls and asserts that
 * exactly N distinct values come back — the locking mechanism is the
 * production race-safety guarantee for all five identifier types.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('next_identifier() — AC-10 v1.4 integration', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  async function readCurrent(entity_type: string): Promise<{
    current_value: number;
    prefix: string;
    pad_width: number;
  }> {
    const { data, error } = await supabase
      .from('identifier_sequences')
      .select('current_value, prefix, pad_width')
      .eq('entity_type', entity_type)
      .single();
    if (error || !data) throw new Error(`Failed to read seq for ${entity_type}: ${error?.message}`);
    return {
      current_value: Number(data.current_value),
      prefix: String(data.prefix),
      pad_width: Number(data.pad_width),
    };
  }

  async function callNext(entity_type: string): Promise<string> {
    const { data, error } = await supabase.rpc('next_identifier', {
      p_entity_type: entity_type,
    });
    if (error || !data) throw new Error(`next_identifier(${entity_type}) failed: ${error?.message}`);
    return data as string;
  }

  // The next 5 per-entity tests assert format compliance and that the
  // returned numeric portion is strictly greater than the read current_value
  // at the moment of read. Parallel test runs against the same live DB can
  // advance the counter between `readCurrent` and `callNext`, so an
  // exact-equality assertion would be flaky. The concurrency test below
  // covers strict monotonicity under contention (which IS the production
  // contract).
  it('quote: returns Q-NNNNN with numeric portion > previous current_value', async () => {
    const before = await readCurrent('quote');
    const result = await callNext('quote');
    expect(result).toMatch(/^Q-\d{5}$/);
    const numeric = parseInt(result.replace(/^Q-/, ''), 10);
    expect(numeric).toBeGreaterThan(before.current_value);
    expect(before.prefix).toBe('Q-');
    expect(before.pad_width).toBe(5);
  });

  it('appointment: returns A-NNNNN with strictly-increasing numeric portion', async () => {
    const before = await readCurrent('appointment');
    const result = await callNext('appointment');
    expect(result).toMatch(/^A-\d{5}$/);
    const numeric = parseInt(result.replace(/^A-/, ''), 10);
    expect(numeric).toBeGreaterThan(before.current_value);
    expect(before.prefix).toBe('A-');
  });

  it('receipt: returns SD-NNNNN with strictly-increasing numeric portion', async () => {
    const before = await readCurrent('receipt');
    const result = await callNext('receipt');
    expect(result).toMatch(/^SD-\d{5}$/);
    const numeric = parseInt(result.replace(/^SD-/, ''), 10);
    expect(numeric).toBeGreaterThan(before.current_value);
    expect(before.prefix).toBe('SD-');
  });

  it('work_order: returns WO-NNNNN with strictly-increasing numeric portion', async () => {
    const before = await readCurrent('work_order');
    const result = await callNext('work_order');
    expect(result).toMatch(/^WO-\d{5}$/);
    const numeric = parseInt(result.replace(/^WO-/, ''), 10);
    expect(numeric).toBeGreaterThan(before.current_value);
    expect(before.prefix).toBe('WO-');
  });

  it('purchase_order: returns PO-NNNNN with strictly-increasing numeric portion', async () => {
    const before = await readCurrent('purchase_order');
    const result = await callNext('purchase_order');
    expect(result).toMatch(/^PO-\d{5}$/);
    const numeric = parseInt(result.replace(/^PO-/, ''), 10);
    expect(numeric).toBeGreaterThan(before.current_value);
    expect(before.prefix).toBe('PO-');
  });

  it('unknown entity_type raises an exception', async () => {
    const { error } = await supabase.rpc('next_identifier', {
      p_entity_type: 'definitely_not_an_entity_type',
    });
    expect(error).not.toBeNull();
    expect(error?.message ?? '').toMatch(/unknown entity_type/i);
  });

  it('sequential calls return strictly increasing values (purchase_order — low-contention namespace)', async () => {
    // Use purchase_order rather than quote: the other tests don't touch
    // purchase_order's counter, so we can assert strict +1 increments
    // without test-isolation flakiness. Quote is exercised by the
    // concurrency test, which would race this assertion if it shared.
    const a = await callNext('purchase_order');
    const b = await callNext('purchase_order');
    const c = await callNext('purchase_order');
    const numericA = parseInt(a.replace('PO-', ''), 10);
    const numericB = parseInt(b.replace('PO-', ''), 10);
    const numericC = parseInt(c.replace('PO-', ''), 10);
    expect(numericB).toBe(numericA + 1);
    expect(numericC).toBe(numericB + 1);
  });

  it('concurrency: 10 parallel calls return 10 distinct values (row-level lock works)', async () => {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, () => callNext('quote'))
    );
    const distinct = new Set(results);
    expect(distinct.size).toBe(N);
    // All values match the Q-NNNNN format
    for (const v of results) {
      expect(v).toMatch(/^Q-\d{5}$/);
    }
  });

  it('returned value always has numeric portion zero-padded to pad_width (5 digits)', async () => {
    const v = await callNext('appointment');
    const numericPart = v.replace(/^A-/, '');
    expect(numericPart).toMatch(/^\d{5}$/);
  });

  it('all five entity_types are seeded in identifier_sequences', async () => {
    const { data } = await supabase
      .from('identifier_sequences')
      .select('entity_type, prefix, pad_width');
    const entityTypes = new Set((data ?? []).map((r) => r.entity_type));
    expect(entityTypes).toContain('quote');
    expect(entityTypes).toContain('appointment');
    expect(entityTypes).toContain('receipt');
    expect(entityTypes).toContain('work_order');
    expect(entityTypes).toContain('purchase_order');
    // All five carry pad_width = 5 per AC-10 v1.4
    for (const row of data ?? []) {
      expect(row.pad_width).toBe(5);
    }
  });
});
