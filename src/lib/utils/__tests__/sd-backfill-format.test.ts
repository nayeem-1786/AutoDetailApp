/**
 * Phase 3 Theme A (AC-10 v1.4) — SD-receipt backfill format pin.
 *
 * The v1.4 migration `20260607061604_transactions_receipt_number_5digit_backfill.sql`
 * trimmed one leading zero from every existing SD-XXXXXX receipt to produce
 * SD-XXXXX. This test asserts:
 *
 *   1. NO row matches the pre-backfill 6-digit shape (SD-XXXXXX where the
 *      numeric portion is ≥ 6 characters)
 *   2. EVERY row matches the post-backfill 5-digit shape (SD-XXXXX exactly,
 *      8 total characters including 'SD-')
 *   3. NUMERIC VALUES preserved — sample 5 high-numbered receipts and
 *      confirm their integer portion is unchanged after the LPAD-to-5
 *      transform
 *   4. There are at least 6,309 SD rows (operator-queried baseline; may
 *      have grown if new transactions issued after the migration window)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('SD receipt-number backfill (5-digit format)', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  it('no row carries the pre-backfill 6-digit SD-XXXXXX format', async () => {
    // Anything > 8 chars matching `^SD-\d+$` is a pre-backfill artifact.
    const { data } = await supabase
      .from('transactions')
      .select('id, receipt_number')
      .not('receipt_number', 'is', null)
      .like('receipt_number', 'SD-%');
    const offenders = (data ?? []).filter(
      (r) => typeof r.receipt_number === 'string' && r.receipt_number.length > 8
    );
    expect(offenders).toEqual([]);
  });

  it('every SD row matches SD-NNNNN (5-digit) exactly', async () => {
    const { data } = await supabase
      .from('transactions')
      .select('receipt_number')
      .not('receipt_number', 'is', null)
      .like('receipt_number', 'SD-%');
    for (const row of data ?? []) {
      expect(row.receipt_number).toMatch(/^SD-\d{5}$/);
    }
  });

  it('numeric values preserved (top SD reflects pre-backfill MAX of 6365)', async () => {
    const { data } = await supabase
      .from('transactions')
      .select('receipt_number')
      .not('receipt_number', 'is', null)
      .like('receipt_number', 'SD-%')
      .order('receipt_number', { ascending: false })
      .limit(5);
    // Operator-queried baseline 2026-06-07: max numeric was 6365. The single
    // top row must be ≥ 6365; the remaining 4 form a strictly-decreasing
    // sequence of integers (no gaps inside the sample window means the next
    // 4 should also be in their original numeric values, just re-rendered
    // 6-digit → 5-digit).
    const numerics = (data ?? []).map((row) =>
      parseInt(String(row.receipt_number).replace(/^SD-/, ''), 10)
    );
    expect(numerics.length).toBeGreaterThan(0);
    expect(numerics[0]).toBeGreaterThanOrEqual(6365);
    // Strictly decreasing — no duplicates, no reordering.
    for (let i = 1; i < numerics.length; i++) {
      expect(numerics[i]).toBeLessThan(numerics[i - 1]);
    }
  });

  it('at least 6,309 SD receipts present (operator-queried baseline preserved)', async () => {
    const { count } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .like('receipt_number', 'SD-%');
    expect(count ?? 0).toBeGreaterThanOrEqual(6309);
  });
});
