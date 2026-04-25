import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

// -----------------------------------------------------------------------------
// Mock state
// -----------------------------------------------------------------------------

interface Product { id: string; quantity_on_hand: number; cost_price: number | null; }
interface OrderItem { product_id: string | null; quantity: number; }

const state = {
  event: null as Record<string, unknown> | null,
  signatureValid: true,
  order: null as Record<string, unknown> | null,
  products: new Map<string, Product>(),
};

const capturedUpdates: Array<{ table: string; payload: Record<string, unknown>; eqValue: unknown }> = [];
const capturedInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

// -----------------------------------------------------------------------------
// Mocks
// -----------------------------------------------------------------------------

vi.mock('stripe', () => {
  function Stripe(this: unknown) {
    return {
      webhooks: {
        constructEvent: () => {
          if (!state.signatureValid) throw new Error('bad signature');
          return state.event;
        },
      },
    };
  }
  return { default: Stripe };
});

vi.mock('@/lib/utils/order-number', () => ({
  generateOrderNumber: async () => 'ORD-TEST-0001',
}));

vi.mock('@/lib/utils/email', () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock('@/lib/data/business', () => ({
  getBusinessInfo: async () => ({ name: 'Test Co', phone: '555', email: 'a@b.c' }),
}));

vi.mock('@/lib/utils/format', () => ({
  formatCurrency: (n: number) => `$${n.toFixed(2)}`,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => buildQuery(table),
  }),
}));

function buildQuery(table: string): Record<string, unknown> {
  return {
    select: (_cols: string) => ({
      eq: (_col: string, value: unknown) => ({
        single: async () => {
          if (table === 'orders') {
            return state.order ? { data: state.order, error: null } : { data: null, error: null };
          }
          if (table === 'products') {
            const p = state.products.get(value as string);
            return p ? { data: p, error: null } : { data: null, error: null };
          }
          return { data: null, error: null };
        },
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }),
    update: (payload: Record<string, unknown>) => ({
      eq: (_col: string, value: unknown) => {
        capturedUpdates.push({ table, payload, eqValue: value });
        if (table === 'products' && typeof payload.quantity_on_hand === 'number') {
          const p = state.products.get(value as string);
          if (p) p.quantity_on_hand = payload.quantity_on_hand;
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
        then: (resolve: (v: { data: null; error: null }) => unknown) =>
          resolve({ data: null, error: null }),
      };
    },
  };
}

// Imported AFTER mocks
import { POST } from '../route';

function req(headers: Record<string, string> = { 'stripe-signature': 'sig_ok' }): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body: '{}',
  });
}

beforeEach(() => {
  state.event = null;
  state.signatureValid = true;
  state.order = null;
  state.products = new Map();
  capturedUpdates.length = 0;
  capturedInserts.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe('POST /api/webhooks/stripe — payment_intent.succeeded', () => {
  it('decrements stock + writes one stock_adjustments row per product line, using SYSTEM_EMPLOYEE_ID', async () => {
    state.event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { order_id: 'order-1' }, latest_charge: 'ch_1' } },
    };
    state.order = {
      id: 'order-1',
      total: 5000,
      coupon_id: null,
      customer_id: null,
      order_items: [
        { product_id: 'prod-A', quantity: 3 } as OrderItem,
        { product_id: 'prod-B', quantity: 1 } as OrderItem,
      ],
      first_name: 'X', last_name: 'Y', email: 'x@y.z', subtotal: 5000, discount_amount: 0,
      tax_amount: 0, shipping_amount: 0, coupon_code: null, fulfillment_method: 'pickup', order_number: 'ORD-TEST-0001',
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 10, cost_price: 4.5 });
    state.products.set('prod-B', { id: 'prod-B', quantity_on_hand: 5, cost_price: null });

    const res = await POST(req());
    expect(res.status).toBe(200);

    // Stock decremented: prod-A 10→7, prod-B 5→4
    const productUpdates = capturedUpdates.filter((u) => u.table === 'products');
    expect(productUpdates).toHaveLength(2);
    expect(productUpdates[0]).toMatchObject({ eqValue: 'prod-A', payload: { quantity_on_hand: 7 } });
    expect(productUpdates[1]).toMatchObject({ eqValue: 'prod-B', payload: { quantity_on_hand: 4 } });

    // Audit rows for each product line
    const adj = capturedInserts.filter((i) => i.table === 'stock_adjustments');
    expect(adj).toHaveLength(2);
    expect(adj[0].payload).toMatchObject({
      product_id: 'prod-A',
      adjustment_type: 'sold',
      quantity_change: -3,
      quantity_before: 10,
      quantity_after: 7,
      reason: 'Online order paid',
      reference_id: 'order-1',
      reference_type: 'order',
      created_by: '00000000-0000-0000-0000-000000000001',
      unit_cost: 4.5,
    });
    expect(adj[1].payload).toMatchObject({
      product_id: 'prod-B',
      adjustment_type: 'sold',
      quantity_change: -1,
      quantity_before: 5,
      quantity_after: 4,
      created_by: '00000000-0000-0000-0000-000000000001',
      unit_cost: null,
    });
  });

  it('caps decrement at 0 (no negative qty) and reports the floored quantity_change', async () => {
    state.event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { order_id: 'order-1' } } },
    };
    state.order = {
      id: 'order-1', total: 1000, coupon_id: null, customer_id: null,
      order_items: [{ product_id: 'prod-A', quantity: 10 } as OrderItem],
      first_name: 'X', last_name: 'Y', email: 'x@y.z', subtotal: 1000, discount_amount: 0,
      tax_amount: 0, shipping_amount: 0, coupon_code: null, fulfillment_method: 'pickup', order_number: 'ORD-TEST-0001',
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 3, cost_price: null });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const productUpdates = capturedUpdates.filter((u) => u.table === 'products');
    expect(productUpdates[0].payload).toEqual({ quantity_on_hand: 0 });

    // qty_change is the actual delta (-3), not the requested delta (-10).
    // This is intentional: we record what we actually wrote.
    const adj = capturedInserts.filter((i) => i.table === 'stock_adjustments');
    expect(adj[0].payload).toMatchObject({
      quantity_change: -3,
      quantity_before: 3,
      quantity_after: 0,
    });
  });

  it('skips order_items with no product_id', async () => {
    state.event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { order_id: 'order-1' } } },
    };
    state.order = {
      id: 'order-1', total: 1000, coupon_id: null, customer_id: null,
      order_items: [
        { product_id: null, quantity: 1 } as OrderItem,
        { product_id: 'prod-A', quantity: 2 } as OrderItem,
      ],
      first_name: 'X', last_name: 'Y', email: 'x@y.z', subtotal: 1000, discount_amount: 0,
      tax_amount: 0, shipping_amount: 0, coupon_code: null, fulfillment_method: 'pickup', order_number: 'ORD-TEST-0001',
    };
    state.products.set('prod-A', { id: 'prod-A', quantity_on_hand: 5, cost_price: null });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(capturedUpdates.filter((u) => u.table === 'products')).toHaveLength(1);
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(1);
  });

  it('does nothing for booking-deposit PI (no order_id metadata)', async () => {
    state.event = {
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_1', metadata: { is_deposit: 'true' } } },
    };

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(capturedInserts.filter((i) => i.table === 'stock_adjustments')).toHaveLength(0);
    expect(capturedUpdates.filter((u) => u.table === 'products')).toHaveLength(0);
  });

  it('returns 400 on invalid signature', async () => {
    state.signatureValid = false;
    state.event = { type: 'payment_intent.succeeded', data: { object: {} } };
    const res = await POST(req());
    expect(res.status).toBe(400);
  });

  it('returns 400 when signature header is missing', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
