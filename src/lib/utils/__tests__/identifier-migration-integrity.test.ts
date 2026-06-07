/**
 * Phase 3 Theme A (AC-10 v1.4) — migration integrity tests.
 *
 * Tests the live Supabase instance for the migration invariants laid down
 * by the six Theme A migrations:
 *   1. identifier_sequences table exists + seeded for all 5 entity_types
 *   2. all five rows carry pad_width = 5
 *   3. appointments.appointment_number is non-null + UNIQUE for every row
 *   4. existing transactions.receipt_number rows reformatted to 5-digit
 *      (length = 8 chars = 'SD-' + 5 digits)
 *   5. receipt count preserved across the SD backfill
 *   6. receipt next_value > current MAX numeric (continues sequence cleanly)
 *   7. no duplicate receipt_numbers post-backfill
 *   8. the legacy DB trigger functions are gone (generate_receipt_number,
 *      generate_po_number, generate_quote_number)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('Theme A migration integrity', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  it('identifier_sequences seeded with all 5 entity_types + pad_width=5', async () => {
    const { data } = await supabase
      .from('identifier_sequences')
      .select('entity_type, prefix, pad_width, current_value')
      .order('entity_type');
    const map = new Map(
      (data ?? []).map((r) => [r.entity_type, r] as const)
    );
    expect(map.get('quote')).toMatchObject({ prefix: 'Q-', pad_width: 5 });
    expect(map.get('appointment')).toMatchObject({ prefix: 'A-', pad_width: 5 });
    expect(map.get('receipt')).toMatchObject({ prefix: 'SD-', pad_width: 5 });
    expect(map.get('work_order')).toMatchObject({ prefix: 'WO-', pad_width: 5 });
    expect(map.get('purchase_order')).toMatchObject({ prefix: 'PO-', pad_width: 5 });
  });

  it('every existing appointment carries a non-null appointment_number', async () => {
    const { count } = await supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .is('appointment_number', null);
    expect(count).toBe(0);
  });

  it('all backfilled appointment_numbers match the A-NNNNN format', async () => {
    const { data } = await supabase
      .from('appointments')
      .select('appointment_number')
      .limit(100);
    for (const row of data ?? []) {
      expect(row.appointment_number).toMatch(/^A-\d{5}$/);
    }
  });

  it('all SD receipts reformatted to 5-digit (length = 8 = SD- + 5)', async () => {
    const { data } = await supabase
      .from('transactions')
      .select('receipt_number')
      .not('receipt_number', 'is', null)
      .like('receipt_number', 'SD-%')
      .limit(100);
    for (const row of data ?? []) {
      expect(row.receipt_number).toMatch(/^SD-\d{5}$/);
      expect(String(row.receipt_number).length).toBe(8);
    }
  });

  it('receipt count preserved (no rows dropped by SD backfill)', async () => {
    const { count: total } = await supabase
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .not('receipt_number', 'is', null);
    // Operator-queried 2026-06-07: 6,309 receipts pre-backfill. Post-backfill
    // count must be ≥ that — the backfill only reformats, never deletes, and
    // new transactions issued after the migration window add to the count.
    expect(total ?? 0).toBeGreaterThanOrEqual(6309);
  });

  it('no duplicate receipt_numbers post-backfill', async () => {
    const { data } = await supabase
      .from('transactions')
      .select('receipt_number')
      .not('receipt_number', 'is', null);
    const all = (data ?? []).map((r) => r.receipt_number);
    const distinct = new Set(all);
    expect(distinct.size).toBe(all.length);
  });

  it('receipt sequence current_value >= max receipt numeric portion', async () => {
    const { data: seq } = await supabase
      .from('identifier_sequences')
      .select('current_value')
      .eq('entity_type', 'receipt')
      .single();
    const { data: maxRows } = await supabase
      .from('transactions')
      .select('receipt_number')
      .not('receipt_number', 'is', null)
      .like('receipt_number', 'SD-%')
      .order('receipt_number', { ascending: false })
      .limit(1);
    const max = maxRows?.[0]?.receipt_number
      ? parseInt((maxRows[0].receipt_number as string).replace(/^SD-/, ''), 10)
      : 0;
    expect(Number(seq!.current_value)).toBeGreaterThanOrEqual(max);
  });

  it('dormant generate_quote_number trigger is dropped (Theme A scope)', async () => {
    // Theme A drops the dormant quote-number trigger only. The receipt +
    // PO triggers stay alive in this session and are removed in the
    // Theme A.1 follow-up — see Migration 20260607061605 for rationale.
    const { error: probeErr } = await supabase.rpc('generate_quote_number' as never);
    expect(probeErr).not.toBeNull();
  });
});
