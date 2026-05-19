/**
 * POST /api/pos/promotions/available — coupon enforcement mode pinning.
 *
 * Cross-consumer drift was the user-visible symptom of the JSONB double-
 * encoding bug: this consumer previously read `business_settings.value`
 * raw and treated `'"hard"'` (the post-bug deserialized JS shape) as a
 * no-op enum value because `'"hard"' === 'hard'` is false. The helper
 * `evaluateCouponTargeting` then fell through to soft-mode behavior and
 * returned a warning instead of failing closed — hard-restricted coupons
 * appeared in the eligible list under hard mode.
 *
 * Post-fix this route reads through `getCouponEnforcementMode` which
 * defensively unwraps either form. Tests pin three combinations:
 *   1. hard mode + clean row → restricted coupon excluded
 *   2. hard mode + legacy double-encoded row → restricted coupon excluded
 *      (this is the bug-fix proof point)
 *   3. soft mode + either row shape → restricted coupon included with warning
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
  campaign_id?: string | null;
  auto_apply?: boolean;
  max_uses?: number | null;
  use_count?: number;
  condition_logic?: 'and' | 'or';
  requires_product_ids?: string[];
  requires_service_ids?: string[];
  requires_product_category_ids?: string[];
  requires_service_category_ids?: string[];
  coupon_rewards: Array<{
    discount_type: 'free' | 'percentage' | 'flat';
    discount_value: number;
    applies_to: 'order' | 'product' | 'service' | null;
    max_discount?: number | null;
    target_product_id?: string | null;
    target_service_id?: string | null;
    target_product_category_id?: string | null;
    target_service_category_id?: string | null;
  }>;
}

interface Customer {
  id: string;
  tags: string[];
  customer_type: string | null;
  visit_count: number;
}

const state = {
  coupons: [] as Coupon[],
  customer: null as Customer | null,
  enforcementValue: null as unknown,
};

vi.mock('@/lib/pos/api-auth', () => ({
  authenticatePosRequest: async () => ({
    employee_id: 'e-1',
    role: 'cashier',
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'coupons') {
        return {
          select: () => ({
            eq: () => ({
              or: () => Promise.resolve({ data: state.coupons, error: null }),
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
                  data: state.customer
                    ? {
                        id: state.customer.id,
                        tags: state.customer.tags,
                        customer_type: state.customer.customer_type,
                        visit_count: state.customer.visit_count,
                      }
                    : null,
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === 'business_settings') {
        // This is what the helper reads.
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
      // Any other table (products/services/categories) returns empty;
      // tests don't exercise the resolveMissingItems path.
      return {
        select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
  }),
}));

import { POST } from '../route';

function req(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/pos/promotions/available', {
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
    auto_apply: false,
    use_count: 0,
    coupon_rewards: [
      {
        discount_type: 'percentage',
        discount_value: 10,
        applies_to: 'order',
      },
    ],
  };
}

beforeEach(() => {
  state.coupons = [];
  state.customer = null;
  state.enforcementValue = null;
});

describe('POST /promotions/available — hard mode excludes type-restricted coupons (clean DB row)', () => {
  it('hard mode + non-enthusiast customer: enthusiast-only coupon is excluded', async () => {
    state.enforcementValue = 'hard';
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'detailer', // not enthusiast
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(0);
    expect(json.data.for_you).toHaveLength(0);
    expect(json.data.upsell).toHaveLength(0);
  });

  it('hard mode + matching customer: enthusiast-only coupon is included', async () => {
    state.enforcementValue = 'hard';
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'enthusiast',
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(1);
    expect(json.data.eligible[0].code).toBe('ENTH10');
  });
});

describe('POST /promotions/available — hard mode excludes type-restricted coupons (LEGACY double-encoded row)', () => {
  it('hard mode stored as `"hard"` (double-encoded): enthusiast-only coupon still excluded', async () => {
    // This is the bug-fix proof point. Pre-fix this consumer read `'"hard"'`
    // raw and treated it as soft, so the coupon was incorrectly included.
    state.enforcementValue = '"hard"';
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'detailer',
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(0);
    expect(json.data.for_you).toHaveLength(0);
    expect(json.data.upsell).toHaveLength(0);
  });
});

describe('POST /promotions/available — soft mode includes type-restricted coupons with warning', () => {
  it('soft mode + non-enthusiast customer: enthusiast-only coupon is included with warning', async () => {
    state.enforcementValue = 'soft';
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'detailer',
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(1);
    expect(json.data.eligible[0].code).toBe('ENTH10');
    expect(json.data.eligible[0].warning).toMatch(/intended for Enthusiast/);
  });

  it('soft mode stored as `"soft"` (double-encoded): same inclusion + warning', async () => {
    state.enforcementValue = '"soft"';
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'detailer',
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(1);
    expect(json.data.eligible[0].warning).toMatch(/intended for Enthusiast/);
  });

  it('mode row missing (defaults to soft): enthusiast-only coupon is included with warning', async () => {
    state.enforcementValue = null;
    state.coupons = [buildEnthusiastOnlyCoupon()];
    state.customer = {
      id: 'cust-1',
      tags: [],
      customer_type: 'detailer',
      visit_count: 3,
    };

    const res = await POST(req({ customer_id: 'cust-1', items: [], subtotal: 100 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.eligible).toHaveLength(1);
    expect(json.data.eligible[0].warning).toMatch(/intended for Enthusiast/);
  });
});
