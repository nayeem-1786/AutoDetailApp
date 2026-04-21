import { describe, it, expect, vi } from 'vitest';
import { lookupProductByScanCode } from '../barcode-lookup';
import type { SupabaseClient } from '@supabase/supabase-js';

interface QueryState {
  orArg?: string;
  eqArgs: [string, unknown][];
  response: { data: unknown; error: unknown };
}

function mockSupabase(response: { data: unknown; error: unknown }): {
  client: SupabaseClient;
  state: QueryState;
} {
  const state: QueryState = { eqArgs: [], response };
  const client = {
    from: vi.fn((_table: string) => {
      const builder = {
        select: vi.fn(() => builder),
        or: vi.fn((arg: string) => {
          state.orArg = arg;
          return builder;
        }),
        eq: vi.fn((col: string, val: unknown) => {
          state.eqArgs.push([col, val]);
          return builder;
        }),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => state.response),
      };
      return builder;
    }),
  } as unknown as SupabaseClient;
  return { client, state };
}

describe('lookupProductByScanCode', () => {
  it('returns the product when a barcode match is found', async () => {
    const mockProduct = { id: 'p-1', name: 'Foo', barcode: '123', sku: 'SKU-X', is_active: true };
    const { client, state } = mockSupabase({ data: mockProduct, error: null });

    const result = await lookupProductByScanCode(client, '123');

    expect(result).toEqual(mockProduct);
    // Must query with OR across barcode + sku (the canonical fix).
    expect(state.orArg).toBe('barcode.eq.123,sku.eq.123');
    // is_active filter must be applied.
    expect(state.eqArgs).toContainEqual(['is_active', true]);
  });

  it('returns the product when a SKU match is found (barcode column null)', async () => {
    // The exact bug Session 41C fixes: scan code lives in sku, not barcode.
    const mockProduct = { id: 'p-2', name: 'Bottle Holder', barcode: null, sku: '1234119', is_active: true };
    const { client, state } = mockSupabase({ data: mockProduct, error: null });

    const result = await lookupProductByScanCode(client, '1234119');

    expect(result).toEqual(mockProduct);
    expect(state.orArg).toBe('barcode.eq.1234119,sku.eq.1234119');
  });

  it('returns null when no product matches', async () => {
    const { client } = mockSupabase({ data: null, error: null });
    const result = await lookupProductByScanCode(client, 'nonexistent');
    expect(result).toBeNull();
  });

  it('applies is_active = true filter (inactive products excluded)', async () => {
    const { client, state } = mockSupabase({ data: null, error: null });
    await lookupProductByScanCode(client, 'x');
    const activeFilter = state.eqArgs.find(([col]) => col === 'is_active');
    expect(activeFilter).toEqual(['is_active', true]);
  });

  it('returns null for empty / whitespace input without querying', async () => {
    const { client, state } = mockSupabase({ data: { id: 'should-not-be-returned' }, error: null });

    expect(await lookupProductByScanCode(client, '')).toBeNull();
    expect(await lookupProductByScanCode(client, '   ')).toBeNull();
    // The builder was never invoked — no filters were set.
    expect(state.orArg).toBeUndefined();
    expect(state.eqArgs).toHaveLength(0);
  });

  it('trims whitespace before querying', async () => {
    const { client, state } = mockSupabase({ data: null, error: null });
    await lookupProductByScanCode(client, '  SD-006217  ');
    expect(state.orArg).toBe('barcode.eq.SD-006217,sku.eq.SD-006217');
  });

  it('throws when the underlying query returns an error', async () => {
    const { client } = mockSupabase({ data: null, error: { message: 'db down' } });
    await expect(lookupProductByScanCode(client, 'x')).rejects.toEqual({ message: 'db down' });
  });
});
