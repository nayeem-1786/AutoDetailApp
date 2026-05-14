import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------------
// Mock state (mutable per-test)
// -----------------------------------------------------------------------------

interface OrderItem {
  id: string;
  product_id: string | null;
  quantity: number;
}

interface Product {
  id: string;
  quantity_on_hand: number;
  cost_price: number | null;
}

const state = {
  employee: { id: 'emp-1', auth_user_id: 'auth-1', email: 'e@x.com', first_name: 'E', last_name: 'X' } as Record<string, unknown> | null,
  permissionDenied: null as { status: number } | null,
  order: null as Record<string, unknown> | null,
  products: new Map<string, Product>(),
  stripeRefundResult: { id: 're_test_123' } as { id: string } | null,
  stripeShouldThrow: false,
};

// Captured side effects
const capturedUpdates: Array<{ table: string; payload: Record<string, unknown>; eqColumn: string; eqValue: unknown }> = [];
const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('@/lib/auth/get-employee', () => ({
  getEmployeeFromSession: async () => state.employee,
}));

vi.mock('@/lib/auth/require-permission', () => ({
  requirePermission: async () =>
    state.permissionDenied
      ? new Response(JSON.stringify({ error: 'Forbidden' }), { status: state.permissionDenied.status })
      : null,
}));

vi.mock('@/lib/utils/order-emails', () => ({
  sendRefundEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/services/audit', () => ({
  logAudit: vi.fn(),
  getRequestIp: () => '127.0.0.1',
}));

// Stripe — only the refunds.create method is used.
vi.mock('stripe', () => {
  class StripeError extends Error {}
  function Stripe(this: unknown) {
    return {
      refunds: {
        create: async () => {
          if (state.stripeShouldThrow) throw new StripeError('Card declined');
          return state.stripeRefundResult;
        },
      },
    };
  }
  // expose static error class so the route's instanceof check works
  (Stripe as unknown as { errors: Record<string, unknown> }).errors = { StripeError };
  return { default: Stripe };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}));

function buildQuery(table: string): Record<string, unknown> {
  return {
    select: (_cols: string) => ({
      eq: (column: string, value: unknown) => ({
        single: async () => {
          if (table === 'orders') {
            return state.order
              ? { data: state.order, error: null }
              : { data: null, error: { message: 'not found' } };
          }
          if (table === 'products') {
            const prod = state.products.get(value as string);
            return prod ? { data: prod, error: null } : { data: null, error: null };
          }
          return { data: null, error: null };
        },
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: (column: string, value: unknown) => {
        capturedUpdates.push({ table, payload, eqColumn: column, eqValue: value });
        // Mutate local state for subsequent reads
        if (table === 'products' && typeof payload.quantity_on_hand === 'number') {
          const existing = state.products.get(value as string);
          if (existing) existing.quantity_on_hand = payload.quantity_on_hand;
        }
        return Promise.resolve({ data: null, error: null });
      },
    }),
    insert: (payload: Record<string, unknown>) => {
      capturedInserts.push({ table, payload });
      return {
        select: (_cols: string) => ({
          single: async () => ({ data: { id: `${table}-row-1` }, error: null }),
        }),
        // For inserts that don't chain .select() (order_events does this)
        then: (resolve: (v: { data: null; error: null }) => unknown) =>
          resolve({ data: null, error: null }),
      };
    },
  };
}

// Imported AFTER mocks
import { POST } from '../route';

function req(body: Record<string, unknown> = {}): NextRequest {
  return new NextRequest('http://localhost/api/admin/orders/order-1/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: 'order-1' }) };

beforeEach(() => {
  state.employee = { id: 'emp-1', auth_user_id: 'auth-1', email: 'e@x.com', first_name: 'E', last_name: 'X' };
  state.permissionDenied = null;
  state.order = null;
  state.products = new Map();
  state.stripeRefundResult = { id: 're_test_123' };
  state.stripeShouldThrow = false;
  capturedUpdates.length = 0;
  capturedInserts.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/admin/orders/[id]/refund', () => {
  it('full refund: restores stock for all items + writes one stock_adjustments row per product line', async () => {
    state.order = {
      id: 'order-1',
      total: 5000,
      payment_status: 'paid',
      stripe_payment_intent_id: 'pi_123',
      order_items: [
        { id: 'oi-1', product_id: 'prod-A', quantity: 2 } as OrderItem,
        { id: 'oi-2', product_id: 'prod-B', quantity: 5 } as OrderItem,
      ],
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 10, cost_price: 4.5 });
    state.products.set('prod-B', { id: 'prod-B', quantity_on_hand: 100, cost_price: null });

    const res = await POST(req({}), params); // no body.amount → full refund

    expect(res.status).toBe(200);

    // Stock updates: prod-A 10 → 12, prod-B 100 → 105
    const productUpdates = capturedUpdates.filter((u) => u.table === 'products');
    expect(productUpdates).toHaveLength(2);
    expect(productUpdates[0]).toMatchObject({ eqValue: 'prod-A', payload: { quantity_on_hand: 12 } });
    expect(productUpdates[1]).toMatchObject({ eqValue: 'prod-B', payload: { quantity_on_hand: 105 } });

    // Audit rows: one per product, with correct shape
    const adjustmentInserts = capturedInserts.filter((i) => i.table === 'stock_adjustments');
    expect(adjustmentInserts).toHaveLength(2);
    expect(adjustmentInserts[0].payload).toMatchObject({
      product_id: 'prod-A',
      adjustment_type: 'returned',
      quantity_change: 2,
      quantity_before: 10,
      quantity_after: 12,
      reference_id: 'order-1',
      reference_type: 'order',
      created_by: 'emp-1',
      unit_cost_cents: 450,
    });
    expect(adjustmentInserts[0].payload.reason).toContain('Stripe re_test_123');
    expect(adjustmentInserts[1].payload).toMatchObject({
      product_id: 'prod-B',
      adjustment_type: 'returned',
      quantity_change: 5,
      quantity_before: 100,
      quantity_after: 105,
      reference_type: 'order',
      unit_cost_cents: null,
    });

    // payment_status flipped to 'refunded'
    const orderUpdates = capturedUpdates.filter((u) => u.table === 'orders');
    expect(orderUpdates[0].payload).toEqual({ payment_status: 'refunded' });
  });

  it('partial refund: does NOT restore stock and writes NO stock_adjustments rows', async () => {
    state.order = {
      id: 'order-1',
      total: 5000,
      payment_status: 'paid',
      stripe_payment_intent_id: 'pi_123',
      order_items: [{ id: 'oi-1', product_id: 'prod-A', quantity: 2 } as OrderItem],
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 10, cost_price: 4.5 });

    const res = await POST(req({ amount: 1000 }), params); // $10 of $50

    expect(res.status).toBe(200);

    // No products updates
    expect(capturedUpdates.filter((u) => u.table === 'products')).toHaveLength(0);
    // No stock_adjustments inserts
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(0);
    // payment_status set to partially_refunded
    const orderUpdates = capturedUpdates.filter((u) => u.table === 'orders');
    expect(orderUpdates[0].payload).toEqual({ payment_status: 'partially_refunded' });
    // Local product state untouched
    expect(state.products.get('prod-A')!.quantity_on_hand).toBe(10);
  });

  it('full refund: skips order_items with no product_id', async () => {
    state.order = {
      id: 'order-1',
      total: 5000,
      payment_status: 'paid',
      stripe_payment_intent_id: 'pi_123',
      order_items: [
        { id: 'oi-1', product_id: null, quantity: 1 } as OrderItem,
        { id: 'oi-2', product_id: 'prod-A', quantity: 3 } as OrderItem,
      ],
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 5, cost_price: null });

    const res = await POST(req({}), params);

    expect(res.status).toBe(200);
    expect(capturedUpdates.filter((u) => u.table === 'products')).toHaveLength(1);
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(1);
  });

  it('returns 400 if order is already fully refunded', async () => {
    state.order = {
      id: 'order-1',
      total: 5000,
      payment_status: 'refunded',
      stripe_payment_intent_id: 'pi_123',
      order_items: [],
    };
    const res = await POST(req({}), params);
    expect(res.status).toBe(400);
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(0);
  });

  it('returns 500 on Stripe failure and writes nothing', async () => {
    state.order = {
      id: 'order-1',
      total: 5000,
      payment_status: 'paid',
      stripe_payment_intent_id: 'pi_123',
      order_items: [{ id: 'oi-1', product_id: 'prod-A', quantity: 1 } as OrderItem],
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 5, cost_price: null });
    state.stripeShouldThrow = true;

    const res = await POST(req({}), params);
    expect(res.status).toBe(500);
    expect(capturedUpdates.filter((u) => u.table === 'products')).toHaveLength(0);
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(0);
  });

  it('returns 401 when employee is not authenticated', async () => {
    state.employee = null;
    const res = await POST(req({}), params);
    expect(res.status).toBe(401);
  });
});
