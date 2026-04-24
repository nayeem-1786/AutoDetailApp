import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------
// Mock layers
// -----------------------------------------------------------------------

interface AdjustmentRow {
  id?: string;
  product_id: string;
  quantity_change: number;
  reference_type?: string;
  reason?: string;
  created_at?: string;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
}

const state = {
  featureEnabled: true as boolean,
  employee: { id: 'emp-1' } as { id: string } | null,
  permissionDenied: null as { status: number } | null,
  count: null as { id: string; status: string; committed_at: string | null; section_label: string | null } | null,
  countError: null as { message: string } | null,
  originalAdjustments: [] as AdjustmentRow[],
  driftRows: [] as AdjustmentRow[],
  products: [] as ProductRow[],
};

vi.mock('@/lib/utils/feature-flags', () => ({
  isFeatureEnabled: async () => state.featureEnabled,
}));

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: state.permissionDenied.status,
        })
      : null,
}));

// Thenable query builder — records which path the route took and resolves
// against seeded state.
function buildQuery(table: string, callKind: 'originals' | 'drift' | 'products' | 'count') {
  const thenableResolve = () => {
    if (callKind === 'count') {
      return { data: state.count, error: state.countError };
    }
    if (table === 'stock_adjustments' && callKind === 'originals') {
      return { data: state.originalAdjustments, error: null };
    }
    if (table === 'stock_adjustments' && callKind === 'drift') {
      return { data: state.driftRows, error: null };
    }
    if (table === 'products') {
      return { data: state.products, error: null };
    }
    return { data: null, error: null };
  };

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    gt: () => chain,
    in: () => chain,
    not: () => chain,
    single: async () => thenableResolve(),
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(thenableResolve()).then(onFulfilled),
  };
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      // Determine which query by side-effect tracking: count lookup uses
      // .single(); originals/drift use .not(...).not(...) on stock_adjustments.
      // Route order is: count → originals → drift → products.
      const step = trackStep(table);
      return buildQuery(table, step);
    },
  }),
}));

let stepCounter = 0;
function trackStep(table: string): 'originals' | 'drift' | 'products' | 'count' {
  if (table === 'stock_counts') return 'count';
  if (table === 'products') return 'products';
  // stock_adjustments: first call = originals, second = drift
  stepCounter += 1;
  return stepCounter === 1 ? 'originals' : 'drift';
}

// Imported AFTER mocks.
import { GET } from '../[id]/revert-preview/route';

function req(): NextRequest {
  return new NextRequest(
    'http://localhost/api/admin/inventory/counts/count-1/revert-preview'
  );
}

const params = { params: Promise.resolve({ id: 'count-1' }) };

beforeEach(() => {
  state.featureEnabled = true;
  state.employee = { id: 'emp-1' };
  state.permissionDenied = null;
  state.count = {
    id: 'count-1',
    status: 'committed',
    section_label: 'Shelf A',
    committed_at: '2026-04-20T10:00:00Z',
  };
  state.countError = null;
  state.originalAdjustments = [];
  state.driftRows = [];
  state.products = [];
  stepCounter = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/admin/inventory/counts/[id]/revert-preview', () => {
  it('returns 401 when unauthenticated', async () => {
    state.employee = null;
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
  });

  it('returns 403 when feature flag is disabled', async () => {
    state.featureEnabled = false;
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
  });

  it('returns 403 when permission denied', async () => {
    state.permissionDenied = { status: 403 };
    const res = await GET(req(), params);
    expect(res.status).toBe(403);
  });

  it('returns 404 when count does not exist', async () => {
    state.count = null;
    state.countError = { message: 'Not found' };
    const res = await GET(req(), params);
    expect(res.status).toBe(404);
  });

  it('returns revertable=false when count is not committed', async () => {
    state.count = {
      id: 'count-1',
      status: 'active',
      section_label: 'Shelf A',
      committed_at: null,
    };
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revertable).toBe(false);
    expect(json.reason).toMatch(/active/);
  });

  it('returns clean preview when count is committed with no drift', async () => {
    state.originalAdjustments = [
      { product_id: 'p1', quantity_change: 3 },
      { product_id: 'p2', quantity_change: -1 },
    ];
    state.driftRows = [];
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revertable).toBe(true);
    expect(json.reversals_count).toBe(2);
    expect(json.original_products).toBe(2);
    expect(json.has_drift).toBe(false);
    expect(json.drift_adjustments).toBe(0);
    expect(json.drift_products).toBe(0);
    expect(json.top_drifted).toEqual([]);
  });

  it('returns drift preview with top drifted products', async () => {
    state.originalAdjustments = [
      { product_id: 'p1', quantity_change: 3 },
      { product_id: 'p2', quantity_change: -1 },
    ];
    state.driftRows = [
      { id: 'a1', product_id: 'p1', quantity_change: -1, reference_type: 'transaction' },
      { id: 'a2', product_id: 'p1', quantity_change: -1, reference_type: 'transaction' },
      { id: 'a3', product_id: 'p2', quantity_change: 2, reference_type: 'purchase_order' },
    ];
    state.products = [
      { id: 'p1', name: 'Widget A', sku: 'W-A' },
      { id: 'p2', name: 'Widget B', sku: 'W-B' },
    ];
    const res = await GET(req(), params);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.has_drift).toBe(true);
    expect(json.drift_adjustments).toBe(3);
    expect(json.drift_products).toBe(2);
    expect(json.top_drifted).toHaveLength(2);
    // p1 has 2 drift rows → ranked first.
    expect(json.top_drifted[0].product_id).toBe('p1');
    expect(json.top_drifted[0].adjustment_count).toBe(2);
    expect(json.top_drifted[0].net_change).toBe(-2);
    expect(json.top_drifted[1].product_id).toBe('p2');
    expect(json.top_drifted[1].adjustment_count).toBe(1);
    expect(json.top_drifted[1].net_change).toBe(2);
  });
});
