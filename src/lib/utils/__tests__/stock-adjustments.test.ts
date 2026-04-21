import { describe, it, expect, vi } from 'vitest';
import { logStockAdjustment } from '../stock-adjustments';
import type { StockAdjustmentInput, AdjustmentType, ReferenceType } from '../stock-adjustments';

function createMockSupabase(returnValue: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(returnValue);
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, insert, select, single } as unknown as {
    from: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

describe('logStockAdjustment', () => {
  it('inserts a row with all required fields and returns ok: true', async () => {
    const mock = createMockSupabase({ data: { id: 'adj-123' }, error: null });

    const result = await logStockAdjustment({
      supabase: { from: mock.from } as unknown as StockAdjustmentInput['supabase'],
      product_id: 'prod-1',
      adjustment_type: 'sold',
      quantity_change: -2,
      quantity_before: 10,
      quantity_after: 8,
      reason: 'Sold via POS',
      reference_id: 'tx-1',
      reference_type: 'transaction',
      created_by: 'emp-1',
      unit_cost: 5.99,
    });

    expect(result).toEqual({ ok: true, id: 'adj-123' });
    expect(mock.from).toHaveBeenCalledWith('stock_adjustments');
    expect(mock.insert).toHaveBeenCalledWith({
      product_id: 'prod-1',
      adjustment_type: 'sold',
      quantity_change: -2,
      quantity_before: 10,
      quantity_after: 8,
      reason: 'Sold via POS',
      reference_id: 'tx-1',
      reference_type: 'transaction',
      created_by: 'emp-1',
      unit_cost: 5.99,
    });
  });

  it('handles optional fields (reference_id null, unit_cost null)', async () => {
    const mock = createMockSupabase({ data: { id: 'adj-456' }, error: null });

    const result = await logStockAdjustment({
      supabase: { from: mock.from } as unknown as StockAdjustmentInput['supabase'],
      product_id: 'prod-2',
      adjustment_type: 'manual',
      quantity_change: 5,
      quantity_before: 3,
      quantity_after: 8,
      reason: 'Recount correction',
      created_by: 'emp-2',
    });

    expect(result).toEqual({ ok: true, id: 'adj-456' });
    expect(mock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        reference_id: null,
        reference_type: null,
        unit_cost: null,
      })
    );
  });

  it('returns ok: false with error when supabase returns error', async () => {
    const mock = createMockSupabase({ data: null, error: { message: 'constraint violation' } });
    // Suppress console.error in test
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await logStockAdjustment({
      supabase: { from: mock.from } as unknown as StockAdjustmentInput['supabase'],
      product_id: 'prod-3',
      adjustment_type: 'shop_use',
      quantity_change: -1,
      quantity_before: 5,
      quantity_after: 4,
      reason: 'Shop use',
      created_by: 'emp-3',
    });

    expect(result).toEqual({ ok: false, error: 'constraint violation' });
  });

  it.each([
    ['manual', null],
    ['received', 'purchase_order'],
    ['sold', 'transaction'],
    ['returned', 'refund'],
    ['damaged', 'refund'],
    ['recount', null],
    ['shop_use', 'shop_use'],
    ['customer_retained', 'refund'],
  ] as [AdjustmentType, ReferenceType | null][])(
    'accepts adjustment_type=%s with reference_type=%s',
    async (adjType, refType) => {
      const mock = createMockSupabase({ data: { id: `adj-${adjType}` }, error: null });

      const result = await logStockAdjustment({
        supabase: { from: mock.from } as unknown as StockAdjustmentInput['supabase'],
        product_id: 'prod-x',
        adjustment_type: adjType,
        quantity_change: adjType === 'received' ? 5 : adjType === 'manual' ? 3 : -1,
        quantity_before: 10,
        quantity_after: adjType === 'received' ? 15 : adjType === 'manual' ? 13 : 9,
        reason: `Test ${adjType}`,
        reference_type: refType,
        created_by: 'emp-x',
      });

      expect(result.ok).toBe(true);
      expect(mock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          adjustment_type: adjType,
          reference_type: refType,
        })
      );
    }
  );
});
