/**
 * Phase 3 Theme A.1 — legacy identifier triggers dropped (live-DB integration).
 *
 * Pins the post-Theme-A.1 invariants:
 *   1. The legacy PL/pgSQL functions `generate_receipt_number()` and
 *      `generate_po_number()` no longer exist in the database — directly
 *      invoking them through PostgREST returns the "function not found"
 *      signal (`PGRST202`).
 *   2. Identifier generation via `next_identifier('receipt')` and
 *      `next_identifier('purchase_order')` continues to issue values at
 *      the unified 5-digit namespace.
 *
 * Sibling to `identifier-sequences.test.ts` (the live-DB tests for the
 * Theme A mechanism); this file tests the absence/removal contract that
 * the A.1 follow-up migration enforces. DROP TRIGGER cascades down from
 * DROP FUNCTION in PostgreSQL, so verifying the function is gone proves
 * the trigger is gone too.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasCreds = Boolean(url && key);
const describeIfCreds = hasCreds ? describe : describe.skip;

describeIfCreds('Theme A.1 — legacy identifier triggers dropped', () => {
  let supabase: SupabaseClient;

  beforeAll(() => {
    supabase = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  /**
   * Returns true if PostgREST reports the function as missing
   * (HTTP 404 with code `PGRST202`). Used to assert the legacy
   * trigger functions were genuinely dropped from the database,
   * not just renamed or relocated.
   */
  async function functionMissing(name: string): Promise<boolean> {
    const { error } = await supabase.rpc(name as never);
    if (!error) return false;
    const code = (error as { code?: string }).code;
    return code === 'PGRST202';
  }

  it('generate_receipt_number() is no longer exposed (PGRST202)', async () => {
    expect(await functionMissing('generate_receipt_number')).toBe(true);
  });

  it('generate_po_number() is no longer exposed (PGRST202)', async () => {
    expect(await functionMissing('generate_po_number')).toBe(true);
  });

  it('next_identifier(receipt) continues to issue SD-NNNNN values', async () => {
    const { data, error } = await supabase.rpc('next_identifier', {
      p_entity_type: 'receipt',
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    expect(data as string).toMatch(/^SD-\d{5}$/);
  });

  it('next_identifier(purchase_order) continues to issue PO-NNNNN values', async () => {
    const { data, error } = await supabase.rpc('next_identifier', {
      p_entity_type: 'purchase_order',
    });
    expect(error).toBeNull();
    expect(typeof data).toBe('string');
    expect(data as string).toMatch(/^PO-\d{5}$/);
  });
});
