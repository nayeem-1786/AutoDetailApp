/**
 * Phase 3 Theme A (AC-10 v1.4) — generator wrapper unit tests.
 *
 * Pre-Theme-A: each generator hand-rolled its read-max + format-and-return
 * logic (γ pattern) or relied on a BEFORE INSERT trigger (β pattern). Post-
 * Theme-A: every generator is a thin wrapper around `supabase.rpc(
 * 'next_identifier', { p_entity_type })`. These tests pin the wrapper
 * shape:
 *
 *   - the wrapper calls the RPC with the correct entity_type
 *   - it returns the RPC's data verbatim when the RPC succeeds
 *   - it throws when the RPC errors or returns no data
 *
 * The actual race-safety + format-correctness guarantees are tested
 * against the live DB in `identifier-sequences.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

import { generateQuoteNumber } from '../quote-number';
import { generateOrderNumber } from '../order-number';
import { generateReceiptNumber } from '../receipt-number';
import { generatePoNumber } from '../po-number';
import { generateAppointmentNumber } from '../appointment-number';

function mkRpcClient(impl: (entity_type: string) => Promise<{ data: unknown; error: unknown }>) {
  return {
    rpc: vi.fn(async (_name: string, args: { p_entity_type: string }) => impl(args.p_entity_type)),
  };
}

describe('Theme A generator wrappers', () => {
  it('generateQuoteNumber: calls rpc with p_entity_type=quote and returns data', async () => {
    const client = mkRpcClient(async () => ({ data: `Q-10001`, error: null }));
    const result = await generateQuoteNumber(client as never);
    expect(result).toBe('Q-10001');
    expect(client.rpc).toHaveBeenCalledWith('next_identifier', { p_entity_type: 'quote' });
  });

  it('generateOrderNumber: calls rpc with p_entity_type=work_order', async () => {
    const client = mkRpcClient(async () => ({ data: 'WO-10043', error: null }));
    const result = await generateOrderNumber(client as never);
    expect(result).toBe('WO-10043');
    expect(client.rpc).toHaveBeenCalledWith('next_identifier', { p_entity_type: 'work_order' });
  });

  it('generateReceiptNumber: calls rpc with p_entity_type=receipt', async () => {
    const client = mkRpcClient(async () => ({ data: 'SD-06366', error: null }));
    const result = await generateReceiptNumber(client as never);
    expect(result).toBe('SD-06366');
    expect(client.rpc).toHaveBeenCalledWith('next_identifier', { p_entity_type: 'receipt' });
  });

  it('generatePoNumber: calls rpc with p_entity_type=purchase_order', async () => {
    const client = mkRpcClient(async () => ({ data: 'PO-10001', error: null }));
    const result = await generatePoNumber(client as never);
    expect(result).toBe('PO-10001');
    expect(client.rpc).toHaveBeenCalledWith('next_identifier', { p_entity_type: 'purchase_order' });
  });

  it('generateAppointmentNumber: calls rpc with p_entity_type=appointment', async () => {
    const client = mkRpcClient(async () => ({ data: 'A-10036', error: null }));
    const result = await generateAppointmentNumber(client as never);
    expect(result).toBe('A-10036');
    expect(client.rpc).toHaveBeenCalledWith('next_identifier', { p_entity_type: 'appointment' });
  });

  it('generators throw on rpc error', async () => {
    const client = mkRpcClient(async () => ({ data: null, error: { message: 'boom' } }));
    await expect(generateQuoteNumber(client as never)).rejects.toThrow(/Failed to generate quote_number.*boom/);
    await expect(generateOrderNumber(client as never)).rejects.toThrow(/Failed to generate order_number.*boom/);
    await expect(generateReceiptNumber(client as never)).rejects.toThrow(/Failed to generate receipt_number.*boom/);
    await expect(generatePoNumber(client as never)).rejects.toThrow(/Failed to generate po_number.*boom/);
    await expect(generateAppointmentNumber(client as never)).rejects.toThrow(/Failed to generate appointment_number.*boom/);
  });

  it('generators throw on null data without error', async () => {
    const client = mkRpcClient(async () => ({ data: null, error: null }));
    await expect(generateQuoteNumber(client as never)).rejects.toThrow(/no value returned/);
  });
});
