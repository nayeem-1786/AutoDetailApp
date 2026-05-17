import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, waitFor } from '@testing-library/react';

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-i regression — pins the POS Jobs `handleCheckout` flow.
//
// When `checkout-items` returns a `coupon_code` (whether sourced from the
// linked quote or — post-fix — from the appointment fallback), the page MUST:
//   1. Restore the ticket with coupon: null first (defensive reset).
//   2. POST to /api/pos/coupons/validate with the items + customer.
//   3. Dispatch SET_COUPON with the validated discount.
//
// The reducer's SET_COUPON case is replace-based (not additive), and
// RESTORE_TICKET zeroes coupon ahead of the dispatch — so re-running checkout
// for the same job is idempotent and cannot double-discount.
// ──────────────────────────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const fetchCalls: FetchCall[] = [];
const fetchResponses: Record<
  string,
  { ok: boolean; status?: number; json: () => Promise<unknown> }
> = {};

const dispatchSpy = vi.fn();

vi.mock('../../context/ticket-context', () => ({
  useTicket: () => ({
    ticket: {},
    dispatch: dispatchSpy,
  }),
}));

vi.mock('../../lib/pos-fetch', () => ({
  posFetch: vi.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    const resp = fetchResponses[url];
    if (!resp) {
      return { ok: false, status: 500, json: async () => ({ error: 'no mock' }) };
    }
    return resp;
  }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushSpy }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/pos/jobs',
}));

// Stub the child components so we can invoke `onCheckout` from a test trigger
// without rendering the real (data-heavy) queue / detail panes.
vi.mock('../components/job-queue', () => ({
  JobQueue: (props: { onCheckout: (jobId: string) => void }) => (
    <button data-testid="trigger-checkout" onClick={() => props.onCheckout('job-1')}>
      checkout
    </button>
  ),
}));

vi.mock('../components/job-detail', () => ({
  JobDetail: () => <div data-testid="job-detail" />,
}));

import JobsPage from '../page';

beforeEach(() => {
  fetchCalls.length = 0;
  for (const key of Object.keys(fetchResponses)) delete fetchResponses[key];
  dispatchSpy.mockReset();
  pushSpy.mockReset();
});

afterEach(() => {
  cleanup();
});

function buildCheckoutItemsResponse(
  couponCode: string | null,
  modifiers?: {
    coupon_discount?: number | null;
    loyalty_points_redeemed?: number | null;
    loyalty_discount?: number | null;
    manual_discount_value?: number | null;
    manual_discount_label?: string | null;
  }
) {
  return {
    ok: true,
    json: async () => ({
      data: {
        job_id: 'job-1',
        customer_id: 'cust-1',
        vehicle_id: 'veh-1',
        customer: {
          id: 'cust-1',
          first_name: 'Jane',
          last_name: 'Doe',
          phone: null,
          email: null,
          customer_type: null,
          tags: null,
        },
        vehicle: {
          id: 'veh-1',
          year: 2024,
          make: 'Tesla',
          model: 'Model 3',
          color: 'White',
          size_class: 'sedan',
        },
        items: [
          {
            item_type: 'service',
            service_id: 'svc-1',
            item_name: 'Detail',
            quantity: 1,
            unit_price: 200,
            is_taxable: false,
          },
        ],
        coupon_code: couponCode,
        coupon_discount: modifiers?.coupon_discount ?? null,
        loyalty_points_redeemed: modifiers?.loyalty_points_redeemed ?? null,
        loyalty_discount: modifiers?.loyalty_discount ?? null,
        manual_discount_value: modifiers?.manual_discount_value ?? null,
        manual_discount_label: modifiers?.manual_discount_label ?? null,
        deposit_amount: 0,
        deposit_date: null,
        prior_payments: [],
        prior_payments_total_cents: 0,
        status: 'in_progress',
      },
    }),
  };
}

describe('JobsPage handleCheckout — coupon re-validation (Item 15g Layer 15g-i)', () => {
  it('validates and dispatches SET_COUPON when checkout-items returns a coupon_code', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse('SAVE25');
    fetchResponses['/api/pos/coupons/validate'] = {
      ok: true,
      json: async () => ({
        data: { id: 'coup-1', code: 'SAVE25', total_discount: 25 },
      }),
    };

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(fetchCalls.some((c) => c.url === '/api/pos/coupons/validate')).toBe(true);
    });

    // Validate request body shape — code + customer + items must be present.
    const validateCall = fetchCalls.find((c) => c.url === '/api/pos/coupons/validate');
    expect(validateCall).toBeDefined();
    const body = JSON.parse(validateCall!.init!.body as string);
    expect(body.code).toBe('SAVE25');
    expect(body.customer_id).toBe('cust-1');
    expect(Array.isArray(body.items)).toBe(true);

    // RESTORE_TICKET fires first with coupon: null (defensive reset), then
    // SET_COUPON fires with the validated discount. Order matters.
    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(dispatchedTypes).toContain('RESTORE_TICKET');
    expect(dispatchedTypes).toContain('SET_COUPON');

    const restoreCall = dispatchSpy.mock.calls.find((c) => c[0].type === 'RESTORE_TICKET');
    expect(restoreCall![0].state.coupon).toBeNull();

    const couponCall = dispatchSpy.mock.calls.find((c) => c[0].type === 'SET_COUPON');
    expect(couponCall![0].coupon).toEqual({
      id: 'coup-1',
      code: 'SAVE25',
      discount: 25,
    });
  });

  it('skips coupon validation when checkout-items returns no coupon_code', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(null);

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/pos');
    });

    expect(fetchCalls.some((c) => c.url === '/api/pos/coupons/validate')).toBe(false);
    const dispatchedTypes = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(dispatchedTypes).toContain('RESTORE_TICKET');
    expect(dispatchedTypes).not.toContain('SET_COUPON');
  });

  it('re-runs cleanly on a second checkout — RESTORE_TICKET resets coupon to null each time (idempotency)', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse('SAVE25');
    fetchResponses['/api/pos/coupons/validate'] = {
      ok: true,
      json: async () => ({
        data: { id: 'coup-1', code: 'SAVE25', total_discount: 25 },
      }),
    };

    const { getByTestId } = render(<JobsPage />);

    // First checkout
    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_COUPON')).toHaveLength(1)
    );

    // Second checkout — should not stack a second discount on top of the first;
    // each pass is fully reset → re-applied.
    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_COUPON')).toHaveLength(2)
    );

    const restoreCalls = dispatchSpy.mock.calls.filter((c) => c[0].type === 'RESTORE_TICKET');
    expect(restoreCalls).toHaveLength(2);
    for (const call of restoreCalls) {
      expect(call[0].state.coupon).toBeNull();
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Item 15g Layer 15g-iii — handleCheckout now dispatches loyalty + manual-
// discount alongside the existing coupon flow. The dispatches are
// idempotent: RESTORE_TICKET zeroes all three slots first, so re-running
// checkout for the same job cannot accumulate.
// ──────────────────────────────────────────────────────────────────────────────

describe('JobsPage handleCheckout — modifier hydration (Item 15g Layer 15g-iii)', () => {
  it('dispatches SET_LOYALTY_REDEEM when checkout-items returns loyalty fields', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      null,
      { loyalty_points_redeemed: 100, loyalty_discount: 10 }
    );

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/pos');
    });

    const loyaltyCall = dispatchSpy.mock.calls.find(
      (c) => c[0].type === 'SET_LOYALTY_REDEEM'
    );
    expect(loyaltyCall).toBeDefined();
    expect(loyaltyCall![0]).toEqual({
      type: 'SET_LOYALTY_REDEEM',
      points: 100,
      discount: 10,
    });
  });

  it('dispatches APPLY_MANUAL_DISCOUNT when checkout-items returns a manual discount', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      null,
      { manual_discount_value: 15, manual_discount_label: 'Manager goodwill' }
    );

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      expect(pushSpy).toHaveBeenCalledWith('/pos');
    });

    const manualCall = dispatchSpy.mock.calls.find(
      (c) => c[0].type === 'APPLY_MANUAL_DISCOUNT'
    );
    expect(manualCall).toBeDefined();
    expect(manualCall![0]).toEqual({
      type: 'APPLY_MANUAL_DISCOUNT',
      discountType: 'dollar',
      value: 15,
      label: 'Manager goodwill',
    });
  });

  it('falls back to "Manual discount" label when none is provided', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      null,
      { manual_discount_value: 20, manual_discount_label: null }
    );

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/pos'));

    const manualCall = dispatchSpy.mock.calls.find(
      (c) => c[0].type === 'APPLY_MANUAL_DISCOUNT'
    );
    expect(manualCall![0].label).toBe('Manual discount');
  });

  it('dispatches all three modifiers when present (coupon + loyalty + manual)', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      'SAVE25',
      {
        coupon_discount: 25,
        loyalty_points_redeemed: 100,
        loyalty_discount: 10,
        manual_discount_value: 15,
        manual_discount_label: 'Goodwill',
      }
    );
    fetchResponses['/api/pos/coupons/validate'] = {
      ok: true,
      json: async () => ({
        data: { id: 'coup-1', code: 'SAVE25', total_discount: 25 },
      }),
    };

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => {
      const types = dispatchSpy.mock.calls.map((c) => c[0].type);
      expect(types).toContain('SET_LOYALTY_REDEEM');
      expect(types).toContain('APPLY_MANUAL_DISCOUNT');
      expect(types).toContain('SET_COUPON');
    });
  });

  it('skips loyalty + manual dispatches when both modifiers are zero/null', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      null,
      {
        loyalty_points_redeemed: 0,
        loyalty_discount: 0,
        manual_discount_value: 0,
      }
    );

    const { getByTestId } = render(<JobsPage />);
    fireEvent.click(getByTestId('trigger-checkout'));

    await waitFor(() => expect(pushSpy).toHaveBeenCalledWith('/pos'));

    const types = dispatchSpy.mock.calls.map((c) => c[0].type);
    expect(types).not.toContain('SET_LOYALTY_REDEEM');
    expect(types).not.toContain('APPLY_MANUAL_DISCOUNT');
  });

  it('is idempotent — re-running checkout dispatches each modifier exactly once per pass', async () => {
    fetchResponses['/api/pos/jobs/job-1/checkout-items'] = buildCheckoutItemsResponse(
      null,
      {
        loyalty_points_redeemed: 100,
        loyalty_discount: 10,
        manual_discount_value: 15,
        manual_discount_label: 'Goodwill',
      }
    );

    const { getByTestId } = render(<JobsPage />);

    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(
        dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_LOYALTY_REDEEM')
      ).toHaveLength(1)
    );

    fireEvent.click(getByTestId('trigger-checkout'));
    await waitFor(() =>
      expect(
        dispatchSpy.mock.calls.filter((c) => c[0].type === 'SET_LOYALTY_REDEEM')
      ).toHaveLength(2)
    );

    // RESTORE_TICKET fires before each modifier dispatch and zeroes the
    // slots so the dispatches never stack.
    const restoreCalls = dispatchSpy.mock.calls.filter(
      (c) => c[0].type === 'RESTORE_TICKET'
    );
    expect(restoreCalls).toHaveLength(2);
    for (const call of restoreCalls) {
      expect(call[0].state.loyaltyPointsToRedeem).toBe(0);
      expect(call[0].state.loyaltyDiscount).toBe(0);
      expect(call[0].state.manualDiscount).toBeNull();
    }
  });
});
