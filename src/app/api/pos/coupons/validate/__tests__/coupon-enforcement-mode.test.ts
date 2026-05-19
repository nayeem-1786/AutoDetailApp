/**
 * POST /api/pos/coupons/validate — coupon enforcement mode pinning.
 *
 * This consumer was previously CORRECT-BY-COMPENSATION via an inline
 * `replace(/"/g, '')` strip. Post-fix it reads through the canonical
 * helper, which behaves identically for clean values and correctly for
 * legacy double-encoded values too. Tests pin the apply-time gate
 * behavior under each mode and each row shape.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

interface Coupon {
  id: string;
  code: string;
  name: string;
  status: string;
  expires_at: string | null;
  target_customer_type: string | null;
  customer_id: string | null;
  customer_tags?: string[] | null;
  tag_match_mode?: 'any' | 'all' | null;
  max_uses?: number | null;
  use_count?: number;
  is_single_use?: boolean;
  condition_logic?: 'and' | 'or';
  min_purchase?: number | null;
  max_customer_visits?: number | null;
  requires_product_ids?: string[];
  requires_service_ids?: string[];
  requires_product_category_ids?: string[];
  requires_service_category_ids?: string[];
  coupon_rewards: Array<{
    discount_type: 'free' | 'percentage' | 'flat';
    discount_value: number;
    applies_to: 'order' | 'product' | 'service' | null;
  }>;
}

const state = {
  coupon: null as Coupon | null,
  customerType: null as string | null,
  enforcementValue: null as unknown,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => ({
    employee_id: 'e-1',
    role: 'cashier',
  }),
}));

vi.mock('@/lib/pos/check-permission', () => ({
  checkPosPermission: async () => true,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'coupons') {
        return {
          select: () => ({
            ilike: () => ({
              single: () =>
                Promise.resolve({ data: state.coupon, error: state.coupon ? null : { message: 'not found' } }),
            }),
          }),
        };
      }
      if (table === 'customers') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { customer_type: state.customerType, tags: [], visit_count: 0 },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'business_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { value: state.enforcementValue },
                  error: null,
                }),
            }),
          }),
        };
      }
      // Other tables (transactions, products, services, categories) — return empty
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
          in: () => Promise.resolve({ data: [], error: null }),
        }),
      };
    },
  }),
}));

import { POST } from '../route';

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/pos/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildEnthusiastOnlyCoupon(): Coupon {
  return {
    id: 'c-1',
    code: 'ENTH10',
    name: 'Enthusiasts only',
    status: 'active',
    expires_at: null,
    target_customer_type: 'enthusiast',
    customer_id: null,
    customer_tags: null,
    auto_apply: false as unknown as undefined,
    use_count: 0,
    is_single_use: false,
    coupon_rewards: [
      {
        discount_type: 'percentage',
        discount_value: 10,
        applies_to: 'order',
      },
    ],
  } as Coupon;
}

beforeEach(() => {
  state.coupon = null;
  state.customerType = null;
  state.enforcementValue = null;
});

describe('POST /coupons/validate — hard mode rejects type mismatch (clean row)', () => {
  it('hard + customer is detailer (coupon enthusiast-only): 400 rejected', async () => {
    state.enforcementValue = 'hard';
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'detailer';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Enthusiast/);
  });

  it('hard + customer is enthusiast (matches): 200 success', async () => {
    state.enforcementValue = 'hard';
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'enthusiast';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.code).toBe('ENTH10');
    expect(json.data.warning).toBeUndefined();
  });
});

describe('POST /coupons/validate — hard mode rejects type mismatch (LEGACY double-encoded row)', () => {
  it('hard stored as `"hard"`: still rejects mismatched customer (behavior unchanged via helper)', async () => {
    state.enforcementValue = '"hard"';
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'detailer';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Enthusiast/);
  });
});

describe('POST /coupons/validate — soft mode allows with warning', () => {
  it('soft + customer is detailer: 200 with warning', async () => {
    state.enforcementValue = 'soft';
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'detailer';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.code).toBe('ENTH10');
    expect(json.data.warning).toMatch(/intended for Enthusiast/);
  });

  it('soft stored as `"soft"` (double-encoded): same allow + warning', async () => {
    state.enforcementValue = '"soft"';
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'detailer';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.warning).toMatch(/intended for Enthusiast/);
  });

  it('mode row missing (defaults to soft): allow with warning', async () => {
    state.enforcementValue = null;
    state.coupon = buildEnthusiastOnlyCoupon();
    state.customerType = 'detailer';

    const res = await POST(req({ code: 'ENTH10', subtotal: 100, customer_id: 'cust-1' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.warning).toMatch(/intended for Enthusiast/);
  });
});
